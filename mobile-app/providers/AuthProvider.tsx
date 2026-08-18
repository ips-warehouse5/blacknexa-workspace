import createContextHook from "@nkzw/create-context-hook";
import * as Linking from "expo-linking";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/utils/apiClient";

const AUTH_URL = process.env.EXPO_PUBLIC_RORK_AUTH_URL ?? "";
const APP_KEY = process.env.EXPO_PUBLIC_RORK_APP_KEY ?? "";
const PROJECT_ID = process.env.EXPO_PUBLIC_PROJECT_ID ?? "";

/** Authenticated user surfaced from the Rork JWT payload. */
export type AuthUser = {
  id: string;
  email: string;
  name?: string;
  picture?: string;
};

type AuthState = {
  user: AuthUser | null;
  isLoading: boolean;
  isSigningIn: boolean;
  error: string | null;
  signIn: (provider: "google" | "apple") => Promise<AuthUser | null>;
  signOut: () => Promise<void>;
  clearError: () => void;
};

function generateCodeVerifier(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Decode the JWT payload to extract user info and check expiration. */
function userFromToken(token: string): AuthUser | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(base64));
    if (payload.exp && payload.exp * 1000 < Date.now()) return null;
    return {
      id: payload.sub,
      email: payload.email ?? "",
      name: payload.name,
      picture: payload.picture,
    };
  } catch {
    return null;
  }
}

