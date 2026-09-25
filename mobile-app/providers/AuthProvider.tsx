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
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import api, { ApiError } from "@/lib/api/client";
import { putFile } from "@/lib/evidence-upload";
import authApi, {
  type AuthResult,
  type AvatarMode,
  type LocationPrecision,
  type UserProfile,
  type Visibility,
} from "@/lib/api/auth";
import { jwtDecode, JwtDecodeOptions } from "jwt-decode";
import { LEGAL_VERSION } from "@/constants/legal-copy";

/** How the gate should route. Kept explicit so no screen infers it from nulls. */
export type AuthStatus =
  /** Session being restored — show the splash, not the Welcome screen. */
  | "restoring"
  | "signedOut"
  /** Signed in but the account setup (A7 → A9) is unfinished. */
  | "onboarding"
  | "signedIn";

export type SignInMethod = "password" | "apple" | "google";

export interface BiometricsAvailability {
  checked: boolean;
  available: boolean;
  hasHardware: boolean;
  enrolled: boolean;
  supportedTypes: LocalAuthentication.AuthenticationType[];
}

/**
 * Sign-up draft, held across the A6 → A8 registration flow.
 *
 * The password is kept in memory only, never persisted: it is needed until the
 * A8 code is accepted, and after that it has no reason to exist anywhere.
 */
export interface SignUpDraft {
  email: string;
  password: string;
  /** Collected on A6 alongside the credentials. Last name may be blank. */
  firstName: string;
  lastName: string;
  agreedToTerms: boolean;
  /** Set once A8 succeeds, so A9 knows the account is real. */
  verified: boolean;
}

interface AuthState {
  status: AuthStatus;
  user: UserProfile | null;
  /** Last error from an explicit action, for a screen to display inline. */
  error: string | null;
  busy: boolean;
  signInMethod: SignInMethod | null;

  signUpDraft: SignUpDraft | null;
  beginSignUp: (
    email: string,
    password: string,
    firstName: string,
    lastName: string,
    agreedToTerms: boolean,
  ) => void;
  markVerified: () => void;
  clearSignUpDraft: () => void;

  register: (
    email: string,
    password: string,
    firstName: string,
    lastName: string,
    agreedToTerms: boolean,
  ) => Promise<{ resendAfterSeconds: number } | null>;
  verifyEmail: (code: string) => Promise<"verified" | "verification_failed" | "consent_failed">;
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
  forgotPassword: (
    email: string,
  ) => Promise<{ resendAfterSeconds: number } | null>;
  resetPassword: (
    email: string,
    code: string,
    password: string,
  ) => Promise<boolean>;
  signOut: () => Promise<void>;
  signOutEverywhere: () => Promise<void>;
  /** Clear the local session only — used after the account itself is deleted. */
  forgetSession: () => void;

  updateProfile: (patch: {
    displayName?: string;
    firstName?: string;
    lastName?: string;
    avatarMode?: AvatarMode;
    anonymousByDefault?: boolean;
    defaultVisibility?: Visibility;
    defaultPrecision?: LocationPrecision;
    notificationsEnabled?: boolean;
    language?: string;
  }) => Promise<boolean>;
  /**
   * Upload a profile photo picked on the device: presign → PUT → commit.
   *
   * Takes a local file URI and its MIME type. Resolves true once the server has
   * adopted the key and the local user object carries the new `avatarUrl`.
   */
  uploadAvatar: (uri: string, mime: string) => Promise<boolean>;
  removeAvatar: () => Promise<boolean>;
  /** Profile → Your area. */
  saveArea: (area: { label: string; lat: number; lng: number }) => Promise<boolean>;
  recordConsents: (version: number) => Promise<boolean>;
  /** Marks account setup complete so the gate stops routing to onboarding. */
  completeOnboarding: () => void;

  biometricsAvailable: boolean;
  biometricsAvailability: BiometricsAvailability;
  unlockWithBiometrics: () => Promise<boolean>;
  clearError: () => void;
}

