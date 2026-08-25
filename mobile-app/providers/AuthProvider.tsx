/**
 * Authentication state for the whole app.
 *
 * Replaces the previous provider, which authenticated against an external Rork
 * OAuth host. That arrangement cannot work with this design: every report has an
 * owner in *our* database (screen C9 — "Moderators can still see who filed it"),
 * so the identity has to be ours too. Apple and Google now sign in natively and
 * the backend verifies the provider's identity token.
 *
 * ── What this provider is responsible for ──────────────────────────────────
 *   • The signed-in member, and the boot-time restore of a stored session.
 *   • The sign-up flow's own state (A6 → A9), which spans four screens and must
 *     survive a back-navigation without losing what was typed.
 *   • Reacting to an involuntary sign-out — a revoked device, a rotated refresh
 *     token — which the API client reports and which no screen should have to
 *     detect for itself.
 *
 * Token storage, refresh and the single-flight mutex all live in
 * `lib/api/client.ts`; this provider never touches a token directly.
 */

import createContextHook from "@nkzw/create-context-hook";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import * as LocalAuthentication from "expo-local-authentication";
import api, { ApiError } from "@/lib/api/client";
import authApi, {
  type AuthResult,
  type AvatarMode,
  type LocationPrecision,
  type UserProfile,
  type Visibility,
} from "@/lib/api/auth";

/** How the gate should route. Kept explicit so no screen infers it from nulls. */
export type AuthStatus =
  /** Session being restored — show the splash, not the Welcome screen. */
  | "restoring"
  | "signedOut"
  /** Signed in but the account setup (A7 → A9) is unfinished. */
  | "onboarding"
  | "signedIn";

/**
 * Sign-up draft, held across A6 → A9.
 *
 * The password is kept in memory only, never persisted: it is needed until the
 * A8 code is accepted, and after that it has no reason to exist anywhere.
 */
export interface SignUpDraft {
  email: string;
  password: string;
  /** Set once A8 succeeds, so A9 knows the account is real. */
  verified: boolean;
}

interface AuthState {
  status: AuthStatus;
  user: UserProfile | null;
  /** Last error from an explicit action, for a screen to display inline. */
  error: string | null;
  busy: boolean;

  signUpDraft: SignUpDraft | null;
  beginSignUp: (email: string, password: string) => void;
  markVerified: () => void;
  clearSignUpDraft: () => void;

