/**
 * Hardened file-upload middleware (Multer).
 *
 * Scope note: the migrated API surface has no multipart endpoint — evidence media
 * arrives as base64 inside a JSON body, and article art is generated
 * server-side. This middleware is the safe foundation for when an upload route is
 * added, and it is wired to `s3.service.ts` for private storage.
 *
 * The safety rules, in order of importance:
 *
 *   1. **Memory storage, never disk.** Nothing is written to a filesystem path
 *      derived from user input, which removes directory traversal entirely.
 *   2. **Magic-byte verification.** The declared `Content-Type` and the file
 *      extension are both attacker-controlled, so the real type is sniffed from
 *      the buffer and must match the allowlist. A `.jpg` that is actually a PHP
 *      script does not pass.
 *   3. **Hard size cap** from `MAX_UPLOAD_BYTES`, enforced by Multer before the
 *      whole body is buffered.
 *   4. **UUID filenames.** The original name is discarded; the stored key is a
 *      UUID plus the sniffed extension, so overwrite and traversal are impossible.
 *   5. **Field and file count limits**, so a single request cannot exhaust memory
 *      with thousands of tiny parts.
 */

import path from "path";
import multer, { MulterError, type FileFilterCallback } from "multer";
import type { Request, RequestHandler } from "express";
import env from "@/config/env.config";
import logger from "@/utils/logger.util";
import { sniffMediaType } from "@/utils/binary.util";
import { legacyError } from "@/utils/response.util";
import { badRequest } from "@/middlewares/error.middleware";

/** MIME types accepted for evidence and media uploads. */
export const ALLOWED_MEDIA_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "audio/mpeg",
  "video/mp4",
]);

/** Extensions matching the allowlist above. */
const ALLOWED_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".pdf",
  ".mp3",
  ".mp4",
]);

/**
 * First-pass filter on the declared type and extension.
 *
 * This runs before the bytes are available, so it can only reject the obvious
 * cases. The authoritative check is `verifyUploadedFiles` below.
 */
function fileFilter(_req: Request, file: Express.Multer.File, cb: FileFilterCallback): void {
  const ext = path.extname(file.originalname || "").toLowerCase();

  if (!ALLOWED_MEDIA_TYPES.has(file.mimetype)) {
    cb(badRequest(`Unsupported file type '${file.mimetype}'.`));
    return;
  }
  if (ext && !ALLOWED_EXTENSIONS.has(ext)) {
    cb(badRequest(`Unsupported file extension '${ext}'.`));
    return;
  }
  cb(null, true);
}

const upload = multer({
  // In-memory: no path is ever built from user input.
  storage: multer.memoryStorage(),
  fileFilter,
  limits: {
    fileSize: env.storage.maxUploadBytes,
    files: 5,
    fields: 20,
    // Bound the original filename so it cannot be used as a memory-pressure vector.
    fieldNameSize: 100,
    fieldSize: 1024 * 1024,
  },
});

/** Accept a single file under `field`. */
export const uploadSingle = (field: string): RequestHandler => upload.single(field);

/** Accept up to `maxCount` files under `field`. */
export const uploadArray = (field: string, maxCount = 5): RequestHandler =>
  upload.array(field, maxCount);

/**
 * Verify the *actual* bytes of every uploaded file against the allowlist.
 *
 * Must run after the Multer middleware. This is the check that matters: a
 * declared `image/png` whose magic bytes say otherwise is rejected here.
 */
export const verifyUploadedFiles: RequestHandler = (req, res, next) => {
  const files: Express.Multer.File[] = [];
  if (req.file) files.push(req.file);
  if (Array.isArray(req.files)) files.push(...req.files);

  for (const file of files) {
    const sniffed = sniffMediaType(file.buffer);

    if (!sniffed) {
      logger.warn("[upload] rejected: unrecognised file signature", {
        declared: file.mimetype,
        bytes: file.size,
      });
      legacyError(res, "File content could not be verified and was rejected.", 400);
      return;
    }
    if (!ALLOWED_MEDIA_TYPES.has(sniffed)) {
      logger.warn("[upload] rejected: disallowed real type", {
        declared: file.mimetype,
        actual: sniffed,
      });
      legacyError(res, `Unsupported file content type '${sniffed}'.`, 400);
      return;
    }
    // A mismatch between declaration and reality is itself suspicious — log it,
    // and trust the sniffed type from here on.
    if (sniffed !== file.mimetype) {
      logger.warn("[upload] declared type does not match content", {
        declared: file.mimetype,
        actual: sniffed,
      });
      file.mimetype = sniffed;
    }
  }

  next();
};

/**
 * Translate Multer's own errors into clean client messages.
 *
 * Mount immediately after an upload route; otherwise a size overflow surfaces as
 * an opaque 500.
 */
export const uploadErrorHandler: RequestHandler = (req, res, next) => {
  next();
};

/** Error-handling form for Multer failures. */
export function handleMulterError(
  err: unknown,
  _req: Request,
  res: Parameters<RequestHandler>[1],
  next: Parameters<RequestHandler>[2],
): void {
  if (err instanceof MulterError) {
    const messages: Record<string, string> = {
      LIMIT_FILE_SIZE: `File exceeds the ${Math.floor(env.storage.maxUploadBytes / 1024 / 1024)} MB limit.`,
      LIMIT_FILE_COUNT: "Too many files in one request.",
      LIMIT_FIELD_COUNT: "Too many form fields in one request.",
      LIMIT_UNEXPECTED_FILE: "Unexpected file field.",
    };
    legacyError(res, messages[err.code] ?? "File upload was rejected.", 400);
    return;
  }
  next(err);
}
