import { router, type Href } from "expo-router";
import { Platform } from "react-native";

/**
 * Safely navigates back on both native and web.
 *
 * On web (React Native Web), `router.back()` and `router.canGoBack()` are
 * imperative methods that throw "canGoBack imperative method is not supported".
 * This helper avoids calling them on web entirely and uses `window.history`
 * instead, falling back to a provided route when there is no history to pop.
 *
 * @param fallback Route to navigate to when back navigation is unavailable
 * (e.g. deep-linked entry). Defaults to the tabs root.
 */
export function safeBack(fallback: Href = "/(tabs)"): void {
  // Web: avoid expo-router's imperative back entirely — it throws.
  if (Platform.OS === "web") {
    try {
      if (typeof window !== "undefined" && window.history.length > 1) {
        window.history.back();
        return;
      }
    } catch {
      /* ignore — fall through to replace */
    }
    try {
      router.replace(fallback);
    } catch {
      /* no-op: navigation unavailable */
    }
    return;
  }

  // Native: canGoBack/back are supported here.
  try {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(fallback);
    }
  } catch {
    try {
      router.replace(fallback);
    } catch {
      /* no-op */
    }
  }
}
