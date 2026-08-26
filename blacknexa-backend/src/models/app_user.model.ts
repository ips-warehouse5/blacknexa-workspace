/**
 * `app_users` — end-user accounts, plus the four tables that support them.
 *
 * Separate from `admin_users` on purpose. An operator and a member are different
 * kinds of actor with different lifecycles, different role sets and different
 * token audiences, and merging them would mean one table where half the columns
 * are always null and every query needs a discriminator.
 *
 * ── Why `user_sessions` exists ───────────────────────────────────────────────
 * `admin_users` tracks its refresh token in a single `refresh_token_id` column,
 * which permits exactly one live session per account. Screen A15 promises "You're
 * logged in on this device. Every other device has been signed out." — a
 * statement one column cannot express, because it needs to keep *this* session
 * while revoking the rest. Hence a row per device.
 *
 * ── Soft delete ─────────────────────────────────────────────────────────────
 * `app_users` is paranoid: a deleted account still has reports, comments and
 * flags whose foreign keys must resolve while the erasure job works through them.
 * `status = "deleted"` is the authoritative signal for the application; the
 * `deleted_on` timestamp is the audit trail. The child tables below are *not*
 * paranoid — a revoked session or a consumed code has no history worth keeping.
 */

import bcrypt from "bcryptjs";
import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from "sequelize";
import sequelize from "@/config/database.config";
import { BASE_OPTIONS, SOFT_DELETE_OPTIONS } from "@/models/model_options";
import env from "@/config/env.config";
import { uuidv4 } from "@/utils/id.util";
import type {
  AvatarMode,
  ConsentDocument,
  LocationPrecision,
  OtpPurpose,
  SocialProvider,
  UserRole,
  UserStatus,
  Visibility,
} from "@/types/user.interface";

// ─────────────────────────────────────────────────────────────────────────────
// app_users
// ─────────────────────────────────────────────────────────────────────────────

export class AppUser extends Model<
  InferAttributes<AppUser>,
  InferCreationAttributes<AppUser>
> {
  declare id: CreationOptional<string>;
  declare email: string;
  /** Null until the A8 code is accepted. An unverified account cannot sign in. */
  declare email_verified_at: CreationOptional<string | null>;
  /** bcrypt hash. Null for an account created through Apple or Google only. */
  declare password_hash: CreationOptional<string | null>;
  declare display_name: CreationOptional<string>;
  declare avatar_mode: CreationOptional<AvatarMode>;
  /** Storage key for an uploaded avatar, never a URL. */
  declare avatar_key: CreationOptional<string | null>;
  declare role: CreationOptional<UserRole>;
  declare status: CreationOptional<UserStatus>;

  // ── Preferences (screens A9, A11, C4, C6) ────────────────────────────────
  declare anonymous_by_default: CreationOptional<boolean>;
  declare default_visibility: CreationOptional<Visibility>;
  declare default_precision: CreationOptional<LocationPrecision>;
  /** One switch, not four — screen A11. `urgent_safety` ignores it. */
  declare notifications_enabled: CreationOptional<boolean>;
  declare language: CreationOptional<string>;

  declare last_login_at: CreationOptional<string | null>;

  /** Constant-time comparison against the stored hash. */
  async verifyPassword(candidate: string): Promise<boolean> {
    if (!this.password_hash) return false;
    return bcrypt.compare(candidate, this.password_hash);
  }
}

