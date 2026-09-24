"use client";

import { useTheme } from "@/components/theme/theme-provider";

export type RecordingSources = { webm: string; mp4: string; poster: string };

/**
 * Plays the recording that matches the active theme. `key` remounts the
 * <video> on a theme change, since swapping <source> children alone does not
 * make a video element reload.
 */
export function HeroRecording({ dark, light }: { dark: RecordingSources; light: RecordingSources }) {
  const { theme } = useTheme();
  const src = theme === "light" ? light : dark;

  return (
    <div
      className="w-[306px] max-w-full overflow-hidden rounded-[38px]"
      style={{
        aspectRatio: "306 / 623",
        boxShadow: "0 44px 90px -34px rgba(0,0,0,0.75)",
      }}
    >
      <video
        key={src.mp4}
        className="block h-full w-full"
        poster={src.poster}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        aria-label="The BlackNexa app: browsing community incident reports and filing a new one"
      >
        <source src={src.webm} type="video/webm" />
        <source src={src.mp4} type="video/mp4" />
      </video>
    </div>
  );
}
