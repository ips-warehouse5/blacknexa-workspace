/**
 * Evidence strength — the D3 scale and the D1 badge.
 *
 * The design shows the *outcome* (D1: "Evidence strength: Strong"; D3: a four-step
 * scale with Strong active) and one justification sentence, but never a formula.
 * This is that formula, and it is a `DERIVED` decision that needs product sign-off
 * — see docs/FEATURE_BUILD_PLAN.md §6.7.
 *
 * ── Calibration ────────────────────────────────────────────────────────────
 * D3's worked example — "Four files from two devices, captured within nine minutes
 * of the reported time, corroborated by twelve people" — is drawn as **Strong**,
 * not Very strong. So the scale is calibrated to land that example on Strong, and
 * the top band is reserved for something that example lacks: a corroborator who
 * attached their own evidence, which is an independent second source rather than
 * twelve people agreeing.
 *
 * ── Why this is server-side only ───────────────────────────────────────────
 * `constants/credibility.ts` in the app scores this today. Two consequences: D1's
 * badge and D3's scale can disagree, and either can be spoofed by a modified
 * client. A trust signal computed by the party being trusted is not a trust signal.
 */

import type {
  EvidenceStrength,
  EvidenceKind,
} from "@/types/report.interface";

/** One attachment, reduced to what scoring needs. */
export interface StrengthInput {
  kind: EvidenceKind;
  capturedAt: string | null;
  /** Distinct device identifier where one was recorded. D12 shows this is often absent. */
  deviceId?: string | null;
}

export interface StrengthContext {
  evidence: StrengthInput[];
  /** The reported time, which capture proximity is measured against. */
  occurredAt: string;
  corroborationCount: number;
  /** True when at least one corroborator attached their own material. */
  corroboratedWithEvidence: boolean;
}

export interface StrengthResult {
  strength: EvidenceStrength;
  score: number;
  /** The plain-English sentence D3 prints under the scale. */
  rationale: string;
}

const HOUR_MS = 60 * 60 * 1000;

/** Score files: 0 → 0, 1 → 1, 2–3 → 2, 4+ → 3. */
function scoreFiles(count: number): number {
  if (count === 0) return 0;
  if (count === 1) return 1;
  if (count <= 3) return 2;
  return 3;
}

/** Score how close the earliest capture is to the reported time. */
function scoreProximity(evidence: StrengthInput[], occurredAt: string): {
  points: number;
  minutes: number | null;
} {
  const occurred = Date.parse(occurredAt);
  if (!Number.isFinite(occurred)) return { points: 0, minutes: null };

  const gaps = evidence
    .map((item) => (item.capturedAt ? Math.abs(Date.parse(item.capturedAt) - occurred) : null))
    .filter((gap): gap is number => gap !== null && Number.isFinite(gap));

  if (gaps.length === 0) return { points: 0, minutes: null };

  const closest = Math.min(...gaps);
  const minutes = Math.round(closest / 60000);
  if (closest > 24 * HOUR_MS) return { points: 0, minutes };
  if (closest > HOUR_MS) return { points: 1, minutes };
  return { points: 2, minutes };
}

/** Count distinct recorded devices. Absent identifiers score nothing. */
function countDevices(evidence: StrengthInput[]): number {
  const seen = new Set<string>();
  for (const item of evidence) {
    if (item.deviceId) seen.add(item.deviceId);
  }
  return seen.size;
}

class EvidenceStrengthService {
  /**
   * Score a report.
   *
   * Maximum is 9. Bands: thin 0–2, fair 3–5, strong 6–9. `very_strong` is not a
   * score at all — it is `strong` plus an independent corroborating source.
   */
  evaluate(context: StrengthContext): StrengthResult {
    const { evidence, occurredAt, corroborationCount, corroboratedWithEvidence } = context;

    const filePoints = scoreFiles(evidence.length);
    const proximity = scoreProximity(evidence, occurredAt);
    const kinds = new Set(evidence.map((item) => item.kind));
    const kindPoints = kinds.size >= 2 ? 1 : 0;
    const corroborationPoints = corroborationCount === 0 ? 0 : corroborationCount <= 4 ? 1 : 2;
    const devices = countDevices(evidence);
    const devicePoints = devices >= 2 ? 1 : 0;

    const score =
      filePoints + proximity.points + kindPoints + corroborationPoints + devicePoints;

    let strength: EvidenceStrength;
    if (score <= 2) strength = "thin";
    else if (score <= 5) strength = "fair";
    else strength = "strong";

    // The top band needs an independent second source, not a higher score.
    if (strength === "strong" && corroboratedWithEvidence) strength = "very_strong";

    return { strength, score, rationale: this.describe(context, proximity.minutes, devices) };
  }

  /**
   * Build D3's justification sentence.
   *
   * Written as a sentence rather than a list because that is what the artboard
   * shows — "Four files from two devices, captured within nine minutes of the
   * reported time, corroborated by twelve people." Each clause is included only
   * when it is actually true, so the sentence never claims a signal the report
   * does not have.
   */
  private describe(
    context: StrengthContext,
    proximityMinutes: number | null,
    devices: number,
  ): string {
    const { evidence, corroborationCount, corroboratedWithEvidence } = context;
    const clauses: string[] = [];

    if (evidence.length === 0) {
      clauses.push("No files were attached");
    } else {
      const fileWord = evidence.length === 1 ? "file" : "files";
      clauses.push(`${spell(evidence.length)} ${fileWord}`);
      if (devices >= 2) clauses.push(`from ${spell(devices)} devices`);
    }

    if (proximityMinutes !== null) {
      if (proximityMinutes <= 60) {
        clauses.push(
          `captured within ${spell(Math.max(1, proximityMinutes))} minute${proximityMinutes === 1 ? "" : "s"} of the reported time`,
        );
      } else if (proximityMinutes <= 24 * 60) {
        clauses.push("captured the same day as the reported time");
      } else {
        clauses.push("captured well after the reported time");
      }
    } else if (evidence.length > 0) {
      clauses.push("with no capture time recorded");
    }

    if (corroborationCount > 0) {
      clauses.push(
        `corroborated by ${spell(corroborationCount)} ${corroborationCount === 1 ? "person" : "people"}`,
      );
      if (corroboratedWithEvidence) clauses.push("one of whom attached their own evidence");
    }

    const sentence = clauses.join(", ");
    return sentence.charAt(0).toUpperCase() + sentence.slice(1) + ".";
  }
}

/**
 * Spell small numbers, because D3's sentence reads "Four files" not "4 files".
 * Above twelve, digits are clearer than words.
 */
function spell(value: number): string {
  const words = [
    "zero",
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
    "ten",
    "eleven",
    "twelve",
  ];
  return value < words.length ? words[value] : String(value);
}

export const evidenceStrengthService = new EvidenceStrengthService();
export default evidenceStrengthService;