AppUser.init(
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      allowNull: false,
      defaultValue: DataTypes.UUIDV4,
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: "app_users_email_unique",
      validate: { isEmail: true },
    },
    email_verified_at: {
      type: DataTypes.STRING(32),
      allowNull: true,
      defaultValue: null,
    },
    password_hash: {
      type: DataTypes.STRING(255),
      allowNull: true,
      defaultValue: null,
    },
    display_name: {
      type: DataTypes.STRING(120),
      allowNull: false,
      defaultValue: "",
    },
    avatar_mode: {
      type: DataTypes.STRING(16),
      allowNull: false,
      defaultValue: "initials",
    },
    avatar_key: {
      type: DataTypes.STRING(512),
      allowNull: true,
      defaultValue: null,
    },
    role: {
      type: DataTypes.STRING(16),
      allowNull: false,
      defaultValue: "member",
    },
    status: {
      type: DataTypes.STRING(16),
      allowNull: false,
      defaultValue: "active",
    },
    anonymous_by_default: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    default_visibility: {
      type: DataTypes.STRING(16),
      allowNull: false,
      // A9 marks Trusted Circle as RECOMMENDED, so that is the default a new
      // account carries into C6 rather than the most public option.
      defaultValue: "trusted",
    },
    default_precision: {
      type: DataTypes.STRING(16),
      allowNull: false,
      defaultValue: "approximate",
    },
    notifications_enabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    language: {
      type: DataTypes.STRING(8),
      allowNull: false,
      defaultValue: "en",
    },
    last_login_at: {
      type: DataTypes.STRING(32),
      allowNull: true,
      defaultValue: null,
    },
  },
  {
    sequelize,
    modelName: "AppUser",
    tableName: "app_users",
    ...SOFT_DELETE_OPTIONS,
    defaultScope: {
      // A hash must be asked for explicitly, so it cannot reach a response by
      // someone forgetting to strip it.
      attributes: { exclude: ["password_hash"] },
    },
    scopes: {
      withSecret: { attributes: { include: ["password_hash"] } },
    },
    indexes: [
      { name: "idx_app_users_status", fields: ["status"] },
      { name: "idx_app_users_role", fields: ["role"] },
    ],
  },
);

AppUser.beforeValidate((user) => {
  if (!user.id) user.id = uuidv4();
  if (user.email) user.email = user.email.trim().toLowerCase();
});

/**
 * Hash on the way in.
 *
 * Mirrors `admin_user.model.ts`: a plaintext password cannot reach the database
 * even if a caller forgets to hash. The bcrypt-hash shape check makes the hook
 * idempotent, so re-saving a loaded row does not double-hash.
 */
AppUser.beforeSave(async (user) => {
  if (!user.changed("password_hash")) return;
  const value = user.password_hash;
  if (!value) return;
  if (/^\$2[aby]\$\d{2}\$/.test(value)) return;
  user.password_hash = await bcrypt.hash(value, env.bcryptSaltRounds);
});

// ─────────────────────────────────────────────────────────────────────────────
// user_sessions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One row per signed-in device.
 *
 * `refresh_jti` rotates on every refresh, so a replayed refresh token fails even
 * though its signature is still valid. `revoked_at` is set rather than the row
 * deleted, because Profile → Security shows a session list and a user who revokes
 * a device should see it disappear from *that* list, not from history.
 */
export class UserSession extends Model<
  InferAttributes<UserSession>,
  InferCreationAttributes<UserSession>
> {
  declare id: CreationOptional<string>;
  declare user_id: string;
  /** Current refresh-token id. Rotated on every refresh. */
  declare refresh_jti: string;
  declare device_label: CreationOptional<string>;
  declare platform: CreationOptional<string>;
  /** Expo push token. Cleared when the session is revoked, so pushes stop too. */
  declare push_token: CreationOptional<string | null>;
  declare last_seen_at: CreationOptional<string>;
  declare revoked_at: CreationOptional<string | null>;
}

UserSession.init(
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      allowNull: false,
      defaultValue: DataTypes.UUIDV4,
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    refresh_jti: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: "user_sessions_jti_unique",
    },
    device_label: {
      type: DataTypes.STRING(120),
      allowNull: false,
      defaultValue: "Unknown device",
    },
    platform: {
      type: DataTypes.STRING(16),
      allowNull: false,
      defaultValue: "unknown",
    },
    push_token: {
      type: DataTypes.STRING(255),
      allowNull: true,
      defaultValue: null,
    },
    last_seen_at: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: "",
    },
    revoked_at: {
      type: DataTypes.STRING(32),
      allowNull: true,
      defaultValue: null,
    },
  },
  {
    sequelize,
    modelName: "UserSession",
    tableName: "user_sessions",
    ...BASE_OPTIONS,
    indexes: [
      { name: "idx_user_sessions_user", fields: ["user_id"] },
      { name: "idx_user_sessions_push", fields: ["push_token"] },
    ],
  },
);

UserSession.beforeValidate((row) => {
  if (!row.id) row.id = uuidv4();
});

// ─────────────────────────────────────────────────────────────────────────────
// user_identities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Apple / Google links.
 *
 * `provider_subject` is the provider's stable user id, which is what actually
 * identifies the account — an email can change, and Apple's private relay means
 * the address we see may not be the one the person recognises.
 */