  register: (email: string, password: string) => Promise<{ resendAfterSeconds: number } | null>;
  verifyEmail: (code: string) => Promise<boolean>;
  resendVerification: () => Promise<number | null>;
  login: (email: string, password: string) => Promise<boolean>;
  signInWithApple: () => Promise<boolean>;
  /**
   * Google's identity token, obtained by the caller.
   *
   * The provider takes a token rather than running the flow itself because
   * `expo-auth-session` exposes the request as a hook, which has to live in a
   * component. The screen owns the hook; the verification and account resolution
   * happen here and on the server.
   */
  signInWithGoogleToken: (identityToken: string) => Promise<boolean>;
  forgotPassword: (email: string) => Promise<{ resendAfterSeconds: number } | null>;
  resetPassword: (email: string, code: string, password: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  signOutEverywhere: () => Promise<void>;
  /** Clear the local session only — used after the account itself is deleted. */
  forgetSession: () => void;

  updateProfile: (patch: {
    displayName?: string;
    avatarMode?: AvatarMode;
    anonymousByDefault?: boolean;
    defaultVisibility?: Visibility;
    defaultPrecision?: LocationPrecision;
    notificationsEnabled?: boolean;
    language?: string;
  }) => Promise<boolean>;
  recordConsents: (version: number) => Promise<boolean>;
  /** Marks account setup complete so the gate stops routing to onboarding. */
  completeOnboarding: () => void;

  biometricsAvailable: boolean;
  unlockWithBiometrics: () => Promise<boolean>;
  clearError: () => void;
}

export const [AuthProvider, useAuth] = createContextHook<AuthState>(() => {
  const [status, setStatus] = useState<AuthStatus>("restoring");
  const [user, setUser] = useState<UserProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [signUpDraft, setSignUpDraft] = useState<SignUpDraft | null>(null);
  const [biometricsAvailable, setBiometricsAvailable] = useState(false);
  /**
   * A9 sets this once the profile step is done. Held locally because the server
   * has no "onboarded" flag — a display name is a weak proxy, and someone who
   * deliberately publishes as Anonymous has no display name to check.
   */
  const [onboardingComplete, setOnboardingComplete] = useState(false);

  const clearError = useCallback(() => setError(null), []);

  /** Translate a thrown error into the sentence a screen shows. */
  const capture = useCallback((err: unknown): null => {
    if (err instanceof ApiError) {
      setError(err.message);
    } else {
      setError("Something went wrong. Please try again.");
    }
    return null;
  }, []);

  const adopt = useCallback((result: AuthResult) => {
    setUser(result.user);
    setError(null);
    // A fresh sign-in on an existing account skips onboarding; a brand-new
    // account is walked through A7 → A9 by the sign-up flow itself, which calls
    // `completeOnboarding` at the end.
    setStatus("signedIn");
    setOnboardingComplete(true);
  }, []);

  // ── Boot ──────────────────────────────────────────────────────────────────

  const restore = useCallback(async () => {
    try {
      const hasTokens = await api.loadSession();
      if (!hasTokens) {
        setStatus("signedOut");
        return;
      }
      const profile = await authApi.me();
      setUser(profile);
      setOnboardingComplete(true);
      setStatus("signedIn");
    } catch (err) {
      // An expired-and-unrefreshable session means signed out. A network failure
      // does not — but there is nothing to show without a profile either, so the
      // gate sends the person to Welcome and a retry costs one tap.
      if (err instanceof ApiError && err.isAuthError) {
        await api.clearTokens();
      }
      setStatus("signedOut");
    }
  }, []);

  useEffect(() => {
    void restore();
  }, [restore]);

  /** Involuntary sign-out: the API client hit an unrecoverable 401. */
  useEffect(() => {
    return api.onSignOut(() => {
      setUser(null);
      setOnboardingComplete(false);
      setStatus("signedOut");
      setError("You have been signed out. Please log in again.");
    });
  }, []);

  useEffect(() => {
    if (Platform.OS === "web") return;
    void (async () => {
      const [hasHardware, isEnrolled] = await Promise.all([
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
      ]);
      setBiometricsAvailable(hasHardware && isEnrolled);
    })();
  }, []);

  // ── Sign-up draft (A6 → A9) ───────────────────────────────────────────────

  const beginSignUp = useCallback((email: string, password: string) => {
    setSignUpDraft({ email: email.trim().toLowerCase(), password, verified: false });
  }, []);

  const markVerified = useCallback(() => {
    setSignUpDraft((draft) => (draft ? { ...draft, verified: true } : draft));
  }, []);

  const clearSignUpDraft = useCallback(() => setSignUpDraft(null), []);

  // ── Flows ─────────────────────────────────────────────────────────────────

  const register = useCallback(
    async (email: string, password: string) => {
      setBusy(true);
      setError(null);
      try {
        const challenge = await authApi.register(email, password);
        beginSignUp(email, password);
        return { resendAfterSeconds: challenge.resendAfterSeconds };
      } catch (err) {
        return capture(err);
      } finally {
        setBusy(false);
      }
    },
    [beginSignUp, capture],
  );

  const verifyEmail = useCallback(
    async (code: string) => {
      const draft = signUpDraft;
      if (!draft) {
        setError("Start again — we lost track of which address to verify.");
        return false;
      }
      setBusy(true);
      setError(null);
      try {
        const result = await authApi.verifyEmail(draft.email, code);
        setUser(result.user);
        markVerified();
        // Not `signedIn` yet: A7 and A9 still have to run, and the gate uses this
        // to keep the tab bar out of reach until they do.
        setStatus("onboarding");
        setOnboardingComplete(false);
        return true;
      } catch (err) {
        capture(err);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [capture, markVerified, signUpDraft],
  );

  const resendVerification = useCallback(async () => {
    const draft = signUpDraft;
    if (!draft) return null;
    try {
      const challenge = await authApi.resendCode(draft.email, "verify_email");
      return challenge.resendAfterSeconds;
    } catch (err) {
      return capture(err) as null;
    }
  }, [capture, signUpDraft]);

  const login = useCallback(
    async (email: string, password: string) => {
      setBusy(true);
      setError(null);
      try {
        adopt(await authApi.login(email, password));
        return true;
      } catch (err) {
        capture(err);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [adopt, capture],
  );

  /**
   * A5's "Continue with Apple".
   *
   * Apple returns the name only on the *first* authorisation for an app, so it is
   * forwarded here and persisted server-side — asking again later is impossible.
   */
  const signInWithApple = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) {
        setError("That sign-in did not complete. Please try again.");
        return false;
      }
      const fullName = [credential.fullName?.givenName, credential.fullName?.familyName]
        .filter(Boolean)
        .join(" ");
      adopt(
        await authApi.socialLogin("apple", credential.identityToken, fullName || undefined),
      );
      return true;
    } catch (err) {
      // A cancelled sheet is not an error worth showing.
      if (err instanceof Error && err.message.includes("ERR_REQUEST_CANCELED")) {
        return false;
      }
      capture(err);
      return false;
    } finally {
      setBusy(false);
    }
  }, [adopt, capture]);

  const signInWithGoogleToken = useCallback(
    async (identityToken: string) => {
      setBusy(true);
      setError(null);
      try {
        adopt(await authApi.socialLogin("google", identityToken));
        return true;
      } catch (err) {
        capture(err);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [adopt, capture],
  );

  const forgotPassword = useCallback(
    async (email: string) => {
      setBusy(true);
      setError(null);
      try {
        const challenge = await authApi.forgotPassword(email);
        return { resendAfterSeconds: challenge.resendAfterSeconds };
      } catch (err) {
        return capture(err);
      } finally {
        setBusy(false);
      }
    },
    [capture],
  );

  const resetPassword = useCallback(
    async (email: string, code: string, password: string) => {
      setBusy(true);
      setError(null);
      try {
        adopt(await authApi.resetPassword(email, code, password));
        return true;
      } catch (err) {
        capture(err);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [adopt, capture],
  );

  const signOut = useCallback(async () => {
    await authApi.logout();
    setUser(null);
    setSignUpDraft(null);
    setOnboardingComplete(false);
    setStatus("signedOut");
  }, []);

  /**
   * Drop the local session without telling the server.
   *
   * For the one case where the account is already gone: after a delete, the tokens
   * cannot be refreshed and `POST /auth/logout` would fail against an account that
   * no longer exists — turning a successful deletion into a visible error. The API
   * layer has already cleared the stored tokens by then; this clears the state that
   * decides which stack renders.
   */
  const forgetSession = useCallback(() => {
    setUser(null);
    setSignUpDraft(null);
    setOnboardingComplete(false);
    setStatus("signedOut");
  }, []);

  const signOutEverywhere = useCallback(async () => {
    await authApi.logoutEverywhere();
    setUser(null);
    setSignUpDraft(null);
    setOnboardingComplete(false);
    setStatus("signedOut");
  }, []);

  const updateProfile = useCallback(
    async (patch: Parameters<AuthState["updateProfile"]>[0]) => {
      setBusy(true);
      setError(null);
      try {
        setUser(await authApi.updateProfile(patch));
        return true;
      } catch (err) {
        capture(err);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [capture],
  );

  const recordConsents = useCallback(
    async (version: number) => {
      try {
        await authApi.recordConsents(["tos", "privacy"], version);
        return true;
      } catch (err) {
        capture(err);
        return false;
      }
    },
    [capture],
  );

  const completeOnboarding = useCallback(() => {
    setOnboardingComplete(true);
    setStatus("signedIn");
    setSignUpDraft(null);
  }, []);

  /** A10's "Use Face ID". Gates the stored session rather than replacing it. */
  const unlockWithBiometrics = useCallback(async () => {
    if (!biometricsAvailable) return false;
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: "Unlock BlackNexa",
      // Falls back to the device passcode rather than dead-ending when a face or
      // fingerprint is not recognised.
      disableDeviceFallback: false,
    });
    if (!result.success) return false;
    // The refresh token is already on the device; a successful prompt is
    // permission to use it.
    await restore();
    return true;
  }, [biometricsAvailable, restore]);

  /** Guards against a stale status flicker if `restore` resolves after a sign-in. */
  const settled = useRef(false);
  useEffect(() => {
    if (status !== "restoring") settled.current = true;
  }, [status]);

  const effectiveStatus = useMemo<AuthStatus>(() => {
    if (status === "signedIn" && !onboardingComplete) return "onboarding";
    return status;
  }, [onboardingComplete, status]);

  return {
    status: effectiveStatus,
    user,
    error,
    busy,
    signUpDraft,
    beginSignUp,
    markVerified,
    clearSignUpDraft,
    register,
    verifyEmail,
    resendVerification,
    login,
    signInWithApple,
    signInWithGoogleToken,
    forgotPassword,
    resetPassword,
    signOut,
    signOutEverywhere,
    forgetSession,
    updateProfile,
    recordConsents,
    completeOnboarding,
    biometricsAvailable,
    unlockWithBiometrics,
    clearError,
  };
});
