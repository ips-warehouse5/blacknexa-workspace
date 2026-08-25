/**
 * Evidence upload, sealing and access.
 *
 * ── Why the transport changed ──────────────────────────────────────────────
 * The geo-legal module took evidence as base64 inside a JSON body. Screen C5
 * attaches a 24.8 MB video with per-file progress, which that cannot do: base64
 * inflates by a third, gives no progress, cannot resume, and breaches the JSON
 * body limit. So the flow is presign → direct PUT → commit.
 *
 * ── What "Sealed" means ────────────────────────────────────────────────────
 * On commit the server reads the stored object, hashes it, and compares that to
 * the SHA-256 the client declared. Only then is `sealed_at` stamped. That single
 * server-side timestamp is what C5, C9, D3, D11 and D12 all render — there is no
 * client-supplied seal time anywhere, because a timestamp the client chooses
 * proves nothing about when the file arrived or whether it changed.
 *
 * A mismatch is refused, not logged and accepted: the whole trust story on D3
 * rests on "Nothing has changed since", and a file we cannot vouch for must not
 * be able to claim that.
 */

import crypto from "crypto";
import env from "@/config/env.config";
import logger from "@/utils/logger.util";
import { nowIso } from "@/models/model_options";
import { ReportEvidence } from "@/models/report.model";
import s3Service from "@/services/s3.service";
import { badRequest } from "@/middlewares/error.middleware";
import type {
  EvidenceKind,
  EvidenceView,
  PresignEvidenceDto,
} from "@/types/report.interface";

/** Which MIME types each attachment kind accepts. */
const KIND_MIMES: Record<EvidenceKind, RegExp> = {
  photo: /^image\/(jpeg|png|webp|heic|heif)$/,
  video: /^video\/(mp4|quicktime|webm)$/,
  audio: /^audio\/(mpeg|mp4|aac|wav|m4a|x-m4a)$/,
  document: /^application\/pdf$/,
};

