/**
 * Global snackbar queue. `showSnackbar` is the one entry point every screen
 * should use for transient success/error/warning/info feedback instead of
 * `Alert.alert` — see `components/ui/Snackbar.tsx` for the visual.
 */

import createContextHook from "@nkzw/create-context-hook";
import { useCallback, useEffect, useRef, useState } from "react";
import Snackbar, { type SnackbarData, type SnackbarType } from "@/components/ui/Snackbar";

const DEFAULT_DURATION = 2800;

export type ShowSnackbarOptions = {
  message: string;
  type?: SnackbarType;
  duration?: number;
};

export const [SnackbarProvider, useSnackbar] = createContextHook(() => {
  const [queue, setQueue] = useState<SnackbarData[]>([]);
  const [current, setCurrent] = useState<SnackbarData | null>(null);
  const [visible, setVisible] = useState(false);
  const idRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showSnackbar = useCallback(
    ({ message, type = "info", duration = DEFAULT_DURATION }: ShowSnackbarOptions) => {
      idRef.current += 1;
      setQueue((prev) => [...prev, { id: idRef.current, message, type, duration }]);
    },
    []
  );

  useEffect(() => {
    if (current || queue.length === 0) return;
    const [next, ...rest] = queue;
    setQueue(rest);
    setCurrent(next);
    // Allow the mount to happen before animating in.
    requestAnimationFrame(() => setVisible(true));
  }, [queue, current]);

  useEffect(() => {
    if (!current) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setVisible(false);
      // Wait for the fade-out before unmounting, so the next item doesn't pop in.
      setTimeout(() => setCurrent(null), 200);
    }, current.duration);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [current]);

  return { showSnackbar, current, visible };
});

export function SnackbarHost(): React.ReactElement {
  const { current, visible } = useSnackbar();
  return <Snackbar data={current} visible={visible} />;
}
