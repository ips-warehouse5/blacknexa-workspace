import { existsSync } from "fs";
import path from "path";
import { versionedAsset } from "@/lib/asset-version";
import { HeroRecording, type RecordingSources } from "./hero-recording";

const DIR = "/images/blacknexa";

/** Sources for one theme's recording, or null when its files are not in /public. */
function recording(suffix: string): RecordingSources | null {
  const base = `${DIR}/hero-incident-reporting${suffix}`;
  if (!existsSync(path.join(process.cwd(), "public", `${base}.mp4`))) return null;
  return {
    webm: versionedAsset(`${base}.webm`),
    mp4: versionedAsset(`${base}.mp4`),
    poster: versionedAsset(`${base}-poster.jpg`),
  };
}

/**
 * The hero's phone: a screen recording of the app's incident-reporting flow,
 * phone frame included.
 *
 * Built from the client's `blacknexa_incident_reporting_v3.gif` (310px wide),
 * upscaled 2x with Lanczos + light sharpening so it stays crisp on retina
 * screens, and shipped as WebM/MP4 — a fraction of the size a 2x animated
 * WebP would be. The recording has no transparency; the rounded corners come
 * from the CSS clip in `HeroRecording`.
 *
 * Theme: the `-light` files are a colour-remapped conversion of the same
 * dark recording (identical frames and timing, surfaces/text remapped to the
 * app's light "signal" tokens, bezel untouched). If they are removed, the
 * light theme falls back to the dark recording.
 */
export function HeroPhoneMockup() {
  const dark = recording("");
  if (!dark) return null;
  return (
    <div className="bn-reveal flex flex-none basis-[340px] justify-center" style={{ flexShrink: 1 }}>
      <HeroRecording dark={dark} light={recording("-light") ?? dark} />
    </div>
  );
}