export class UserIdentity extends Model<
  InferAttributes<UserIdentity>,
  InferCreationAttributes<UserIdentity>
> {
  declare id: CreationOptional<string>;
  declare user_id: string;
  declare provider: SocialProvider;
  declare provider_subject: string;
  /** Email as the provider reported it, for support — not used for lookup. */
  declare provider_email: CreationOptional<string | null>;
  /**
   * True when `provider_email` is an Apple "Hide My Email" forwarding address.
   *
   * The real address is not obtainable — Apple exposes no API for it. What this
   * records is that mail to this account depends on Apple's forwarder, which drops
   * anything from a sender not registered for Sign in with Apple email
   * communication, and does so without a bounce. It is the difference between
   * "they mistyped their address" and "our sender is not registered".
   */
  declare provider_email_is_private: CreationOptional<boolean>;
  declare linked_at: string;
}

UserIdentity.init(
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      allowNull: false,
      defaultValue: DataTypes.UUIDV4,
    },
    user_id: { type: DataTypes.UUID, allowNull: false },
    provider: { type: DataTypes.STRING(16), allowNull: false },
    provider_subject: { type: DataTypes.STRING(255), allowNull: false },
    provider_email: { type: DataTypes.STRING(255), allowNull: true, defaultValue: null },
    provider_email_is_private: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    linked_at: { type: DataTypes.STRING(32), allowNull: false },
  },
  {
    sequelize,
    modelName: "UserIdentity",
    tableName: "user_identities",
    ...BASE_OPTIONS,
    indexes: [
      {
        name: "idx_user_identities_provider_subject",
        unique: true,
        fields: ["provider", "provider_subject"],
      },
      { name: "idx_user_identities_user", fields: ["user_id"] },
    ],
  },
);

UserIdentity.beforeValidate((row) => {
  if (!row.id) row.id = uuidv4();
});

// ─────────────────────────────────────────────────────────────────────────────
// email_otps
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One-time codes for A8 (verify) and A14 (reset).
 *
 * The code is stored as a bcrypt hash, not in the clear: a database leak must not
 * hand over live verification codes. `attempts` is checked before comparison so a
 * six-digit code cannot be brute-forced, and `consumed_at` makes a code single-use
 * even within its TTL.
 *
 * Rows are keyed by email rather than by user id, because A13 must behave
 * identically for an address that has no account — looking up a user first would
 * make the two paths distinguishable by timing.
 */
export class EmailOtp extends Model<
  InferAttributes<EmailOtp>,
  InferCreationAttributes<EmailOtp>
> {
  declare id: CreationOptional<string>;
  declare email: string;
  declare purpose: OtpPurpose;
  declare code_hash: string;
  declare expires_at: string;
  declare attempts: CreationOptional<number>;
  declare consumed_at: CreationOptional<string | null>;
  /** When the code was last sent, so the resend cooldown is enforceable. */
  declare sent_at: string;
}

EmailOtp.init(
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      allowNull: false,
      defaultValue: DataTypes.UUIDV4,
    },
    email: { type: DataTypes.STRING(255), allowNull: false },
    purpose: { type: DataTypes.STRING(32), allowNull: false },
    code_hash: { type: DataTypes.STRING(255), allowNull: false },
    expires_at: { type: DataTypes.STRING(32), allowNull: false },
    attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    consumed_at: { type: DataTypes.STRING(32), allowNull: true, defaultValue: null },
    sent_at: { type: DataTypes.STRING(32), allowNull: false },
  },
  {
    sequelize,
    modelName: "EmailOtp",
    tableName: "email_otps",
    ...BASE_OPTIONS,
    indexes: [
      { name: "idx_email_otps_lookup", fields: ["email", "purpose"] },
      { name: "idx_email_otps_expiry", fields: ["expires_at"] },
    ],
  },
);

EmailOtp.beforeValidate((row) => {
  if (!row.id) row.id = uuidv4();
  if (row.email) row.email = row.email.trim().toLowerCase();
});

// ─────────────────────────────────────────────────────────────────────────────
// password_history
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Backs A14's requirement row: "Not a password you have used here before."
 *
 * Only the last few hashes are kept — enough to make the promise true, not enough
 * to become a liability. Every entry is a bcrypt hash, so this table is no more
 * sensitive than the live one.
 */
