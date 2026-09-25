/**
 * Whether this screen is the one the user is looking at.
 *
 * A stack keeps earlier screens mounted underneath the current one, so an
 * effect that reacts to shared state (the auth `error`) runs on every screen in
 * the stack at once. Screens use this to let only the top one respond.
 */

import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";

export function useScreenFocused(): boolean {
  const [focused, setFocused] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  return focused;
}
