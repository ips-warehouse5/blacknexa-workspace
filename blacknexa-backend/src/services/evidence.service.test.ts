/**
 * Unit tests for evidence sealing and serving — `npm test`.
 *
 *   • Review R5: the commit copies the verified original and preview to fresh
 *     `sealed/…` keys no presigned PUT covers (conditional on the hashed ETag),
 *     records `thumb_sha256`, deletes the upload keys, and never half-moves a
 *     file; non-owners are served exactly the bytes an approval covered.
 *   • Review R1/R2: a file sealed onto a report still awaiting its resubmission
 *     check queues a `resubmitted` run, and an urgent report's run keeps the
 *     urgent priority and short retry budget.
 *
 * `evidence.service.ts` reads the environment and talks to S3 and Postgres, so
 * this file sets what `env.config` requires (a database URL on a closed local
 * port, so nothing can ever connect) and replaces every I/O edge with an
 * in-memory stand-in: the S3 calls, the model finders, `lockedTransaction` and
 * `sequelize.query`. What is under test is the service's own logic.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

process.env.JWT_ACCESS_SECRET = "evidence-test-access-secret-0123456789abcdef-01";
process.env.JWT_REFRESH_SECRET = "evidence-test-refresh-secret-0123456789abcdef-0";
process.env.DATABASE_URL = "postgres://unit:unit@127.0.0.1:1/unit_tests_never_connect";
process.env.MODERATION_MAX_ATTEMPTS = "4";
process.env.LOG_LEVEL = "error";

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports */
// Loaded after the environment above — static imports would be hoisted above it.
const { evidenceService, approveEvidence } = require("./evidence.service") as typeof import("./evidence.service");
const s3Service: any = (require("./s3.service") as typeof import("./s3.service")).s3Service;
const reportTx: any = require("./report_tx");
const models: any = require("../models/report.model");
const sequelize: any = (require("../config/database.config") as typeof import("../config/database.config")).sequelize;

const USER = "11111111-1111-4111-8111-111111111111";
const REPORT = "33333333-3333-4333-8333-333333333333";
const DRAFT = "44444444-4444-4444-8444-444444444444";
const UPLOAD_KEY = `evidence/${USER}/55555555-5555-4555-8555-555555555555.jpg`;
const UPLOAD_PREVIEW_KEY = `evidence/${USER}/55555555-5555-4555-8555-555555555555-thumb.jpg`;

const JPEG = (fill: number, length = 64): Buffer =>
  Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(length, fill)]);
const sha = (bytes: Buffer): string => crypto.createHash("sha256").update(bytes).digest("hex");

interface StoredObject {
  bytes: Buffer;
  etag: string;
}

/** An in-memory bucket with the S3 calls the service makes. */
function fakeBucket(initial: Record<string, Buffer>) {
  const objects = new Map<string, StoredObject>();
  let version = 0;
  const put = (key: string, bytes: Buffer): void => {
    version += 1;
    objects.set(key, { bytes, etag: `"etag-${version}"` });
  };
  for (const [key, bytes] of Object.entries(initial)) put(key, bytes);
  const copies: Array<{ from: string; to: string; ifMatchEtag: string | null | undefined }> = [];
  const deletes: string[] = [];
  let afterRead: ((key: string) => void) | null = null;

  Object.defineProperty(s3Service, "isEnabled", { configurable: true, get: () => true });
  s3Service.getObject = async (key: string) => {
    const found = objects.get(key);
    if (!found) throw new Error(`NoSuchKey ${key}`);
    const result = { bytes: found.bytes, etag: found.etag, contentType: "image/jpeg" };
    afterRead?.(key);
    return result;
  };
  s3Service.copyObject = async (from: string, to: string, options: { ifMatchEtag?: string | null } = {}) => {
    copies.push({ from, to, ifMatchEtag: options.ifMatchEtag });
    const found = objects.get(from);
    if (!found) throw new Error(`NoSuchKey ${from}`);
    if (options.ifMatchEtag && options.ifMatchEtag !== found.etag) throw new Error("PreconditionFailed");
    put(to, found.bytes);
  };
  s3Service.deleteObject = async (key: string) => {
    deletes.push(key);
    objects.delete(key);
  };
  s3Service.getPresignedDownloadUrl = async (key: string) => `https://signed.example/${key}`;

  return {
    objects,
    copies,
    deletes,
    put,
    onRead(hook: (key: string) => void) {
      afterRead = hook;
    },
  };
}