/** Human labels for D3's per-file rows and C9's sealed list. */
const KIND_LABELS: Record<EvidenceKind, string> = {
  photo: "Photo",
  video: "Video",
  audio: "Audio",
  document: "Document",
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

class EvidenceService {
  /** True when object storage is configured; otherwise uploads cannot be offered. */
  get isStorageReady(): boolean {
    return s3Service.isEnabled;
  }

  /**
   * Step 1 — create the row and hand back a URL to PUT to.
   *
   * The key is generated server-side from a UUID and never from a client filename,
   * which removes traversal and overwrite as a class of problem.
   */
  async presign(
    userId: string,
    target: { reportId?: string; draftId?: string },
    dto: PresignEvidenceDto,
  ): Promise<{
    evidenceId: string;
    uploadUrl: string;
    headers: Record<string, string>;
    /** Second slot for a preview image. Null for kinds that have no preview. */
    thumbUploadUrl: string | null;
    thumbHeaders: Record<string, string> | null;
  }> {
    if (!this.isStorageReady) {
      throw badRequest(
        "File uploads are not configured on this server. Set STORAGE_DRIVER=s3.",
      );
    }

    const pattern = KIND_MIMES[dto.kind];
    if (!pattern.test(dto.mime)) {
      throw badRequest(`A ${dto.kind} cannot be a ${dto.mime} file.`);
    }
    if (dto.bytes > env.storage.maxUploadBytes) {
      throw badRequest(
        `That file is larger than the ${Math.floor(env.storage.maxUploadBytes / 1024 / 1024)} MB limit.`,
      );
    }

    // Per-report caps, so presign cannot be used as free storage.
    const scope = target.reportId
      ? { report_id: target.reportId }
      : { draft_id: target.draftId! };
    const siblings = await ReportEvidence.findAll({ where: scope });
    if (siblings.length >= env.reports.maxEvidencePerReport) {
      throw badRequest(
        `A report can carry at most ${env.reports.maxEvidencePerReport} files.`,
      );
    }
    const totalBytes = siblings.reduce((sum, row) => sum + row.bytes, 0) + dto.bytes;
    if (totalBytes > env.reports.maxEvidenceBytesPerReport) {
      throw badRequest("Those files together are larger than one report can carry.");
    }

    const extension = dto.mime.split("/")[1]?.replace(/[^a-z0-9]/gi, "") || "bin";
    const objectId = crypto.randomUUID();
    const storageKey = `evidence/${userId}/${objectId}.${extension}`;

    /*
     * Photos and videos get a second slot for a preview.
     *
     * Generated on the device, not here. Two reasons, and the second is the one
     * that decides it:
     *   • The server never has to decode user-supplied media. Image and video
     *     parsers are a well-worn path to remote code execution, and a service that
     *     stores evidence for people at risk is the wrong place to open one.
     *   • The device already holds the full-resolution original, so resizing there
     *     costs one decode it was doing anyway rather than a round trip.
     *
     * Always JPEG: it is what the client produces, and pinning the type means the
     * signature and the eventual PUT cannot disagree.
     */
    const wantsThumb = dto.kind === "photo" || dto.kind === "video";
    const thumbKey = wantsThumb ? `evidence/${userId}/${objectId}-thumb.jpg` : null;

    const row = await ReportEvidence.create({
      report_id: target.reportId ?? null,
      draft_id: target.draftId ?? null,
      user_id: userId,
      kind: dto.kind,
      mime: dto.mime,
      bytes: dto.bytes,
      duration_ms: dto.durationMs ?? null,
      storage_key: storageKey,
      captured_at: dto.capturedAt ?? null,
      upload_state: "pending",
      sort_order: siblings.length,
    });

    const uploadUrl = await s3Service.getPresignedUploadUrl(storageKey, dto.mime);
    const thumbUploadUrl = thumbKey
      ? await s3Service.getPresignedUploadUrl(thumbKey, "image/jpeg")
      : null;

    return {
      evidenceId: row.id,
      uploadUrl,
      // Echoed so the client sets exactly what the signature covers — a mismatched
      // Content-Type makes S3 reject the PUT with an opaque 403.
      headers: { "Content-Type": dto.mime },
      thumbUploadUrl,
      thumbHeaders: thumbKey ? { "Content-Type": "image/jpeg" } : null,
    };
  }

  /**
   * Step 2 — verify and seal.
   *
   * This is the only place `sealed_at` is written.
   */
  async commit(
    userId: string,
    evidenceId: string,
    dto: {
      sha256: string;
      capturedAt?: string;
      durationMs?: number;
      /** True when the client also PUT a preview to the second slot. */
      thumbUploaded?: boolean;
    },
  ): Promise<EvidenceView> {
    const row = await ReportEvidence.findOne({ where: { id: evidenceId, user_id: userId } });
    if (!row) throw badRequest("That upload is not recognised.");
    if (row.upload_state === "sealed") return this.toView(row);

    let actualHash: string;
    let actualBytes: number;
    try {
      const bytes = await s3Service.getObjectBytes(row.storage_key);
      actualBytes = bytes.length;
      actualHash = crypto.createHash("sha256").update(bytes).digest("hex");
    } catch (err) {
      await row.update({ upload_state: "failed" });
      logger.warn("[evidence] could not read the uploaded object", {
        evidenceId,
        message: err instanceof Error ? err.message : String(err),
      });
      throw badRequest("That file did not finish uploading. Try again.");
    }

    if (actualHash.toLowerCase() !== dto.sha256.toLowerCase()) {
      // Refused, not accepted-with-a-warning. See the file header.
      await row.update({ upload_state: "failed" });
      logger.warn("[evidence] hash mismatch on commit — refusing to seal", { evidenceId });
      throw badRequest(
        "That file does not match what was uploaded, so it has not been sealed. Try attaching it again.",
      );
    }

    /*
     * The preview key is derived from the original's, not stored at presign time.
     * Writing it earlier would mean `thumb_key` was set on a row whose preview may
     * never arrive — and `toView` treats a set key as a promise there is a file at
     * the other end.
     *
     * Note what the hash does and does not cover: `sha256` is the original. The
     * preview is a derived convenience and is never part of the seal, so a report's
     * integrity claim never rests on an image the client generated.
     */
    const thumbKey =
      dto.thumbUploaded && (row.kind === "photo" || row.kind === "video")
        ? row.storage_key.replace(/\.[^.]+$/, "-thumb.jpg")
        : row.thumb_key;

    const sealedAt = nowIso();
    await row.update({
      sha256: actualHash,
      bytes: actualBytes,
      captured_at: dto.capturedAt ?? row.captured_at,
      duration_ms: dto.durationMs ?? row.duration_ms,
      thumb_key: thumbKey,
      upload_state: "sealed",
      sealed_at: sealedAt,
      // The client strips EXIF before upload; recorded honestly either way.
      metadata_scrubbed: row.kind === "photo" || row.kind === "video",
    });

    logger.info("[evidence] sealed", { evidenceId, kind: row.kind, bytes: actualBytes });
    return this.toView(row);
  }

  /** Remove an attachment before the report is filed. */
  async remove(userId: string, evidenceId: string): Promise<boolean> {
    const row = await ReportEvidence.findOne({ where: { id: evidenceId, user_id: userId } });
    if (!row) return false;
    // Only a draft's files can be removed: once filed, evidence is append-only so
    // the D3 integrity claims stay true.
    if (row.report_id) {
      throw badRequest(
        "A filed report's evidence cannot be removed. Delete the report instead.",
      );
    }
    await this.deleteObject(row.storage_key, row.thumb_key);
    await row.destroy();
    return true;
  }

  /** Best-effort object removal. A missing object is not an error. */
  async deleteObject(storageKey: string, thumbKey?: string | null): Promise<void> {
    if (!this.isStorageReady) return;
    await s3Service.deleteObject(storageKey).catch(() => {});
    if (thumbKey) await s3Service.deleteObject(thumbKey).catch(() => {});
  }

  /** Every file on a report, presigned for reading. */
  async listForReport(reportId: string): Promise<EvidenceView[]> {
    const rows = await ReportEvidence.findAll({
      where: { report_id: reportId },
      order: [["sort_order", "ASC"]],
    });
    return Promise.all(rows.map((row) => this.toView(row)));
  }

  /** Every file on a draft, for the C5 attached list. */
  async listForDraft(draftId: string): Promise<EvidenceView[]> {
    const rows = await ReportEvidence.findAll({
      where: { draft_id: draftId },
      order: [["sort_order", "ASC"]],
    });
    return Promise.all(rows.map((row) => this.toView(row)));
  }

  /**
   * Project one row, minting short-lived read URLs.
   *
   * Evidence is never public: a leaked link expires instead of remaining an open
   * hole, which is why the URL is per-request rather than stored.
   */
  async toView(row: ReportEvidence): Promise<EvidenceView> {
    let url: string | null = null;
    let thumbUrl: string | null = null;

    if (this.isStorageReady && row.upload_state === "sealed") {
      url = await s3Service.getPresignedDownloadUrl(row.storage_key).catch(() => null);
      if (row.thumb_key) {
        thumbUrl = await s3Service.getPresignedDownloadUrl(row.thumb_key).catch(() => null);
      }
    }

    return {
      id: row.id,
      kind: row.kind,
      mime: row.mime,
      bytes: row.bytes,
      durationMs: row.duration_ms,
      capturedAt: row.captured_at,
      sealedAt: row.sealed_at,
      uploadState: row.upload_state,
      url,
      thumbUrl,
    };
  }

  /** "Video · 0:42 · 24.8 MB" — the label C5, C9 and D3 print. */
  describe(row: ReportEvidence): string {
    const parts: string[] = [KIND_LABELS[row.kind]];
    if (row.duration_ms) parts.push(formatDuration(row.duration_ms));
    if (row.bytes) parts.push(formatBytes(row.bytes));
    return parts.join(" · ");
  }
}

export const evidenceService = new EvidenceService();
export default evidenceService;
