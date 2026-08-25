/**
 * App-user (end user) types.
 *
 * Distinct from `admin.interface.ts`: an operator token and a member token share
 * the JWT machinery but never each other's audience, so `aud` keeps them apart at
 * the guard.
 *
 * ── Why anonymity is not an auth mode ────────────────────────────────────────
 * The design is explicit (screen C9): "Anyone in the community feed, without your
 * name or photo. Moderators can still see who filed it." Anonymity is therefore a
 * **display property of a report or a comment**, not a way of being unauthenticated.
 * Every report has a real owner, resolved from the access token — never from the
 * request body — and `user_id` is never serialised into a response.
 */

/**
 * Roles a member account can hold.
 *
 * `advocate` is what Trusted Circle visibility means — the design describes that
 * audience as "verified advocates", who are members reading member content.
 *
 * There is deliberately no `moderator` here: moderation is an operator function on
 * `admin_users` (see `AdminRole`), so a member token can never satisfy a
 * moderation route. Granting it is an administrative act with an audit trail, not
 * a field on a community profile.
 */
export type UserRole = "member" | "advocate";

export const ALL_USER_ROLES: UserRole[] = ["member", "advocate"];

/** How a member's avatar is rendered — screen A9. */
export type AvatarMode = "photo" | "initials" | "anonymous";

export const ALL_AVATAR_MODES: AvatarMode[] = ["photo", "initials", "anonymous"];

/** Who can see a report by default — screens A9 and C6. */
export type Visibility = "public" | "trusted" | "private";

export const ALL_VISIBILITIES: Visibility[] = ["public", "trusted", "private"];

/** How precisely a location is published — screen C4. */
export type LocationPrecision = "exact" | "approximate" | "hidden";

export const ALL_PRECISIONS: LocationPrecision[] = ["exact", "approximate", "hidden"];

/** Account lifecycle. `deleted` rows are retained only until the erasure job runs. */
export type UserStatus = "active" | "suspended" | "deleted";

/** Federated identity providers offered on screen A5. */
export type SocialProvider = "apple" | "google";

/** Purpose of a one-time code. A code minted for one purpose cannot serve another. */
export type OtpPurpose = "verify_email" | "reset_password" | "confirm_deletion";

/** Legal documents a member consents to on screen A7. */
export type ConsentDocument = "tos" | "privacy";

// ─────────────────────────────────────────────────────────────────────────────
// Wire shapes
// ─────────────────────────────────────────────────────────────────────────────

/** Member preferences. Every field is a default that some later screen pre-fills. */
export interface UserPreferences {
  /** Pre-fills the anonymity switch on C6 and on the D4 comment composer. */
  anonymousByDefault: boolean;
  /** Pre-fills the visibility choice on C6. A9 recommends `trusted`. */
  defaultVisibility: Visibility;
  /** Labelled `YOUR DEFAULT` on C4 — deliberately *not* pre-selected there. */
  defaultPrecision: LocationPrecision;
  /**
   * One switch, not four. Screen A11 is explicit about this, and
   * `urgent_safety` notifications ignore it entirely — enforced server-side.
   */
  notificationsEnabled: boolean;
  language: string;
}

/** Public (secret-free) member representation. */
export interface UserProfile {
  id: string;
  email: string;
  emailVerified: boolean;
  displayName: string;
  avatarMode: AvatarMode;
  avatarUrl: string | null;
  /** Derived from the display name; rendered in the A9/D1 avatar tile. */
  initials: string;
  role: UserRole;
  /** True once a password exists — false for an Apple/Google-only account. */
  hasPassword: boolean;
  preferences: UserPreferences;
  createdAt: string;
}

/** A signed-in device. Surfaced in Profile → Security so A15 is verifiable. */
export interface SessionSummary {
  id: string;
  deviceLabel: string;
  platform: string;
  lastSeenAt: string;
  createdAt: string;
  /** True for the session that made the request. */
  current: boolean;
}

export interface UserTokenPair {
  accessToken: string;
  refreshToken: string;
  tokenType: "Bearer";
  expiresIn: string;
}

/** Returned by every endpoint that establishes or extends a session. */
export interface UserAuthResult {
  user: UserProfile;
  tokens: UserTokenPair;
}

/**
 * Returned by register and by forgot-password.
 *
 * Deliberately carries no signal about whether an account exists: screens A10 and
 * A13 both promise the response is identical either way, so this shape is the
 * same on every path and the copy lives on the client.
 */
export interface OtpChallengeResult {
  /** Seconds until a resend is permitted — drives the A8/A14 countdown. */
  resendAfterSeconds: number;
  /** Seconds until the code stops working. A13's copy promises fifteen minutes. */
  expiresInSeconds: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Request DTOs
// ─────────────────────────────────────────────────────────────────────────────

export interface RegisterDto {
  email: string;
  password: string;
  deviceLabel?: string;
  platform?: string;
}

export interface VerifyEmailDto {
  email: string;
  code: string;
  deviceLabel?: string;
  platform?: string;
}

export interface LoginDto {
  email: string;
  password: string;
  deviceLabel?: string;
  platform?: string;
}

export interface SocialLoginDto {
  provider: SocialProvider;
  /** The provider's signed identity token, verified against its JWKS. */
  identityToken: string;
  /** Apple returns the name only on first authorisation, so accept it here. */
  fullName?: string;
  deviceLabel?: string;
  platform?: string;
}

export interface ResendCodeDto {
  email: string;
  purpose: OtpPurpose;
}

export interface ForgotPasswordDto {
  email: string;
}

export interface ResetPasswordDto {
  email: string;
  code: string;
  password: string;
  deviceLabel?: string;
  platform?: string;
}

export interface UpdateProfileDto {
  displayName?: string;
  avatarMode?: AvatarMode;
  anonymousByDefault?: boolean;
  defaultVisibility?: Visibility;
  defaultPrecision?: LocationPrecision;
  notificationsEnabled?: boolean;
  language?: string;
}

export interface RecordConsentDto {
  documents: ConsentDocument[];
  version: number;
}

export interface RegisterDeviceDto {
  pushToken: string;
  platform?: string;
  deviceLabel?: string;
}