/** A `report_evidence` row stand-in whose `update` mutates it in place. */
function fakeRow(overrides: Record<string, unknown> = {}): any {
  return {
    id: "66666666-6666-4666-8666-666666666666",
    draft_id: DRAFT,
    report_id: null,
    user_id: USER,
    kind: "photo",
    mime: "image/jpeg",
    bytes: 0,
    duration_ms: null,
    storage_key: UPLOAD_KEY,
    thumb_key: null,
    sha256: null,
    thumb_sha256: null,
    captured_at: null,
    sealed_at: null,
    upload_state: "pending",
    metadata_scrubbed: false,
    sort_order: 0,
    purge_after: null,
    moderation_state: "pending",
    approved_scope: null,
    async update(fields: Record<string, unknown>) {
      Object.assign(this, fields);
      return this;
    },
    ...overrides,
  };
}

/** Wire the row (and optionally its report) into the model finders and the transaction. */
function wireDb(row: any, report: any = null, queryAnswers?: (sql: string, options: any) => unknown) {
  models.ReportEvidence.findOne = async (options: any) => {
    if (options?.where?.upload_state === "sealed") return row.upload_state === "sealed" ? row : null;
    return row;
  };
  models.ReportEvidence.update = async (fields: Record<string, unknown>) => {
    if (row.upload_state === "sealed") return [0];
    Object.assign(row, fields);
    return [1];
  };
  models.ReportDraft.findOne = async () => ({ id: DRAFT, user_id: USER });
  models.Report.findOne = async () => report;
  reportTx.lockedTransaction = async (work: (tx: unknown) => Promise<unknown>) =>
    work({ LOCK: { UPDATE: "UPDATE" } });
  const queries: Array<{ sql: string; options: any }> = [];
  sequelize.query = async (sql: string, options: any) => {
    queries.push({ sql, options });
    return queryAnswers ? queryAnswers(sql, options) : [];
  };
  return queries;
}

test("R5: commit copies the verified original and preview to fresh sealed keys, then drops the upload keys", async () => {
  const original = JPEG(1, 256);
  const preview = JPEG(2, 32);
  const bucket = fakeBucket({ [UPLOAD_KEY]: original, [UPLOAD_PREVIEW_KEY]: preview });
  const originalEtag = bucket.objects.get(UPLOAD_KEY)!.etag;
  const previewEtag = bucket.objects.get(UPLOAD_PREVIEW_KEY)!.etag;
  const row = fakeRow();
  wireDb(row);

  const view = await evidenceService.commit(USER, row.id, { sha256: sha(original), thumbUploaded: true });

  assert.equal(row.upload_state, "sealed");
  assert.equal(row.sha256, sha(original));
  assert.equal(row.thumb_sha256, sha(preview));
  assert.match(row.storage_key, /^sealed\/[0-9a-f-]{36}\.jpg$/);
  assert.equal(row.thumb_key, row.storage_key.replace(/\.jpg$/, "-thumb.jpg"));
  // No upload key survives, so no issued PUT URL can reach what is served.
  assert.ok(!row.storage_key.startsWith("evidence/"));
  assert.equal(bucket.objects.has(UPLOAD_KEY), false);
  assert.equal(bucket.objects.has(UPLOAD_PREVIEW_KEY), false);
  assert.deepEqual(bucket.objects.get(row.storage_key)!.bytes, original);
  assert.deepEqual(bucket.objects.get(row.thumb_key)!.bytes, preview);
  // Each copy was conditional on the ETag that was hashed.
  assert.deepEqual(bucket.copies, [
    { from: UPLOAD_KEY, to: row.storage_key, ifMatchEtag: originalEtag },
    { from: UPLOAD_PREVIEW_KEY, to: row.thumb_key, ifMatchEtag: previewEtag },
  ]);
  assert.equal(view.url, `https://signed.example/${row.storage_key}`);
  assert.equal(view.thumbUrl, `https://signed.example/${row.thumb_key}`);
});

