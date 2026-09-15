/**
 * A value that settles before anyone acts on it.
 *
 * Used for search boxes, where reacting to every keystroke means a request per
 * character and a table that flickers through partial matches.
 */

import { useEffect, useState } from "react";

export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    // Each new keystroke cancels the pending update, so the value only lands
    // once typing actually stops.
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return settled;
}

export default useDebouncedValue;
