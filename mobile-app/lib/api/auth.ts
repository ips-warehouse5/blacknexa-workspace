/**
 * Auth endpoints — the typed surface behind screens A5 through A15.
 *
 * The register and forgot-password calls resolve successfully whether or not the
 * address has an account. That is not an oversight to work around: A10 and A13
 * both promise the app never reveals which, so the screens are written to say
 * "check your email" in either case and this module must not add a distinction
 * the server deliberately withheld.
 */

import { Platform } from "react-native";
import Constants from "expo-constants";
import api from "@/lib/api/client";

export type AvatarMode = "photo" | "initials" | "anonymous";
export type Visibility = "public" | "trusted" | "private";
export type LocationPrecision = "exact" | "approximate" | "hidden";
export type OtpPurpose = "verify_email" | "reset_password";
export type SocialProvider = "apple" | "google";

export interface UserPreferences {
  anonymousByDefault: boolean;
  defaultVisibility: Visibility;
  defaultPrecision: LocationPrecision;
  notificationsEnabled: boolean;
  language: string;
}

export interface UserProfile {
  id: string;
  email: string;
  emailVerified: boolean;
  displayName: string;
  avatarMode: AvatarMode;
  avatarUrl: string | null;
  initials: string;
  /** `advocate` unlocks Trusted Circle reading. Moderators are operator accounts. */
  role: "member" | "advocate";
  hasPassword: boolean;
  preferences: UserPreferences;
  createdAt: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  tokenType: "Bearer";
  expiresIn: string;
}

export interface AuthResult {
  user: UserProfile;
  tokens: TokenPair;
}

/** Backs the A8 / A14 resend countdown and the "expires in" copy. */
export interface OtpChallenge {
  resendAfterSeconds: number;
  expiresInSeconds: number;
}

export interface SessionSummary {
  id: string;
  deviceLabel: string;
  platform: string;
  lastSeenAt: string;
  createdAt: string;
  current: boolean;
}

/**
 * Device context for the session list in Profile → Security.
 *
 * A recognisable label is the difference between "revoke the right device" and
 * guessing, so the model name is used where the OS exposes it.
 */
function deviceContext(): { deviceLabel: string; platform: string } {
  const fallback =
    Platform.OS === "ios"
      ? "iPhone"
      : Platform.OS === "android"
        ? "Android device"
        : "Browser";
  const name = Constants.deviceName ?? fallback;
  return {
    deviceLabel: name.slice(0, 120),
    platform:
      Platform.OS === "ios"
        ? "ios"
        : Platform.OS === "android"
          ? "android"
          : "web",
  };
}

/** Store the tokens from any call that establishes a session. */
async function adopt(result: AuthResult): Promise<AuthResult> {
  await api.setTokens(result.tokens.accessToken, result.tokens.refreshToken);
  return result;
}

/**
 * What the server did, returned by `deleteAccount`.
 *
 * The screen shows this back before signing out: "deleted" on its own leaves the
 * person wondering what happened to the reports they chose to keep.
 */
export interface DeletionReceipt {
  disposition: "sever" | "erase";
  reportsSevered: number;
  reportsErased: number;
  commentsRemoved: number;
  supportsRemoved: number;
  corroborationsRemoved: number;
  /** ISO date after which sealed files are destroyed. Null when nothing was erased. */
  filesPurgedAfter: string | null;
}