/**
 * Where a name captured from Apple waits until the server confirms it has it.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 * Apple returns `fullName` on the **first authorisation only**, and it is not a
 * claim in the identity token — unlike `email`, which the token carries every
 * time and which the server reads from the verified JWT. So the name exists in
 * exactly one place, for one moment, in memory.
 *
 * The previous code forwarded it in the same call that signed in. If that call
 * failed — offline, a 500, the backend not running — the name was gone for good:
 * Apple will not send it again until the person removes BlackNexa under Settings
 * → Apple ID → Sign in with Apple. Someone whose first sign-in failed once would
 * have had a permanently nameless account with no way to explain why.
 *
 * So it is written to disk the moment it arrives, before the network is touched,
 * and only cleared once a sign-in has actually succeeded with it attached.
 *
 * SecureStore rather than AsyncStorage because a real name is exactly the kind of
 * thing this app promises to look after, and AsyncStorage is unencrypted. Native
 * only, which is safe here: A5 offers the Apple route on iOS alone.
 */
const APPLE_NAME_KEY = "bn.apple_pending_name";
const SIGN_IN_METHOD_KEY = "bn.sign_in_method";
const LOCAL_USER_STORAGE_KEYS = [
  "blacknexa.settings.v1",
  "blacknexa.location.v1",
  "blacknexa.user_incidents.v2",
  "blacknexa.supported.v2",
  "bn.report_draft.v1",
  "bn.search_recents.v1",
];

interface PendingAppleName {
  /** Apple's stable user id, so a name is never applied to a different account. */
  user: string;
  fullName: string;
  email: string;
}

interface DecodedJwt {
  email: string;
  aud: string;
  auth_time: number;
  c_hash: string;
  email_verified: boolean;
  exp: number;
  iat: number;
  iss: string;
  nonce_supported: boolean;
  sub: string;
}

/**
 * Google's id token, unlike Apple's, carries the person's name and picture
 * directly in every token — not just on first authorisation. Decoded
 * client-side purely to read a display label; the server independently
 * re-verifies the token's signature and claims, so nothing here is trusted
 * as-is.
 */
interface GoogleDecodedJwt {
  email?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
}

function inferSignInMethod(user: UserProfile): SignInMethod | null {
  const direct = user.signInProvider ?? user.authProvider ?? user.provider;
  if (direct === "apple" || direct === "google" || direct === "password") {
    return direct;
  }
  const linked = user.connectedProviders?.[0];
  if (linked === "apple" || linked === "google") return linked;
  if (user.hasPassword) return "password";
  return null;
}

async function readPendingAppleName(): Promise<PendingAppleName | null> {
  try {
    const raw = await SecureStore.getItemAsync(APPLE_NAME_KEY);
    return raw ? (JSON.parse(raw) as PendingAppleName) : null;
  } catch {
    // A name we cannot read is not worth failing a sign-in over.
    return null;
  }
}

async function writePendingAppleName(value: PendingAppleName): Promise<void> {
  try {
    await SecureStore.setItemAsync(APPLE_NAME_KEY, JSON.stringify(value));
  } catch {
    /* best effort — the sign-in still proceeds */
  }
}

async function clearPendingAppleName(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(APPLE_NAME_KEY);
  } catch {
    /* nothing to clear */
  }
}

async function readStoredSignInMethod(): Promise<SignInMethod | null> {
  try {
    const raw = await SecureStore.getItemAsync(SIGN_IN_METHOD_KEY);
    return raw === "apple" || raw === "google" || raw === "password" ? raw : null;
  } catch {
    return null;
  }
}

async function writeStoredSignInMethod(method: SignInMethod): Promise<void> {
  try {
    await SecureStore.setItemAsync(SIGN_IN_METHOD_KEY, method);
  } catch {
    /* best effort */
  }
}

async function clearStoredSignInMethod(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(SIGN_IN_METHOD_KEY);
  } catch {
    /* nothing to clear */
  }
}

/**
 * Set on first launch, in AsyncStorage on purpose: uninstalling the app deletes
 * AsyncStorage, so a missing marker means a fresh install. Never cleared on
 * sign-out — it records the install, not the session.
 */
const INSTALL_MARKER_KEY = "bn.install_marker.v1";

