/**
 * `admin_credentials` — short-lived one-time codes for operator sign-in.
 *
 * Two flows share this table because they are the same mechanism with different
 * consequences: a second-factor challenge issued after a correct password, and
 * a password-reset code issued to an email address. Both are a hashed secret
 * with an expiry, an attempt counter, and a single-use flag.
 *
 * The code is stored hashed, not in the clear. A six-digit code is weak enough
 * to brute-force offline in moments, so the hash is not much protection on its
 * own — but a database dump should not hand someone a live MFA code for every
 * pending sign-in, and the attempt counter is what actually makes guessing fail.
 *
 * Rows are consumed on use and swept by the maintenance job; nothing here is
 * meant to be long-lived.
 */

import crypto from "crypto";
import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
} from "sequelize";

import sequelize from "@/config/database.config";
import { BASE_OPTIONS } from "@/models/model_options";
import { uuidv4 } from "@/utils/id.util";

/** What the code is for. Determines what consuming it permits. */
export type CredentialPurpose = "mfa" | "password_reset";

/* Keeps the derived getters out of the inferred column set — see AdminUser. */
type AdminCredentialGetters = "isExpired" | "isUsable" | "secondsRemaining";

export class AdminCredential extends Model<
  InferAttributes<AdminCredential, { omit: AdminCredentialGetters }>,
  InferCreationAttributes<AdminCredential, { omit: AdminCredentialGetters }>
> {
  declare id: CreationOptional<string>;
  declare admin_id: string;
  declare purpose: CredentialPurpose;
  /** SHA-256 of the code. The code itself is never stored. */
  declare code_hash: string;
  declare expires_at: string;
  /** Wrong guesses so far. The row dies once this reaches the cap. */
  declare attempts: CreationOptional<number>;
  /** Set when the code is successfully used, so it cannot be replayed. */
  declare consumed_at: CreationOptional<string | null>;
  /** How many times a replacement code has been requested for this sign-in. */
  declare resend_count: CreationOptional<number>;

  get isExpired(): boolean {
    return new Date(this.expires_at).getTime() <= Date.now();
  }

  get isUsable(): boolean {
    return !this.consumed_at && !this.isExpired;
  }

  /** Seconds until this challenge expires, floored at zero. */
  get secondsRemaining(): number {
    const remaining = new Date(this.expires_at).getTime() - Date.now();
    return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
  }
}

/**
 * Hash a code for storage and comparison.
 *
 * SHA-256 rather than bcrypt, deliberately. These codes live for minutes and are
 * rate-limited by the attempt counter, so the work factor bcrypt buys is not
 * what protects them — and a slow hash on the verify path would make the
 * endpoint trivial to use as a CPU exhaustion lever.
 */
export function hashCode(code: string): string {
  return crypto.createHash("sha256").update(code.trim()).digest("hex");
}

/**
 * Generate a numeric code of `length` digits.
 *
 * `randomInt` rather than `Math.random`: this is a credential, and
 * `Math.random` is a predictable PRNG. `randomInt` also avoids the modulo bias
 * that `randomBytes % 10` would introduce.
 */
export function generateCode(length = 6): string {
  let out = "";
  for (let i = 0; i < length; i++) out += crypto.randomInt(0, 10).toString();
  return out;
}

AdminCredential.init(
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      allowNull: false,
      defaultValue: DataTypes.UUIDV4,
    },
    admin_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    purpose: {
      type: DataTypes.STRING(24),
      allowNull: false,
    },
    code_hash: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    expires_at: {
      type: DataTypes.STRING(32),
      allowNull: false,
    },
    attempts: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    consumed_at: {
      type: DataTypes.STRING(32),
      allowNull: true,
    },
    resend_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    sequelize,
    modelName: "AdminCredential",
    tableName: "admin_credentials",
    // No soft delete: these are ephemeral secrets. Keeping a "deleted" copy of
    // a credential row is the opposite of what this table is for.
    ...BASE_OPTIONS,
    hooks: {
      beforeValidate(instance) {
        if (!instance.id) instance.id = uuidv4();
      },
    },
    indexes: [
      { name: "idx_admin_cred_admin", fields: ["admin_id", "purpose"] },
      // Supports the sweep of expired rows.
      { name: "idx_admin_cred_expiry", fields: ["expires_at"] },
    ],
  },
);

export default AdminCredential;
