/**
 * Inert landing spot for Google's OAuth redirect.
 *
 * Google's sign-in flow (see app/(auth)/welcome.tsx) opens a browser tab that
 * redirects back into the app at this path. `WebBrowser.maybeCompleteAuthSession()`
 * is what actually resolves the auth-session promise from that URL — this
 * screen exists only because expo-router's own linking listener sees the same
 * URL and tries to navigate here regardless. Without this route, that
 * navigation fell through to +not-found for one visible frame before
 * AuthGate's post-sign-in redirect replaced it. Rendering nothing keeps that
 * frame blank instead of showing an error screen.
 */
export default function OAuthRedirectScreen(): null {
  return null;
}
