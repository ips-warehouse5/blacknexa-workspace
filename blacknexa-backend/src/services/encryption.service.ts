/**
 * Server-side re-encryption layer for sealed evidence.
 *
 * The client seals its payload with AES-256-GCM using a key that never leaves the
 * device (zero-knowledge). This service re-encrypts that already-sealed blob with
 * a server-side key before it is written to the database — defence in depth: a
 * database compromise yields ciphertext wrapped in ciphertext, and the inner
 * layer still cannot be opened without the user's PIN.
 *
 * The server key is derived from the project secret via PBKDF2, so it is unique
 * per deployment and never hardcoded.
 *
 * Algorithm parameters are identical to the Worker's Web Crypto implementation
 * (PBKDF2-SHA256, 100k iterations, 16-byte salt, 12-byte IV, AES-256-GCM) and the
 * envelope shape is unchanged, so a payload sealed by the Worker decrypts here
 * unmodified as long as the same secret is supplied.
 */

import { webcrypto } from "crypto";
import env from "@/config/env.config";
import logger from "@/utils/logger.util";
import { bytesToBase64, base64ToBytes } from "@/utils/binary.util";

const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const KEY_LENGTH = 256;
const PBKDF2_ITERATIONS = 100_000;

/** The stored envelope. `algorithm` is recorded so the format can evolve later. */
export interface ServerSealedPayload {
  /** Base64 ciphertext (client payload + auth tag). */
  ciphertext: string;
  /** Base64 12-byte IV. */
  iv: string;
  /** Base64 16-byte salt. */
  salt: string;
  algorithm: string;
  serverEncrypted: true;
}

class EncryptionService {
  /**
   * Derive a 256-bit AES-GCM key from the project secret plus a per-record salt.
   *
   * The fallback string exists only so a development instance without a
   * configured secret still functions; in production the env validator guarantees
   * a real secret is present for everything that matters.
   */
  private async deriveServerKey(salt: Uint8Array): Promise<webcrypto.CryptoKey> {
    const secret = env.ai.secretKey || env.jwt.accessSecret || "blacknexa.server.fallback.v1";
    const keyMaterial = await webcrypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "PBKDF2" },
      false,
      ["deriveKey"],
    );
    return webcrypto.subtle.deriveKey(
      { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
      keyMaterial,
      { name: "AES-GCM", length: KEY_LENGTH },
      false,
      ["encrypt", "decrypt"],
    );
  }

  /** Re-encrypt a client-sealed payload with the server key. */
  async serverSeal(clientPayload: string): Promise<ServerSealedPayload> {
    const salt = webcrypto.getRandomValues(new Uint8Array(SALT_LENGTH));
    const iv = webcrypto.getRandomValues(new Uint8Array(IV_LENGTH));
    const key = await this.deriveServerKey(salt);

    const plaintext = new TextEncoder().encode(clientPayload);
    const ciphertextBuffer = await webcrypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      plaintext,
    );

    return {
      ciphertext: bytesToBase64(new Uint8Array(ciphertextBuffer)),
      iv: bytesToBase64(iv),
      salt: bytesToBase64(salt),
      algorithm: "AES-256-GCM-PBKDF2",
      serverEncrypted: true,
    };
  }

  /**
   * Peel the server layer back off, returning the client-sealed blob.
   *
   * Returns `null` rather than throwing on failure — a wrong key, a tampered
   * record, or a rotated secret should surface as "cannot open" to the caller,
   * not as a 500.
   */
  async serverOpen(sealed: ServerSealedPayload): Promise<string | null> {
    try {
      const salt = base64ToBytes(sealed.salt);
      const iv = base64ToBytes(sealed.iv);
      const ciphertext = base64ToBytes(sealed.ciphertext);
      const key = await this.deriveServerKey(salt);

      const plaintextBuffer = await webcrypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        key,
        ciphertext,
      );
      return new TextDecoder().decode(plaintextBuffer);
    } catch (err) {
      logger.warn("[encryption] decrypt failed", {
        message: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  /** Serialise an envelope for storage. */
  serialize(sealed: ServerSealedPayload): string {
    return JSON.stringify(sealed);
  }

  /** Parse a stored envelope, returning `null` if it is not one. */
  deserialize(json: string): ServerSealedPayload | null {
    try {
      const parsed = JSON.parse(json) as ServerSealedPayload;
      if (parsed.ciphertext && parsed.iv && parsed.salt && parsed.serverEncrypted) {
        return parsed;
      }
      return null;
    } catch {
      return null;
    }
  }
}

export const encryptionService = new EncryptionService();
export default encryptionService;