test("R5: bytes replaced between the hash and the copy are never sealed, and nothing is half-moved", async () => {
  const original = JPEG(1, 256);
  const bucket = fakeBucket({ [UPLOAD_KEY]: original, [UPLOAD_PREVIEW_KEY]: JPEG(2, 32) });
  // The member re-PUTs through the still-valid upload URL right after the read.
  bucket.onRead((key) => {
    if (key === UPLOAD_KEY) bucket.put(UPLOAD_KEY, JPEG(9, 256));
  });
  const row = fakeRow();
  wireDb(row);

  await assert.rejects(
    evidenceService.commit(USER, row.id, { sha256: sha(original), thumbUploaded: true }),
    (err: any) => err.status === 400 || err.statusCode === 400,
  );
  assert.equal(row.upload_state, "failed");
  assert.equal(row.storage_key, UPLOAD_KEY);
  assert.equal(row.thumb_key, null);
  assert.equal([...bucket.objects.keys()].some((key) => key.startsWith("sealed/")), false);
});

test("R5: a preview that is not an image is dropped — the file is sealed without one", async () => {
  const original = JPEG(1, 256);
  const bucket = fakeBucket({
    [UPLOAD_KEY]: original,
    [UPLOAD_PREVIEW_KEY]: Buffer.from("<html><body>not a picture</body></html>"),
  });
  const row = fakeRow();
  wireDb(row);

  await evidenceService.commit(USER, row.id, { sha256: sha(original), thumbUploaded: true });

  assert.equal(row.upload_state, "sealed");
  assert.equal(row.thumb_key, null);
  assert.equal(row.thumb_sha256, null);
  assert.equal(bucket.copies.length, 1);
  // The stray upload is still cleaned up.
  assert.equal(bucket.objects.has(UPLOAD_PREVIEW_KEY), false);
});

test("R5: a commit that lost the race returns the winner's seal instead of failing it", async () => {
  const original = JPEG(1, 256);
  fakeBucket({});
  // The first commit sealed the row and deleted the upload key this one reads.
  const row = fakeRow({ upload_state: "pending" });
  wireDb(row);
  models.ReportEvidence.findOne = async (options: any) => {
    if (options?.where?.upload_state === "sealed") {
      row.upload_state = "sealed";
      row.storage_key = "sealed/winner.jpg";
      return row;
    }
    return row;
  };
  models.ReportEvidence.update = async () => [0];

  const view = await evidenceService.commit(USER, row.id, { sha256: sha(original) });
  assert.equal(view.uploadState, "sealed");
  assert.equal(row.upload_state, "sealed");
});

function lateReport(overrides: Record<string, unknown> = {}): any {
  return {
    id: REPORT,
    user_id: USER,
    visibility: "public",
    moderation_state: "pending",
    resubmission_count: 1,
    approved_content_version: 1,
    content_version: 2,
    urgent: false,
    deleted_at: null,
    ...overrides,
  };
}

/** Answers the late-evidence queries; returns the captured run insert. */
function runQueries(opts: { queued?: string | null; lastResubmitted?: number | null }) {
  const inserted: any[] = [];
  const answer = (sql: string, options: any): unknown => {
    // The enqueue upsert first: its merge clause also mentions `resubmitted`.
    if (/INSERT INTO moderation_runs/.test(sql)) {
      inserted.push(options.replacements);
      return [{ id: "run-1" }];
    }
    if (/status = 'queued'/.test(sql) && /SELECT "trigger"/.test(sql)) {
      return opts.queued ? [{ trigger: opts.queued }] : [];
    }
    if (/SELECT content_version/.test(sql) && /"trigger" = 'resubmitted'/.test(sql)) {
      return opts.lastResubmitted == null ? [] : [{ content_version: opts.lastResubmitted }];
    }
    return [];
  };
  return { inserted, answer };
}

test("R1: a photo sealed while the resubmission check is running queues a resubmitted run", async () => {
  const original = JPEG(1, 128);
  fakeBucket({ [UPLOAD_KEY]: original });
  const row = fakeRow({ draft_id: null, report_id: REPORT });
  // The `resubmitted` run for v2 is running, so nothing is queued.
  const { inserted, answer } = runQueries({ queued: null, lastResubmitted: 2 });
  wireDb(row, lateReport(), answer);

  await evidenceService.commit(USER, row.id, { sha256: sha(original) });

  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].trigger, "resubmitted");
  assert.equal(inserted[0].contentVersion, 2);
});

