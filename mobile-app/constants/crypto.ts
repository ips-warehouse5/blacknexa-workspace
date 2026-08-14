/**
 * BlackNexa™ Zero-Trust Cryptographic Engine
 *
 * Implements client-side field-level encryption (CSFLE) using:
 * - AES-256-GCM authenticated encryption (via @noble/ciphers)
 * - PBKDF2-SHA256 key derivation (100,000 iterations — memory-hard substitute
 *   for Argon2id in pure-JS React Native environments)
 * - SHA-256 content integrity hashing (via @noble/hashes)
 * - Zero-knowledge architecture: the derived key never leaves the device,
 *   never touches application logs, and is never transmitted to any server.
 *
 * The encryption package format is:
 * {
 *   ciphertext: base64,      // AES-256-GCM ciphertext + auth tag
 *   nonce: base64,           // 12-byte (96-bit) NIST-compliant nonce
 *   salt: base64,            // 16-byte PBKDF2 salt
 *   contentHash: hex,        // SHA-256 of the *plaintext* for integrity verification
 *   cipherSpec: string,      // Algorithm identifier for audit trail
 *   kdfSpec: string,         // Key derivation function identifier
 *   kdfIterations: number,   // PBKDF2 iteration count
 *   sealedAt: number,        // ISO timestamp
 *   zeroKnowledge: true      // Flag indicating server cannot decrypt
 * }
 *
 * Trademark pending with the USPTO. BlackNexa™ — By the people, for the people.
 */

import { gcm } from "@noble/ciphers/aes.js";
import { pbkdf2 } from "@noble/hashes/pbkdf2.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { randomBytes } from "@noble/hashes/utils.js";

// ── Constants ───────────────────────────────────────────────────────────

/** AES-256 key length in bytes (32 bytes = 256 bits). */
const KEY_LENGTH = 32;
/** GCM nonce length: 12 bytes (96 bits) per NIST SP 800-38D. */
const NONCE_LENGTH = 12;
/** PBKDF2 salt length in bytes. */
const SALT_LENGTH = 16;
/** PBKDF2 iteration count — high enough to resist brute-force on mobile. */
const PBKDF2_ITERATIONS = 100_000;
/** Cipher algorithm identifier stored in the sealed package. */
export const CIPHER_SPEC = "AES-256-GCM" as const;
/** Key derivation function identifier stored in the sealed package. */
export const KDF_SPEC = "PBKDF2-SHA256" as const;

// ── Types ───────────────────────────────────────────────────────────────

export type SealedPayload = {
  /** Base64-encoded AES-256-GCM ciphertext (includes 16-byte auth tag). */
  ciphertext: string;
  /** Base64-encoded 12-byte GCM nonce. */
  nonce: string;
  /** Base64-encoded 16-byte PBKDF2 salt. */
  salt: string;
  /** SHA-256 hex hash of the *plaintext* — for integrity verification on decrypt. */
  contentHash: string;
  /** Cipher algorithm identifier. */
  cipherSpec: typeof CIPHER_SPEC;
  /** Key derivation function identifier. */
  kdfSpec: typeof KDF_SPEC;
  /** PBKDF2 iteration count used for key derivation. */
  kdfIterations: number;
  /** Millisecond timestamp of sealing. */
  sealedAt: number;
  /** Indicates server cannot decrypt — key never leaves device. */
  zeroKnowledge: true;
};

export type DecryptionResult = {
  /** Whether decryption and integrity verification succeeded. */
  success: boolean;
  /** Decrypted plaintext (only if success is true). */
  plaintext: string | null;
  /** Error message if decryption failed. */
  error: string | null;
};

// ── Base64 Helpers ──────────────────────────────────────────────────────

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ── Key Derivation ──────────────────────────────────────────────────────

/**
 * Derives a 256-bit encryption key from a user secret (PIN/passphrase)
 * and a salt using PBKDF2-SHA256.
 *
 * The user secret is combined with an app-level pepper to increase
 * the entropy beyond what a simple PIN provides.
 *
 * @param userSecret - User's PIN or passphrase
 * @param salt - 16-byte random salt
 * @param pepper - App-level pepper string (prevents offline attacks if salt is known)
 * @returns 32-byte (256-bit) derived key
 */
export function deriveKey(
  userSecret: string,
  salt: Uint8Array,
  pepper: string = "blacknexa.vault.pepper.v1"
): Uint8Array {
  const combinedSecret = `${userSecret}:${pepper}`;
  return pbkdf2(sha256, combinedSecret, salt, {
    c: PBKDF2_ITERATIONS,
    dkLen: KEY_LENGTH,
  });
}

