/**
 * Profile photo upload — presign → direct PUT → commit.
 *
 * The same three-step shape as `evidence.service.ts`, and for the same reason:
 * the bytes go straight from the device to the bucket, so a photo never inflates
 * by a third through base64 and never passes through this process's memory.
 *
 * ── What is deliberately *not* copied from evidence ────────────────────────
 * Evidence is hashed on commit and refused if the digest does not match what the
 * client declared, because the whole trust story on screens C5/D3 rests on
 * "nothing has changed since". An avatar makes no such promise — it is
 * decoration, not a record — so requiring a client-side SHA-256 here would add a
 * full-file read on the device and a failure mode ("that photo does not match
 * what was uploaded") in exchange for nothing a member would notice.
 *
 * What commit *does* verify is that the object exists and is not larger than the
 * cap. A key that was never PUT to would otherwise be accepted, and the profile
 * would point at nothing.
 *
 * ── Why the key is checked against the caller ──────────────────────────────
 * `commit` takes a storage key from the request body. Without a prefix check,
 * passing another member's key would adopt their photo — the presign step hands
 * out keys that are unguessable, but "unguessable" is not an access control.
 * Every key is therefore required to sit under `avatars/<this user id>/`.
 */

import crypto from "crypto";
import env from "@/config/env.config";
import logger from "@/utils/logger.util";
import s3Service from "@/services/s3.service";
import { badRequest } from "@/middlewares/error.middleware";
import type { AvatarPresignResult } from "@/types/user.interface";

/** What a phone camera or photo library actually produces. */
const ALLOWED_MIMES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};

/**
 * Five megabytes.
 *
 * Far below the evidence cap on purpose: an avatar is rendered at 88 points, and
 * the only thing a larger file buys is a slower profile screen. The client
 * already downscales at pick time (`quality: 0.85`), so this is a backstop rather
 * than a limit anyone should hit.
 */
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

class AvatarService {
  /** False when the deployment has no object storage configured. */
  get isStorageReady(): boolean {
    return s3Service.isEnabled;
  }

  /** Every key this member is allowed to commit sits under this prefix. */
  private prefixFor(userId: string): string {
    return `avatars/${userId}/`;
  }

  /**
   * Step 1 — hand back a URL to PUT the photo to.
   *
   * The key is generated here from a UUID, never from a client filename, which
   * removes traversal and overwrite as a class of problem.
   */
  async presign(userId: string, mime: string): Promise<AvatarPresignResult> {
    if (!this.isStorageReady) {
      throw badRequest(
        "Profile photos are not configured on this server. Set STORAGE_DRIVER=s3.",
      );
    }

    const normalized = mime.trim().toLowerCase();
    const extension = ALLOWED_MIMES[normalized];
    // The schema already rejects anything else; this is the second gate, so the
    // service is safe to call from somewhere that has not validated.
    if (!extension) throw badRequest("That kind of file cannot be a profile photo.");

    const storageKey = `${this.prefixFor(userId)}${crypto.randomUUID()}.${extension}`;
    const uploadUrl = await s3Service.getPresignedUploadUrl(storageKey, normalized);

    return {
      uploadUrl,
      storageKey,
      // Echoed so the PUT sets exactly what the signature covers — a mismatched
      // Content-Type makes S3 reject the upload with an opaque 403.
      headers: { "Content-Type": normalized },
    };
  }

  /**
   * Step 2 — confirm the object landed, and return the key to store.
   *
   * Throws rather than returning a flag: a commit that cannot be honoured must
   * not leave the profile pointing at a key with nothing behind it.
   */
  async commit(userId: string, storageKey: string): Promise<string> {
    if (!this.isStorageReady) {
      throw badRequest(
        "Profile photos are not configured on this server. Set STORAGE_DRIVER=s3.",
      );
    }

    const key = storageKey.trim();
    // `..` cannot survive the prefix check on its own — `avatars/<id>/../x` still
    // starts with the prefix as a string — so it is rejected outright.
    if (key.includes("..") || !key.startsWith(this.prefixFor(userId))) {
      logger.warn("[avatar] commit rejected for a key outside the caller's prefix", {
        userId,
      });
      throw badRequest("That upload reference is not valid.");
    }

    let bytes: Buffer;
    try {
      bytes = await s3Service.getObjectBytes(key);
    } catch {
      // The overwhelmingly likely cause is a PUT that never completed, which is
      // worth saying plainly rather than as a 500.
      throw badRequest("That photo did not finish uploading. Try again.");
    }

    if (bytes.length === 0) throw badRequest("That photo did not finish uploading. Try again.");
    if (bytes.length > MAX_AVATAR_BYTES) {
      // Delete rather than orphan: the object is unreachable from any profile
      // once this call fails, and leaving it costs storage forever.
      await s3Service.deleteObject(key).catch(() => {});
      throw badRequest(
        `A profile photo must be under ${Math.floor(MAX_AVATAR_BYTES / 1024 / 1024)} MB.`,
      );
    }

    logger.info("[avatar] committed", { userId, bytes: bytes.length });
    return key;
  }

  /**
   * A short-lived URL for reading an avatar back.
   *
   * Returns null instead of throwing. A profile screen that cannot render a photo
   * falls back to initials, which is a designed state; failing the whole profile
   * request because one presign timed out is not.
   */
  async readUrl(storageKey: string): Promise<string | null> {
    if (!this.isStorageReady) return null;
    return s3Service
      .getPresignedDownloadUrl(storageKey, env.storage.presignExpiresSeconds)
      .catch(() => null);
  }

  /** Remove the stored object. Best-effort — a failed delete must not fail the request. */
  async discard(storageKey: string): Promise<void> {
    if (!this.isStorageReady) return;
    await s3Service.deleteObject(storageKey).catch(() => {});
  }
}

export const avatarService = new AvatarService();
export default avatarService;