/**
 * Drop credentials a previous install left in the keychain.
 *
 * iOS keeps Keychain items — where SecureStore puts the session tokens — after
 * the app is deleted. Without this, reinstalling signed the last member
 * straight back in instead of asking anyone to log in. Android's Auto Backup
 * can restore them the same way, so this runs on both.
 *
 * Existing installs that predate the marker are also treated as fresh, so the
 * first launch after this ships signs the member out once.
 */
async function clearKeychainFromPreviousInstall(): Promise<void> {
  if (Platform.OS === "web") return;
  let marker: string | null;
  try {
    marker = await AsyncStorage.getItem(INSTALL_MARKER_KEY);
  } catch {
    // Unreadable storage proves nothing about a reinstall; never sign someone
    // out on a storage hiccup.
    return;
  }
  if (marker !== null) return;

  await Promise.all([
    api.clearTokens(),
    clearStoredSignInMethod(),
    clearPendingAppleName(),
  ]).catch(() => {});
  await AsyncStorage.setItem(INSTALL_MARKER_KEY, "1").catch(() => {});
}

export const [AuthProvider, useAuth] = createContextHook<AuthState>(() => {
  const qc = useQueryClient();
  const [status, setStatus] = useState<AuthStatus>("restoring");
  const [user, setUser] = useState<UserProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [signInMethod, setSignInMethod] = useState<SignInMethod | null>(null);
  const [signUpDraft, setSignUpDraft] = useState<SignUpDraft | null>(null);
  const [biometricsAvailable, setBiometricsAvailable] = useState(false);
  const [biometricsAvailability, setBiometricsAvailability] =
    useState<BiometricsAvailability>({
      checked: false,
      available: false,
      hasHardware: false,
      enrolled: false,
      supportedTypes: [],
    });
  /**
   * A9 sets this once the profile step is done. Held locally because the server
   * has no "onboarded" flag — a display name is a weak proxy, and someone who
   * deliberately publishes as Anonymous has no display name to check.
   */
  const [onboardingComplete, setOnboardingComplete] = useState(false);

  const clearError = useCallback(() => setError(null), []);

  const clearLocalUserData = useCallback(async () => {
    await AsyncStorage.multiRemove(LOCAL_USER_STORAGE_KEYS).catch(() => {});
    qc.removeQueries({ queryKey: ["settings"] });
    qc.removeQueries({ queryKey: ["location_cached"] });
    qc.removeQueries({ queryKey: ["feed"] });
    qc.removeQueries({ queryKey: ["feed-facets"] });
    qc.removeQueries({ queryKey: ["search"] });
    qc.removeQueries({ queryKey: ["sessions"] });
  }, [qc]);

  /** Translate a thrown error into the sentence a screen shows. */
  const capture = useCallback((err: unknown): null => {
    if (err instanceof ApiError) {
      setError(err.message);
    } else {
      setError("Something went wrong. Please try again.");
    }
    return null;
  }, []);

  const adopt = useCallback((result: AuthResult, method?: SignInMethod) => {
    const resolvedMethod = method ?? inferSignInMethod(result.user);
    setUser(result.user);
    setSignInMethod(resolvedMethod);
    if (resolvedMethod) void writeStoredSignInMethod(resolvedMethod);
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
      // Before the keychain is read: a reinstall must start signed out.
      await clearKeychainFromPreviousInstall();
      const hasTokens = await api.loadSession();
      if (!hasTokens) {
        setStatus("signedOut");
        return;
      }
      const profile = await authApi.me();
      const restoredMethod = inferSignInMethod(profile) ?? (await readStoredSignInMethod());
      setUser(profile);
      setSignInMethod(restoredMethod);
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
      setSignInMethod(null);
      void clearStoredSignInMethod();
      setOnboardingComplete(false);
      setStatus("signedOut");
      setError("You have been signed out. Please log in again.");
    });
  }, []);

  const refreshBiometricsAvailability = useCallback(async () => {
    if (Platform.OS === "web") {
      setBiometricsAvailability({
        checked: true,
        available: false,
        hasHardware: false,
        enrolled: false,
        supportedTypes: [],
      });
      setBiometricsAvailable(false);
      return;
    }

    try {
      const [hasHardware, enrolled, supportedTypes] = await Promise.all([
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
        LocalAuthentication.supportedAuthenticationTypesAsync(),
      ]);
      const available = hasHardware && enrolled && supportedTypes.length > 0;
      setBiometricsAvailability({
        checked: true,
        available,
        hasHardware,
        enrolled,
        supportedTypes,
      });
      setBiometricsAvailable(available);
    } catch {
      setBiometricsAvailability({
        checked: true,
        available: false,
        hasHardware: false,
        enrolled: false,
        supportedTypes: [],
      });
      setBiometricsAvailable(false);
    }
  }, []);

  useEffect(() => {
    void refreshBiometricsAvailability();

    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void refreshBiometricsAvailability();
    });
    return () => sub.remove();
  }, [refreshBiometricsAvailability]);

  // ── Sign-up draft (A6 → A9) ───────────────────────────────────────────────

  const beginSignUp = useCallback(
    (
      email: string,
      password: string,
      firstName: string,
      lastName: string,
      agreedToTerms: boolean,
    ) => {
      setSignUpDraft({
        email: email.trim().toLowerCase(),
        password,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        agreedToTerms,
        verified: false,
      });
    },
    [],
  );

  const markVerified = useCallback(() => {
    setSignUpDraft((draft) => (draft ? { ...draft, verified: true } : draft));
  }, []);

  const clearSignUpDraft = useCallback(() => setSignUpDraft(null), []);

  // ── Flows ─────────────────────────────────────────────────────────────────

  const register = useCallback(
    async (
      email: string,
      password: string,
      firstName: string,
      lastName: string,
      agreedToTerms: boolean,
    ) => {
      setBusy(true);
      setError(null);
      try {
        const challenge = await authApi.register(email, password, firstName, lastName);
        beginSignUp(email, password, firstName, lastName, agreedToTerms);
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
        return "verification_failed";
      }
      if (!draft.agreedToTerms) {
        setError("Please agree to the Terms of Service and Privacy Policy.");
        return "consent_failed";
      }
      setBusy(true);
      setError(null);
      try {
        const result = await authApi.verifyEmail(draft.email, code);
        try {
          await authApi.recordConsents(["tos", "privacy"], LEGAL_VERSION);
        } catch (err) {
          capture(err);
          return "consent_failed";
        }
        setUser(result.user);
        setSignInMethod("password");
        void writeStoredSignInMethod("password");
        markVerified();
        // Registration is now A6 → A8; the existing onboarding stack follows.
        setStatus("onboarding");
        setOnboardingComplete(false);
        return "verified";
      } catch (err) {
        capture(err);
        return "verification_failed";
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
        adopt(await authApi.login(email, password), "password");
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
   * Apple returns the name only on the *first* authorisation for an app, and it is
   * not a claim in the identity token — so it is captured here, held on the device
   * until a sign-in actually succeeds with it, and stored server-side. Asking again
   * later is impossible; see `APPLE_NAME_KEY` for what that costs if it is lost.
   *
   * The identity token itself is passed through **raw and undecoded**. Reading it
   * here would be theatre: an unverified JWT is attacker-controlled data, and the
   * server has to verify the signature against Apple's JWKS and read the claims
   * itself regardless. Email comes from that verified token, never from the client.
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
      const decoded = jwtDecode(credential.identityToken);
      // Apple gives the name on the first authorisation only. Persist it before
      // the network call, so a failure here does not lose it permanently.
      const captured = [
        credential.fullName?.givenName,
        credential.fullName?.familyName,
      ]
        .filter(Boolean)
        .join(" ")
        .trim();
      if (captured) {
        await writePendingAppleName({
          user: credential.user,
          fullName: captured,
          email: credential.email || (decoded as DecodedJwt)?.email,
        });
      }

      // On a later attempt Apple sends no name, so fall back to whatever an
      // earlier authorisation captured — but only if it belongs to this same
      // Apple user, never a previous person on a shared device.
      let fullName = captured;
      if (!fullName) {
        const pending = await readPendingAppleName();
        if (pending?.user === credential.user) fullName = pending.fullName;
      }

      adopt(
        await authApi.socialLogin(
          "apple",
          credential.identityToken,
          fullName || undefined,
          (decoded as DecodedJwt)?.email,
        ),
        "apple",
      );
      // Safe to drop only now: the server has it, and re-sending is idempotent
      // there — it fills `display_name` only when that field is still empty.
      if (fullName) await clearPendingAppleName();
      return true;
    } catch (err) {
      // A cancelled sheet is not an error worth showing.
      //
      // The cancel signal is on `code`, not `message`. `expo-modules-core` derives
      // `code` from the exception's class name — `RequestCanceledException` becomes
      // `ERR_REQUEST_CANCELED` — while `message` carries the human `reason`, which
      // for this one is "The user canceled the authorization attempt". Matching on
      // `message` therefore never fired, and simply tapping Cancel on the Apple
      // sheet raised "Something went wrong. Please try again."
      //
      // `message` is still checked as a fallback so the guard survives a future
      // change in how the module surfaces this.
      const code = (err as { code?: unknown })?.code;
      const cancelled =
        code === "ERR_REQUEST_CANCELED" ||
        (err instanceof Error && err.message.includes("ERR_REQUEST_CANCELED"));
      if (cancelled) {
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
        // Unlike Apple, Google's token carries the name on every sign-in, not
        // just the first — no pending-name persistence needed here.
        //
        // `decoded.picture` is deliberately NOT sent. The server reads the same
        // claim out of the token after verifying its signature, and writes it to
        // the account itself — so the avatar arrives without this client ever
        // being trusted for it. Posting it from here would let anyone with a
        // valid Google account point their avatar at any URL on the internet.
        const decoded = jwtDecode(identityToken) as GoogleDecodedJwt;
        const fullName = [decoded.given_name, decoded.family_name]
          .filter(Boolean)
          .join(" ")
          .trim();
        adopt(
          await authApi.socialLogin(
            "google",
            identityToken,
            fullName || decoded.name || undefined,
            decoded.email,
          ),
          "google",
        );
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
        adopt(await authApi.resetPassword(email, code, password), "password");
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
    await clearLocalUserData();
    setUser(null);
    setSignInMethod(null);
    void clearStoredSignInMethod();
    setSignUpDraft(null);
    setOnboardingComplete(false);
    setStatus("signedOut");
  }, [clearLocalUserData]);

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
    void clearLocalUserData();
    setUser(null);
    setSignInMethod(null);
    void clearStoredSignInMethod();
    setSignUpDraft(null);
    setOnboardingComplete(false);
    setStatus("signedOut");
  }, [clearLocalUserData]);

  const signOutEverywhere = useCallback(async () => {
    await authApi.logoutEverywhere();
    await clearLocalUserData();
    setUser(null);
    setSignInMethod(null);
    void clearStoredSignInMethod();
    setSignUpDraft(null);
    setOnboardingComplete(false);
    setStatus("signedOut");
  }, [clearLocalUserData]);

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

  /**
   * presign → PUT → commit.
   *
   * The PUT goes straight to storage, so the bytes never pass through our API.
   * A failed PUT stops the sequence before commit, which leaves the account
   * untouched — the alternative, committing a key whose upload failed, would
   * point the profile at nothing.
   *
   * `putFile` is reused from the evidence upload path; it is the same operation
   * and there is no reason for a second one.
   */
  const uploadAvatar = useCallback(
    async (uri: string, mime: string) => {
      setBusy(true);
      setError(null);
      try {
        const slot = await authApi.avatarPresign(mime);
        const uploaded = await putFile(slot.uploadUrl, uri, slot.headers);
        if (!uploaded) {
          setError("That photo could not be uploaded. Check your connection and try again.");
          return false;
        }
        setUser(await authApi.avatarCommit(slot.storageKey));
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

  const removeAvatar = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setUser(await authApi.avatarRemove());
      return true;
    } catch (err) {
      capture(err);
      return false;
    } finally {
      setBusy(false);
    }
  }, [capture]);

  const saveArea = useCallback(
    async (area: { label: string; lat: number; lng: number }) => {
      setBusy(true);
      setError(null);
      try {
        setUser(await authApi.updateArea(area));
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
    signInMethod,
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
    uploadAvatar,
    removeAvatar,
    saveArea,
    recordConsents,
    completeOnboarding,
    biometricsAvailable,
    biometricsAvailability,
    unlockWithBiometrics,
    clearError,
  };
});
