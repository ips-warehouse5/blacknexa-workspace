/**
 * Base64 / binary helpers.
 *
 * The Worker used the browser globals `atob` / `btoa`, which are byte-oriented
 * and mangle anything outside Latin-1. Node's `Buffer` is used instead — same
 * result for the base64 payloads involved (image bytes, audio bytes, AES
 * ciphertext), without the encoding hazard.
 */

/** Decode a base64 string to bytes, tolerating embedded whitespace/newlines. */
export function base64ToBytes(base64: string): Buffer {
  return Buffer.from(base64.replace(/\s/g, ""), "base64");
}

/** Encode bytes to a base64 string. */
export function bytesToBase64(bytes: Uint8Array | Buffer): string {
  return Buffer.from(bytes).toString("base64");
}

/** Encode a UTF-8 string to base64. */
export function utf8ToBase64(text: string): string {
  return Buffer.from(text, "utf8").toString("base64");
}

/** Decode base64 to a UTF-8 string. */
export function base64ToUtf8(base64: string): string {
  return Buffer.from(base64, "base64").toString("utf8");
}

/**
 * Strip a `data:<mime>;base64,` prefix if present, returning the raw payload.
 * Some AI gateways return a data URI, others raw base64.
 */
export function stripDataUri(value: string): { mediaType?: string; base64: string } {
  const match = value.match(/^data:([a-zA-Z0-9/+.-]+);base64,(.+)$/);
  if (match) return { mediaType: match[1], base64: match[2] };
  return { base64: value };
}

/**
 * Sniff the media type from a buffer's magic bytes.
 *
 * Used by the upload middleware so a file's declared extension and Content-Type
 * are never trusted on their own.
 */
export function sniffMediaType(buffer: Buffer): string | null {
  if (buffer.length < 12) return null;
  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "image/png";
  }
  // GIF: "GIF8"
  if (buffer.subarray(0, 4).toString("ascii") === "GIF8") return "image/gif";
  // WEBP: "RIFF"...."WEBP"
  if (
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  // WAV: "RIFF"...."WAVE" — same container family as WEBP, different form type.
  // Produced by the AI engine's TTS: Gemini returns headerless PCM, which the
  // engine frames as WAV rather than pulling in an MP3 encoder.
  if (
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WAVE"
  ) {
    return "audio/wav";
  }
  // PDF: "%PDF"
  if (buffer.subarray(0, 4).toString("ascii") === "%PDF") return "application/pdf";
  // MP3: "ID3" tag, or an MPEG frame sync
  if (buffer.subarray(0, 3).toString("ascii") === "ID3") return "audio/mpeg";
  if (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) return "audio/mpeg";
  // MP4 / M4A: "....ftyp"
  if (buffer.subarray(4, 8).toString("ascii") === "ftyp") return "video/mp4";
  return null;
}