export const authApi = {
  /** A6 → A8. Resolves even for an address that already has an account. */
  register(email: string, password: string): Promise<OtpChallenge> {
    return api.post<OtpChallenge>(
      "/auth/register",
      { email, password, ...deviceContext() },
      { anonymous: true },
    );
  },

  /** A8. Signs the member in on success. */
  async verifyEmail(email: string, code: string): Promise<AuthResult> {
    const result = await api.post<AuthResult>(
      "/auth/verify-email",
      { email, code, ...deviceContext() },
      { anonymous: true },
    );
    return adopt(result);
  },

  /** A8 and A14's "Resend code in 0:24". */
  resendCode(email: string, purpose: OtpPurpose): Promise<OtpChallenge> {
    return api.post<OtpChallenge>(
      "/auth/resend-code",
      { email, purpose },
      { anonymous: true },
    );
  },

  /** A10. */
  async login(email: string, password: string): Promise<AuthResult> {
    const result = await api.post<AuthResult>(
      "/auth/login",
      { email, password, ...deviceContext() },
      { anonymous: true },
    );
    return adopt(result);
  },

  /** A5's Apple and Google routes. */
  async socialLogin(
    provider: SocialProvider,
    identityToken: string,
    fullName?: string,
    email?: string,
  ): Promise<AuthResult> {
    const result = await api.post<AuthResult>(
      `/auth/oauth/${provider}`,
      { identityToken, fullName, email, ...deviceContext() },
      { anonymous: true },
    );
    return adopt(result);
  },

  /** A13. Same response whether or not the address is registered. */
  forgotPassword(email: string): Promise<OtpChallenge> {
    return api.post<OtpChallenge>(
      "/auth/password/forgot",
      { email },
      { anonymous: true },
    );
  },

  /** A14 → A15. Signs in here and ends every other session. */
  async resetPassword(
    email: string,
    code: string,
    password: string,
  ): Promise<AuthResult> {
    const result = await api.post<AuthResult>(
      "/auth/password/reset",
      { email, code, password, ...deviceContext() },
      { anonymous: true },
    );
    return adopt(result);
  },

  me(): Promise<UserProfile> {
    return api.get<UserProfile>("/auth/me");
  },

  /** Revokes this device only. Clears local tokens regardless of the result. */
  async logout(): Promise<void> {
    try {
      await api.post("/auth/logout");
    } finally {
      // A failed round trip must not leave the app looking signed in.
      await api.clearTokens();
    }
  },

  async logoutEverywhere(): Promise<void> {
    try {
      await api.post("/auth/logout-all");
    } finally {
      await api.clearTokens();
    }
  },

  /** A9 and Profile → Defaults. */
  updateProfile(patch: {
    displayName?: string;
    avatarMode?: AvatarMode;
    anonymousByDefault?: boolean;
    defaultVisibility?: Visibility;
    defaultPrecision?: LocationPrecision;
    notificationsEnabled?: boolean;
    language?: string;
  }): Promise<UserProfile> {
    return api.patch<UserProfile>("/users/me", patch);
  },

  sessions(): Promise<SessionSummary[]> {
    return api.get<SessionSummary[]>("/users/me/sessions");
  },

  /** A7. One record per acceptance, per document. */
  recordConsents(
    documents: ("tos" | "privacy")[],
    version: number,
  ): Promise<null> {
    return api.post<null>("/users/me/consents", { documents, version });
  },

  /** A11, once the OS prompt is accepted. */
  registerPushToken(pushToken: string): Promise<null> {
    return api.post<null>("/users/me/devices", {
      pushToken,
      ...deviceContext(),
    });
  },

  /**
   * Profile → Delete account.
   *
   * `disposition` decides what happens to the reports the person filed; the server
   * treats it as required, so the screen cannot submit without a choice.
   *
   * `password` for accounts that have one, `code` for Apple- and Google-only
   * accounts — the server names which it wants if neither fits, and the tokens are
   * dropped locally whichever way it goes: once the account is gone the tokens
   * cannot be refreshed, and keeping them would leave the app looking signed in.
   */
  async deleteAccount(input: {
    disposition: "sever" | "erase";
    password?: string;
    code?: string;
  }): Promise<DeletionReceipt> {
    const receipt = await api.delete<DeletionReceipt>("/users/me", input);
    await api.clearTokens();
    return receipt;
  },

  /** For accounts with no password, which have nothing to re-type. */
  requestDeletionCode(): Promise<null> {
    return api.post<null>("/users/me/deletion-code", {});
  },
};

export default authApi;