test("R1: without an owed resubmission check the late file queues an ordinary evidence run", async () => {
  const original = JPEG(1, 128);
  fakeBucket({ [UPLOAD_KEY]: original });
  const row = fakeRow({ draft_id: null, report_id: REPORT });
  const { inserted, answer } = runQueries({ queued: null, lastResubmitted: null });
  wireDb(row, lateReport({ resubmission_count: 0 }), answer);

  await evidenceService.commit(USER, row.id, { sha256: sha(original) });

  assert.equal(inserted[0].trigger, "evidence");
  assert.equal(inserted[0].priority, 0);
  assert.equal(inserted[0].maxAttempts, 4);
});

test("R2: an urgent report's late-evidence run keeps the urgent priority and the short budget", async () => {
  const original = JPEG(1, 128);
  fakeBucket({ [UPLOAD_KEY]: original });
  const row = fakeRow({ draft_id: null, report_id: REPORT });
  const { inserted, answer } = runQueries({ queued: null, lastResubmitted: null });
  wireDb(row, lateReport({ resubmission_count: 0, moderation_state: "approved", urgent: true }), answer);

  await evidenceService.commit(USER, row.id, { sha256: sha(original) });

  assert.equal(inserted[0].trigger, "evidence");
  assert.equal(inserted[0].priority, 100);
  assert.equal(inserted[0].maxAttempts, 2);
});

test("R5: non-owners get exactly the bytes the approval covered; owners and staff get both", async () => {
  fakeBucket({});
  const base = { upload_state: "sealed", moderation_state: "approved", storage_key: "sealed/a.jpg", thumb_key: "sealed/a-thumb.jpg" };

  const previewOnly = await evidenceService.toView(fakeRow({ ...base, approved_scope: "thumbnail" }), { audience: "member" });
  assert.equal(previewOnly.url, null);
  assert.equal(previewOnly.thumbUrl, "https://signed.example/sealed/a-thumb.jpg");
  assert.equal(previewOnly.fullResolutionPending, true);
  assert.equal(previewOnly.moderationState, undefined);

  const unscoped = await evidenceService.toView(fakeRow({ ...base, approved_scope: null }), { audience: "member" });
  assert.equal(unscoped.url, null, "an approval without a scope never serves the original");

  const full = await evidenceService.toView(fakeRow({ ...base, approved_scope: "full" }), { audience: "member" });
  assert.equal(full.url, "https://signed.example/sealed/a.jpg");
  assert.equal(full.fullResolutionPending, undefined);

  for (const audience of ["owner", "staff"] as const) {
    const view = await evidenceService.toView(fakeRow({ ...base, approved_scope: "thumbnail" }), { audience });
    assert.equal(view.url, "https://signed.example/sealed/a.jpg", audience);
    assert.equal(view.fullResolutionPending, undefined, audience);
  }

  const pending = await evidenceService.toView(fakeRow({ ...base, moderation_state: "pending" }), { audience: "member" });
  assert.equal(pending.url, null);
  assert.equal(pending.thumbUrl, null);
  assert.equal(pending.pendingReview, true);
});

test("approveEvidence: names its scope, never narrows, and skips an empty id list", async () => {
  const queries = wireDb(fakeRow(), null, () => [{ id: "e1" }]);
  assert.deepEqual(await approveEvidence({} as any, { reportId: REPORT, ids: [], scope: "thumbnail" }), []);
  assert.equal(queries.length, 0);

  const changed = await approveEvidence({} as any, { reportId: REPORT, ids: ["e1"], scope: "thumbnail" });
  assert.deepEqual(changed, ["e1"]);
  assert.match(queries[0].sql, /id IN \(:ids\)/);
  assert.match(queries[0].sql, /WHEN :scope = 'full' OR approved_scope = 'full'/);
  assert.equal(queries[0].options.replacements.scope, "thumbnail");

  await approveEvidence({} as any, { reportId: REPORT, ids: "all_pending", scope: "full" });
  assert.doesNotMatch(queries[1].sql, /id IN/);
  assert.equal(queries[1].options.replacements.ids, undefined);
});
