/**
 * The two things the client owes the server for every attachment.
 *
 * ── 1. A hash of the bytes, not of a rendering of the bytes ────────────────
 * The seal on C5 means "what the server stored is what the device had". That only
 * holds if both sides hash the same thing. The server hashes the raw object it read
 * out of the bucket, so the client must hash raw bytes too.
 *
 * The obvious-looking version of this is wrong in a way that fails silently:
 *
 *     const base64 = await readAsStringAsync(uri, { encoding: Base64 });
 *     const sha = await Crypto.digestStringAsync(SHA256, base64);   // ← hashes text
 *
 * That digests the base64 *string*, which never equals the digest of the bytes it
 * encodes. Every commit would come back "that file does not match what was
 * uploaded" — a refusal that reads like a corrupted upload rather than a client
 * bug, on the one code path that is hardest to test locally.
 *
 * ── 2. A preview, generated here ───────────────────────────────────────────
 * The feed's lead image is a full-resolution photograph unless the device sends
 * something smaller. On a phone camera that is several megabytes per card, which on
 * mobile data is the difference between a feed that scrolls and one that does not.
 *
 * Generated on the device rather than on the server for a second reason: the server
 * then never has to decode user-supplied media. Image parsers are a well-worn route
 * to remote code execution, and a service holding evidence for people at risk is
 * the wrong place to open one.
 */

import * as Crypto from "expo-crypto";
import { File } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

/** Longest edge of a generated preview. Comfortably covers a 3x feed card. */
const THUMB_MAX_EDGE = 640;

/** JPEG quality for previews. 0.6 is where the artefacts stop being visible here. */
const THUMB_QUALITY = 0.6;

/**
 * SHA-256 of a local file's raw bytes, hex-encoded.
 *
 * Reads the whole file into memory, which is the honest cost of a client-side
 * attestation: a streaming digest would be better but neither `expo-crypto` nor
 * `expo-file-system` exposes one. The per-file upload cap keeps the worst case
 * bounded — see `MAX_UPLOAD_BYTES` on the server.
 */
export async function hashFile(uri: string): Promise<string> {
  const bytes = await new File(uri).bytes();
  const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes);
  return bufferToHex(digest);
}

/** `ArrayBuffer` → lowercase hex. */
function bufferToHex(buffer: ArrayBuffer): string {
  const view = new Uint8Array(buffer);
  let hex = "";
  for (let i = 0; i < view.length; i += 1) {
    hex += view[i].toString(16).padStart(2, "0");
  }
  return hex;
}

/**
 * A small JPEG preview of a photo, as a local file URI.
 *
 * Returns null rather than throwing. A missing preview costs a text-first feed card,
 * which is a designed state; failing the whole attachment because a thumbnail could
 * not be made would lose the evidence over a convenience.
 *
 * Only the longest edge is constrained, so the aspect ratio survives — the card
 * crops to fill and a pre-squashed image would crop wrong.
 */
export async function makeThumbnail(uri: string): Promise<string | null> {
  try {
    const context = ImageManipulator.manipulate(uri);
    // `resize` with one dimension null preserves the ratio. Which dimension to pin
    // is not knowable without the source size, so pin the width and accept that a
    // tall portrait image ends up slightly larger than the cap — still two orders
    // of magnitude smaller than the original.
    const rendered = await context.resize({ width: THUMB_MAX_EDGE, height: null }).renderAsync();
    const saved = await rendered.saveAsync({
      format: SaveFormat.JPEG,
      compress: THUMB_QUALITY,
    });
    return saved.uri;
  } catch {
    return null;
  }
}

/**
 * PUT a local file at a presigned URL.
 *
 * Used for previews only. The original goes through `createUploadTask` instead,
 * because C5 draws real progress for it and a preview is too small to be worth a
 * progress bar.
 */
export async function putFile(
  url: string,
  uri: string,
  headers: Record<string, string>,
): Promise<boolean> {
  try {
    const bytes = await new File(uri).bytes();
    const response = await fetch(url, {
      method: "PUT",
      headers,
      body: bytes as unknown as BodyInit,
    });
    return response.ok;
  } catch {
    return false;
  }
}