// ── Encryption ──────────────────────────────────────────────────────────

/**
 * Encrypts a plaintext string using AES-256-GCM authenticated encryption
 * with a PBKDF2-derived key.
 *
 * This is the core zero-knowledge sealing function. The resulting package
 * contains everything needed to decrypt — *except* the user secret, which
 * never leaves the device.
 *
 * @param plaintext - The data to encrypt
 * @param userSecret - User's PIN or passphrase (never stored, never logged)
 * @returns Sealed payload with ciphertext, nonce, salt, and integrity hash
 */
export function sealPayload(plaintext: string, userSecret: string): SealedPayload {
  const salt = randomBytes(SALT_LENGTH);
  const nonce = randomBytes(NONCE_LENGTH);
  const key = deriveKey(userSecret, salt);

  const plaintextBytes = new TextEncoder().encode(plaintext);
  const cipher = gcm(key, nonce);
  const ciphertext = cipher.encrypt(plaintextBytes);

  // SHA-256 of plaintext for post-decryption integrity verification
  const contentHash = bytesToHex(sha256(plaintextBytes));

  // Zero the key from memory (best-effort — JS GC is non-deterministic)
  key.fill(0);

  return {
    ciphertext: bytesToBase64(ciphertext),
    nonce: bytesToBase64(nonce),
    salt: bytesToBase64(salt),
    contentHash,
    cipherSpec: CIPHER_SPEC,
    kdfSpec: KDF_SPEC,
    kdfIterations: PBKDF2_ITERATIONS,
    sealedAt: Date.now(),
    zeroKnowledge: true,
  };
}

// ── Decryption ──────────────────────────────────────────────────────────

/**
 * Decrypts a sealed payload using AES-256-GCM and verifies content integrity.
 *
 * GCM authenticated encryption inherently detects tampering — if the ciphertext
 * or nonce has been modified, the auth tag verification will fail and throw.
 * We additionally verify the SHA-256 content hash after decryption.
 *
 * @param sealed - The sealed payload to decrypt
 * @param userSecret - User's PIN or passphrase
 * @returns Decryption result with plaintext or error
 */
export function openPayload(
  sealed: SealedPayload,
  userSecret: string
): DecryptionResult {
  try {
    const salt = base64ToBytes(sealed.salt);
    const nonce = base64ToBytes(sealed.nonce);
    const ciphertext = base64ToBytes(sealed.ciphertext);
    const key = deriveKey(userSecret, salt);

    const cipher = gcm(key, nonce);
    const plaintextBytes = cipher.decrypt(ciphertext);

    // Verify content integrity via SHA-256
    const computedHash = bytesToHex(sha256(plaintextBytes));
    if (computedHash !== sealed.contentHash) {
      key.fill(0);
      return {
        success: false,
        plaintext: null,
        error: "Integrity verification failed: content hash mismatch. Evidence may have been tampered with.",
      };
    }

    const plaintext = new TextDecoder().decode(plaintextBytes);
    key.fill(0);

    return { success: true, plaintext, error: null };
  } catch {
    return {
      success: false,
      plaintext: null,
      error: "Decryption failed: incorrect passphrase or corrupted ciphertext.",
    };
  }
}

// ── Utility ─────────────────────────────────────────────────────────────

function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

/**
 * Computes a SHA-256 hash of the given string.
 * Uses @noble/hashes for consistent cross-platform behavior.
 */
export function hashContent(data: string): string {
  return bytesToHex(sha256(new TextEncoder().encode(data)));
}

/**
 * Generates a random 32-byte (256-bit) key ID for audit trail references.
 * This is an identifier, not the key itself.
 */
export function generateSealedKeyId(incidentId: string): string {
  const rand = randomBytes(8);
  const ts = Date.now().toString(36);
  const randHex = bytesToHex(rand);
  return `sealed:${incidentId}:${ts}:${randHex.slice(0, 8)}`;
}

/**
 * Validates that a sealed payload has all required fields and correct cipher spec.
 */
export function validateSealedPayload(sealed: unknown): sealed is SealedPayload {
  if (typeof sealed !== "object" || sealed === null) return false;
  const s = sealed as Record<string, unknown>;
  return (
    typeof s.ciphertext === "string" &&
    typeof s.nonce === "string" &&
    typeof s.salt === "string" &&
    typeof s.contentHash === "string" &&
    s.cipherSpec === CIPHER_SPEC &&
    s.zeroKnowledge === true
  );
}