export const [AuthProvider, useAuth] = createContextHook<AuthState>(() => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSigningIn, setIsSigningIn] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const codeVerifierRef = useRef<string | null>(null);
  /** Dedup ref: if two callers (Linking listener + WebBrowser result) race to
   * exchange the same OAuth code, they share one in-flight promise instead of
   * the second one silently failing because the verifier was already cleared. */
  const pendingExchangeRef = useRef<Promise<AuthUser | null> | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const refreshToken = useCallback(async (): Promise<void> => {
    const storedRefreshToken = await SecureStore.getItemAsync("refresh_token");
    if (!storedRefreshToken) {
      setUser(null);
      return;
    }
    try {
      const { ok, data } = await apiFetch<{ access_token: string }>(
        `${AUTH_URL}/oauth/refresh`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ app_key: APP_KEY, refresh_token: storedRefreshToken }),
        }
      );

      if (!ok || !data?.access_token) {
        await SecureStore.deleteItemAsync("access_token");
        await SecureStore.deleteItemAsync("refresh_token");
        setUser(null);
        return;
      }
      const access_token = data.access_token;
      await SecureStore.setItemAsync("access_token", access_token);
      setUser(userFromToken(access_token));
    } catch {
      setUser(null);
    }
  }, []);

  const checkAuth = useCallback(async (): Promise<void> => {
    try {
      const accessToken = await SecureStore.getItemAsync("access_token");
      if (!accessToken) {
        const refreshTokenStored = await SecureStore.getItemAsync("refresh_token");
        if (refreshTokenStored) await refreshToken();
        return;
      }
      const decoded = userFromToken(accessToken);
      if (decoded) {
        setUser(decoded);
      } else {
        await refreshToken();
      }
    } catch {
      /* ignore — user stays signed out */
    } finally {
      setIsLoading(false);
    }
  }, [refreshToken]);

  useEffect(() => {
    void checkAuth();
  }, [checkAuth]);

  const exchangeCode = useCallback(
    async (code: string): Promise<AuthUser | null> => {
      // Deduplicate: the Linking URL listener and WebBrowser.openAuthSessionAsync
      // can both resolve with the same code on native. Share one exchange.
      if (pendingExchangeRef.current) return pendingExchangeRef.current;
      const verifier = codeVerifierRef.current;
      if (!verifier) {
        // Already consumed by a parallel caller — surface the signed-in user if
        // the first exchange succeeded, otherwise null.
        return null;
      }
      const promise = (async (): Promise<AuthUser | null> => {
        codeVerifierRef.current = null;
        try {
          const { ok, status, data, error: fetchErr } = await apiFetch<{
            access_token?: string;
            refresh_token?: string;
            user?: AuthUser;
            error?: string;
          }>(`${AUTH_URL}/oauth/token`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ app_key: APP_KEY, code, code_verifier: verifier }),
          });

          if (!ok || !data?.access_token || !data?.refresh_token) {
            const message = data?.error ?? fetchErr ?? `Token exchange failed (${status})`;
            throw new Error(message);
          }

          const { access_token, refresh_token, user: userData } = data;
          await SecureStore.setItemAsync("access_token", access_token);
          await SecureStore.setItemAsync("refresh_token", refresh_token);
          const decoded = userFromToken(access_token);
          setUser(decoded ?? (userData as AuthUser) ?? null);
          return (decoded ?? (userData as AuthUser)) ?? null;
        } finally {
          pendingExchangeRef.current = null;
        }
      })();
      pendingExchangeRef.current = promise;
      return promise;
    },
    [],
  );

  useEffect(() => {
    const subscription = Linking.addEventListener("url", (event: { url: string }) => {
      try {
        const url = new URL(event.url);
        if (url.pathname === "/auth/callback") {
          const code = url.searchParams.get("code");
          if (code) void exchangeCode(code);
        }
      } catch {
        /* malformed deep link */
      }
    });
    return () => subscription.remove();
  }, [exchangeCode]);

  const signIn = useCallback(
    async (provider: "google" | "apple"): Promise<AuthUser | null> => {
      setIsSigningIn(true);
      setError(null);
      try {
        const verifier = generateCodeVerifier();
        const challenge = await generateCodeChallenge(verifier);
        codeVerifierRef.current = verifier;
        const isWeb = Platform.OS === "web";
        const target = "rn";
        const env = isWeb ? "preview" : "native";
        const response = await fetch(`${AUTH_URL}/oauth/initiate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ app_key: APP_KEY, provider, code_challenge: challenge, target, env }),
        });
        if (!response.ok) {
          codeVerifierRef.current = null;
          const body = await response.json().catch(() => ({}));
          const message = (body as { error?: string }).error ?? `Sign in failed (${response.status})`;
          setError(message);
          return null;
        }
        const { auth_url } = await response.json();
        if (isWeb) {
          const popup = window.open(auth_url, "_blank", "width=500,height=650");
          return await new Promise<AuthUser | null>((resolve) => {
            const onMessage = (event: MessageEvent) => {
              if (event.data?.type !== "rork_auth_callback") return;
              window.removeEventListener("message", onMessage);
              if (pollTimer) clearInterval(pollTimer);
              const code = event.data.code as string | undefined;
              if (code) {
                exchangeCode(code).then(resolve, () => resolve(null));
              } else {
                resolve(null);
              }
            };
            window.addEventListener("message", onMessage);
            const pollTimer = setInterval(() => {
              if (popup?.closed) {
                clearInterval(pollTimer);
                window.removeEventListener("message", onMessage);
                codeVerifierRef.current = null;
                resolve(null);
              }
            }, 500);
          });
        }
        const result = await WebBrowser.openAuthSessionAsync(
          auth_url,
          `rork-${PROJECT_ID}://auth/callback`,
        );
        if (result.type === "success") {
          const url = new URL(result.url);
          const code = url.searchParams.get("code");
          if (code) {
            // The Linking listener may have already exchanged this code; if so,
            // exchangeCode returns the shared in-flight promise (or the user).
            const exchanged = await exchangeCode(code);
            if (exchanged) return exchanged;
            // Fall back to the user set by the Linking listener's exchange.
            return user;
          }
        }
        return user;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Sign in failed");
        return null;
      } finally {
        setIsSigningIn(false);
      }
    },
    [exchangeCode, user],
  );

  const signOut = useCallback(async (): Promise<void> => {
    await SecureStore.deleteItemAsync("access_token");
    await SecureStore.deleteItemAsync("refresh_token");
    setUser(null);
  }, []);

  return {
    user,
    isLoading,
    isSigningIn,
    error,
    signIn,
    signOut,
    clearError,
  };
});
