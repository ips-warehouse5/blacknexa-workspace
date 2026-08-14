/**
 * S3 storage with presigned access for private files.
 *
 * Sensitive objects are never exposed through a public static directory or a
 * public bucket policy — access is granted per-request through a short-lived
 * presigned URL, so a leaked link expires instead of remaining a permanent hole.
 *
 * Keys are always generated server-side from a UUID, never from a user-supplied
 * filename, which removes path-traversal and overwrite as a class of problem.
 *
 * Note on scope: the migrated API surface has no multipart upload endpoint —
 * evidence media arrives as base64 inside a JSON body and article art is
 * generated server-side. This service is therefore the storage layer for
 * sensitive files when one is needed (and is used by `upload.middleware.ts`),
 * rather than something the current routes depend on. Article images and audio
 * deliberately stay in PostgreSQL so the `/api/v1/news/image/:id` contract keeps
 * serving identical bytes from the same URL.
 */

import path from "path";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import env from "@/config/env.config";
import logger from "@/utils/logger.util";
import { uuid } from "@/utils/id.util";
import { sniffMediaType } from "@/utils/binary.util";

class S3Service {
  private client: S3Client | null = null;

  /** True when S3 is the configured driver. */
  get isEnabled(): boolean {
    return env.storage.driver === "s3";
  }

  /**
   * Lazily construct the client so a `db`-driver deployment never needs AWS
   * credentials present.
   */
  private getClient(): S3Client {
    if (!this.isEnabled) {
      throw new Error("S3 storage is not enabled (STORAGE_DRIVER is not 's3')");
    }
    if (!this.client) {
      this.client = new S3Client({
        region: env.storage.s3Region,
        credentials: {
          accessKeyId: env.storage.s3AccessKeyId,
          secretAccessKey: env.storage.s3SecretAccessKey,
        },
        // Set for S3-compatible providers (R2, MinIO, Spaces).
        ...(env.storage.s3Endpoint
          ? { endpoint: env.storage.s3Endpoint, forcePathStyle: true }
          : {}),
      });
    }
    return this.client;
  }

  /**
   * Build a storage key from a UUID plus the *sniffed* extension.
   *
   * The original filename is discarded entirely — it is attacker-controlled, and
   * nothing downstream needs it.
   */
  buildKey(prefix: string, buffer: Buffer, fallbackExt = ""): string {
    const sniffed = sniffMediaType(buffer);
    const ext = sniffed ? this.extensionFor(sniffed) : this.safeExtension(fallbackExt);
    // Prefix is caller-controlled but never user-controlled; normalise anyway.
    const safePrefix = prefix.replace(/[^a-zA-Z0-9/_-]/g, "").replace(/^\/+|\/+$/g, "");
    return `${safePrefix}/${uuid()}${ext}`;
  }

  private extensionFor(mediaType: string): string {
    const map: Record<string, string> = {
      "image/jpeg": ".jpg",
      "image/png": ".png",
      "image/gif": ".gif",
      "image/webp": ".webp",
      "application/pdf": ".pdf",
      "audio/mpeg": ".mp3",
      "video/mp4": ".mp4",
    };
    return map[mediaType] ?? "";
  }

  /** Allow only a short, alphanumeric extension, stripping any path component. */
  private safeExtension(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    return /^\.[a-z0-9]{1,5}$/.test(ext) ? ext : "";
  }

  /**
   * Upload an object. Private by default — no ACL is set, so the bucket's
   * block-public-access settings govern and nothing becomes world-readable by
   * accident.
   */
  async putObject(
    key: string,
    body: Buffer,
    contentType: string,
    metadata?: Record<string, string>,
  ): Promise<{ key: string; bucket: string }> {
    await this.getClient().send(
      new PutObjectCommand({
        Bucket: env.storage.s3Bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        Metadata: metadata,
        ServerSideEncryption: "AES256",
      }),
    );
    logger.info("[s3] object stored", { key, bytes: body.length });
    return { key, bucket: env.storage.s3Bucket };
  }

  /** A short-lived download URL. This is how private files are ever served. */
  async getPresignedDownloadUrl(key: string, expiresInSeconds?: number): Promise<string> {
    return getSignedUrl(
      this.getClient(),
      new GetObjectCommand({ Bucket: env.storage.s3Bucket, Key: key }),
      { expiresIn: expiresInSeconds ?? env.storage.presignExpiresSeconds },
    );
  }

  /**
   * A short-lived upload URL, for a direct browser/app upload.
   *
   * `contentType` is pinned into the signature so the client cannot substitute a
   * different type after the URL is issued.
   */
  async getPresignedUploadUrl(
    key: string,
    contentType: string,
    expiresInSeconds?: number,
  ): Promise<string> {
    return getSignedUrl(
      this.getClient(),
      new PutObjectCommand({
        Bucket: env.storage.s3Bucket,
        Key: key,
        ContentType: contentType,
        ServerSideEncryption: "AES256",
      }),
      { expiresIn: expiresInSeconds ?? env.storage.presignExpiresSeconds },
    );
  }

  /** Delete an object. */
  async deleteObject(key: string): Promise<void> {
    await this.getClient().send(
      new DeleteObjectCommand({ Bucket: env.storage.s3Bucket, Key: key }),
    );
    logger.info("[s3] object deleted", { key });
  }
}

export const s3Service = new S3Service();
export default s3Service;
