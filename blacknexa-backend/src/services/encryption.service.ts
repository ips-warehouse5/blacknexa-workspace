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
 *
 * ── The key chain (docs/INCIDENT_MODULE_PLAN.md §5.5, §7.9) ─────────────────
 * The server key used to be derived from `AI_TOOLKIT_SECRET_KEY`, falling back
 * to `JWT_ACCESS_SECRET`. That coupled every sealed report body to an AI vendor
 * key: moving AI to the Python engine (and so removing the toolkit key from
 * Node), or rotating the JWT secret, would silently make every existing body
 * unreadable — and `openBody` then served the ciphertext as if it were text.
 * The moderation pipeline must read bodies reliably, so the key is now:
 *
 *   • **sealing** — `SERVER_ENCRYPTION_SECRET` when it is set; otherwise the
 *     legacy secret, exactly as before (nothing changes until it is set);
 *   • **opening** — `SERVER_ENCRYPTION_SECRET` first, then every secret the
 *     legacy rule could have used (toolkit key, JWT access secret, the dev
 *     fallback), in that order.
 *
 * Setting `SERVER_ENCRYPTION_SECRET` is therefore safe on a live database: new
 * rows seal with it, existing rows still open with whichever legacy secret
 * sealed them, and removing the toolkit key later no longer loses data as long
 * as the JWT secret (or, for rows sealed under it, the toolkit key) is still
 * configured. The envelope format is byte-for-byte unchanged — the key used is
 * not recorded in it, which is what keeps old rows readable without a
 * migration, at the cost of one extra PBKDF2 derivation for a legacy row.
 *
 * `openSealedStrict` is the pipeline's reader: it returns `null` rather than
 * the stored ciphertext when nothing can open a body, so the report is held as
 * `content_unreadable` instead of the AI being shown ciphertext (§5.3 step 2).
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

/** The development-only last resort the legacy rule used. Kept for old rows. */
const LEGACY_FALLBACK_SECRET = "blacknexa.server.fallback.v1";

class EncryptionService {
  /**
   * The secret new envelopes are sealed with: `SERVER_ENCRYPTION_SECRET`, or
   * the legacy rule when it is unset.
   *
   * The fallback string exists only so a development instance without a
   * configured secret still functions; in production the env validator guarantees
   * a real secret is present for everything that matters.
   */
  private sealingSecret(): string {
    return env.serverEncryptionSecret || this.legacySecret();
  }

  /** The pre-revision-2 rule, unchanged. */
  private legacySecret(): string {
    return env.ai.secretKey || env.jwt.accessSecret || LEGACY_FALLBACK_SECRET;
  }

  /**
   * Every secret an existing envelope may have been sealed with, most likely
   * first: the dedicated secret, then each secret the legacy rule could have
   * picked at the time of sealing. Deduplicated and never empty.
   */
  private openingSecrets(): string[] {
    const candidates = [
      env.serverEncryptionSecret,
      env.ai.secretKey,
      env.jwt.accessSecret,
      LEGACY_FALLBACK_SECRET,
    ].filter((secret): secret is string => Boolean(secret));
    return [...new Set(candidates)];
  }

  /** Derive a 256-bit AES-GCM key from a secret plus a per-record salt. */
  private async deriveServerKey(secret: string, salt: Uint8Array): Promise<webcrypto.CryptoKey> {
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
    const key = await this.deriveServerKey(this.sealingSecret(), salt);

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
   * Tries each secret of the key chain in turn (see the file header). Returns
   * `null` rather than throwing on failure — a wrong key, a tampered record, or
   * a rotated secret should surface as "cannot open" to the caller, not as a
   * 500. AES-GCM authenticates, so a wrong key fails loudly rather than
   * yielding garbage, which is what makes trying several keys safe.
   */
  async serverOpen(sealed: ServerSealedPayload): Promise<string | null> {
    let salt: Uint8Array;
    let iv: Uint8Array;
    let ciphertext: Uint8Array;
    try {
      salt = base64ToBytes(sealed.salt);
      iv = base64ToBytes(sealed.iv);
      ciphertext = base64ToBytes(sealed.ciphertext);
    } catch (err) {
      logger.warn("[encryption] decrypt failed", {
        message: err instanceof Error ? err.message : String(err),
      });
      return null;
    }

    const secrets = this.openingSecrets();
    let lastError: unknown = null;
    for (let index = 0; index < secrets.length; index += 1) {
      try {
        const key = await this.deriveServerKey(secrets[index], salt);
        const plaintextBuffer = await webcrypto.subtle.decrypt(
          { name: "AES-GCM", iv },
          key,
          ciphertext,
        );
        if (index > 0 && env.serverEncryptionSecret) {
          // Expected for rows sealed before the dedicated secret was set; worth
          // seeing at debug level while those rows still exist.
          logger.debug("[encryption] opened with a legacy key", { position: index });
        }
        return new TextDecoder().decode(plaintextBuffer);
      } catch (err) {
        lastError = err;
      }
    }

    logger.warn("[encryption] decrypt failed", {
      message: lastError instanceof Error ? lastError.message : String(lastError),
      keysTried: secrets.length,
    });
    return null;
  }

  /**
   * Open a stored, serialised envelope — or return `null`.
   *
   * Strict in both directions: a value that is not an envelope is `null` (the
   * caller decides what a plaintext row means, using `body_encrypted`), and an
   * envelope no key can open is `null`. Never returns the stored ciphertext as
   * if it were text, which is what the lenient readers fall back to.
   */
  async openSealedStrict(serialized: string): Promise<string | null> {
    const sealed = this.deserialize(serialized);
    if (!sealed) return null;
    return this.serverOpen(sealed);
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