export class PasswordHistory extends Model<
  InferAttributes<PasswordHistory>,
  InferCreationAttributes<PasswordHistory>
> {
  declare id: CreationOptional<string>;
  declare user_id: string;
  declare password_hash: string;
}

PasswordHistory.init(
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      allowNull: false,
      defaultValue: DataTypes.UUIDV4,
    },
    user_id: { type: DataTypes.UUID, allowNull: false },
    password_hash: { type: DataTypes.STRING(255), allowNull: false },
  },
  {
    sequelize,
    modelName: "PasswordHistory",
    tableName: "password_history",
    ...BASE_OPTIONS,
    indexes: [{ name: "idx_password_history_user", fields: ["user_id"] }],
  },
);

PasswordHistory.beforeValidate((row) => {
  if (!row.id) row.id = uuidv4();
});

/** How many previous passwords A14 checks against. */
export const PASSWORD_HISTORY_DEPTH = 5;

// ─────────────────────────────────────────────────────────────────────────────
// user_consents
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A7's two agreements, recorded per document and per version.
 *
 * One row per acceptance, never an update, so the record answers "what did this
 * person agree to, and when" for any version — which is the only form of consent
 * record worth keeping. The IP is hashed: it is evidence of a distinct
 * acceptance, not something we need to be able to read back.
 */
export class UserConsent extends Model<
  InferAttributes<UserConsent>,
  InferCreationAttributes<UserConsent>
> {
  declare id: CreationOptional<string>;
  declare user_id: string;
  declare document: ConsentDocument;
  declare version: number;
  declare agreed_at: string;
  declare ip_hash: CreationOptional<string | null>;
  declare user_agent: CreationOptional<string | null>;
}

UserConsent.init(
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      allowNull: false,
      defaultValue: DataTypes.UUIDV4,
    },
    user_id: { type: DataTypes.UUID, allowNull: false },
    document: { type: DataTypes.STRING(16), allowNull: false },
    version: { type: DataTypes.INTEGER, allowNull: false },
    agreed_at: { type: DataTypes.STRING(32), allowNull: false },
    ip_hash: { type: DataTypes.STRING(128), allowNull: true, defaultValue: null },
    user_agent: { type: DataTypes.STRING(512), allowNull: true, defaultValue: null },
  },
  {
    sequelize,
    modelName: "UserConsent",
    tableName: "user_consents",
    ...BASE_OPTIONS,
    indexes: [{ name: "idx_user_consents_user", fields: ["user_id", "document"] }],
  },
);

UserConsent.beforeValidate((row) => {
  if (!row.id) row.id = uuidv4();
});

/**
 * Proof that a deletion request was honoured — without keeping the person.
 *
 * Two things have to be true at once: the account and everything identifying about
 * it must be gone, and we must be able to answer "did you actually delete me?"
 * months later. So this row keeps a SHA-256 of the lowercased email and nothing
 * else about the human. A support request arriving from that address can be hashed
 * and matched; the row on its own reveals no address at all.
 *
 * The counts are here because they are the part a person asks about — "what
 * happened to my reports?" — and reconstructing them afterwards is impossible.
 */
export class AccountDeletion extends Model<
  InferAttributes<AccountDeletion>,
  InferCreationAttributes<AccountDeletion>
> {
  declare id: CreationOptional<string>;
  /** SHA-256 of the lowercased, trimmed email. Never the email. */
  declare email_hash: string;
  declare disposition: "sever" | "erase";
  declare reports_severed: CreationOptional<number>;
  declare reports_erased: CreationOptional<number>;
  declare comments_removed: CreationOptional<number>;
  declare requested_at: string;
}

AccountDeletion.init(
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      allowNull: false,
      defaultValue: DataTypes.UUIDV4,
    },
    email_hash: { type: DataTypes.STRING(64), allowNull: false },
    disposition: { type: DataTypes.STRING(8), allowNull: false },
    reports_severed: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    reports_erased: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    comments_removed: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    requested_at: { type: DataTypes.STRING(32), allowNull: false },
  },
  {
    sequelize,
    modelName: "AccountDeletion",
    tableName: "account_deletions",
    ...BASE_OPTIONS,
    indexes: [{ name: "idx_account_deletions_hash", fields: ["email_hash"] }],
  },
);

AccountDeletion.beforeValidate((row) => {
  if (!row.id) row.id = uuidv4();
});

export default AppUser;
