/**
 * Source-level guards for two moderation invariants — `npm test`.
 *
 * Both hold only if *every* writer follows them, and the next writer is the
 * one a review will not see, so they are checked over the source tree rather
 * than per function:
 *
 *   1. **No report, comment or evidence row is created on the column default**
 *      (§4.1, §4.2, D22). `moderation_state` defaults to `'approved'` so the
 *      migration could add it to legacy rows; a create that leaves it out
 *      publishes unmoderated content. Every `Report` / `ReportComment` /
 *      `ReportEvidence` create — and any raw `INSERT` into their tables —
 *      must name it.
 *
 *   2. **No evidence approval without a scope** (review R5). Non-owners are
 *      served what `approved_scope` says the approval covered; an approval
 *      that leaves it NULL degrades to preview-only at best, and one that
 *      copied the old habit of approving "the file" would be the R5 hole
 *      again. Every write that sets evidence `moderation_state` to
 *      `'approved'` — ORM or raw SQL — must set `approved_scope` beside it.
 *
 * A textual check, deliberately simple: it reads each call's argument list by
 * balancing brackets, and each SQL statement's `SET` clause. It can be fooled
 * by a writer that builds its attributes elsewhere and passes a variable — in
 * which case this test fails loudly and the writer should inline them, or the
 * rule here should learn the new shape.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const SRC = path.resolve(__dirname, "..");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      out.push(...sourceFiles(full));
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") && !entry.name.endsWith(".d.ts")) {
      out.push(full);
    }
  }
  return out;
}

const FILES = sourceFiles(SRC).map((file) => ({
  file: path.relative(SRC, file).replace(/\\/g, "/"),
  text: fs.readFileSync(file, "utf8"),
}));

function lineOf(text: string, index: number): number {
  return text.slice(0, index).split("\n").length;
}

/** The text between the bracket at `open` and its match (exclusive). */
function balanced(text: string, open: number): string {
  const pairs: Record<string, string> = { "(": ")", "{": "}", "[": "]" };
  const stack: string[] = [];
  for (let i = open; i < text.length; i += 1) {
    const ch = text[i];
    if (ch in pairs) stack.push(pairs[ch]);
    else if (ch === stack[stack.length - 1]) {
      stack.pop();
      if (stack.length === 0) return text.slice(open + 1, i);
    }
  }
  return text.slice(open + 1);
}

/**
 * Every SQL statement in the tree that `pattern` (global) starts: from the
 * match to the end of its template literal. Anchored on the statement rather
 * than on pairing backticks, which doc comments use freely. Statements in
 * comments are skipped (a `*` or `//` line prefix).
 */
function sqlStatements(pattern: RegExp): Array<{ where: string; sql: string }> {
  const found: Array<{ where: string; sql: string }> = [];
  for (const { file, text } of FILES) {
    const re = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
    let match: RegExpExecArray | null;
    while ((match = re.exec(text))) {
      const lineStart = text.lastIndexOf("\n", match.index) + 1;
      const prefix = text.slice(lineStart, match.index).trim();
      if (prefix.startsWith("*") || prefix.startsWith("//") || prefix.startsWith("/*")) continue;
      const end = text.indexOf("`", match.index);
      found.push({
        where: `${file}:${lineOf(text, match.index)}`,
        sql: text.slice(match.index, end < 0 ? undefined : end),
      });
    }
  }
  return found;
}

/** The `SET …` clause of an UPDATE, up to its WHERE / FROM / RETURNING. */
function setClause(sql: string): string {
  const start = sql.search(/\bSET\b/i);
  if (start < 0) return "";
  const rest = sql.slice(start);
  const end = rest.search(/\b(WHERE|FROM|RETURNING)\b/i);
  return end < 0 ? rest : rest.slice(0, end);
}

test("every Report / ReportComment / ReportEvidence create names moderation_state (never the column default)", () => {
  const calls: string[] = [];
  const missing: string[] = [];
  const creator = /\b(Report|ReportComment|ReportEvidence)\.(create|bulkCreate|upsert|findOrCreate|build)\s*\(/g;
  for (const { file, text } of FILES) {
    let match: RegExpExecArray | null;
    while ((match = creator.exec(text))) {
      const where = `${file}:${lineOf(text, match.index)}`;
      calls.push(where);
      const args = balanced(text, match.index + match[0].length - 1);
      if (!/\bmoderation_state\s*:/.test(args)) missing.push(`${where} ${match[1]}.${match[2]}`);
    }
  }
  // The guard must be looking at something: filing, comments and presign.
  assert.ok(calls.length >= 3, `expected the three known creates, found: ${calls.join(", ")}`);
  assert.deepEqual(missing, [], "these creates rely on the 'approved' column default");

  const inserts = sqlStatements(/INSERT\s+INTO\s+"?(reports|report_comments|report_evidence)"?[\s(]/i);
  const rawMissing = inserts.filter(({ sql }) => !/\bmoderation_state\b/.test(sql)).map(({ where }) => where);
  assert.deepEqual(rawMissing, [], "these raw INSERTs rely on the 'approved' column default");
});

test("every evidence approval sets approved_scope beside moderation_state (review R5)", () => {
  // Raw SQL: an UPDATE of report_evidence whose SET approves must scope.
  const updates = sqlStatements(/UPDATE\s+"?report_evidence"?/i);
  assert.ok(updates.length > 0, "the approval statements are found");
  const approving = updates.filter(({ sql }) => /\bmoderation_state\s*=\s*'approved'/.test(setClause(sql)));
  assert.ok(approving.length >= 2, `expected approveEvidence and the private sweep, found ${approving.length}`);
  const unscopedSql = approving
    .filter(({ sql }) => !/\bapproved_scope\s*=/.test(setClause(sql)))
    .map(({ where }) => where);
  assert.deepEqual(unscopedSql, [], "these statements approve evidence without naming a scope");

  // ORM: ReportEvidence.update / .create whose attributes set moderation_state.
  const unscopedOrm: string[] = [];
  const writer = /\bReportEvidence\.(update|create)\s*\(/g;
  for (const { file, text } of FILES) {
    let match: RegExpExecArray | null;
    while ((match = writer.exec(text))) {
      const args = balanced(text, match.index + match[0].length - 1);
      const attributesStart = args.indexOf("{");
      const attributes = attributesStart < 0 ? args : balanced(args, attributesStart);
      if (/\bmoderation_state\s*:/.test(attributes) && !/\bapproved_scope\s*:/.test(attributes)) {
        unscopedOrm.push(`${file}:${lineOf(text, match.index)}`);
      }
    }
  }
  assert.deepEqual(unscopedOrm, [], "these writes can approve evidence without naming a scope");
});

test("the guards themselves catch the shapes they exist for", () => {
  // A create on the default, and an approval with no scope, as a future
  // writer might add them — the helpers above must flag both.
  const create = "await ReportComment.create({ report_id: id, body }, { transaction });";
  const createArgs = balanced(create, create.indexOf("("));
  assert.ok(!/\bmoderation_state\s*:/.test(createArgs));

  const sql = "UPDATE report_evidence SET moderation_state = 'approved', updated_on = now() WHERE id = :id";
  assert.match(setClause(sql), /moderation_state\s*=\s*'approved'/);
  assert.doesNotMatch(setClause(sql), /approved_scope\s*=/);

  // …and a WHERE-clause mention is not an approval.
  const backfill = "UPDATE report_evidence e SET approved_scope = 'full' WHERE e.moderation_state = 'approved'";
  assert.doesNotMatch(setClause(backfill), /moderation_state/);
});
