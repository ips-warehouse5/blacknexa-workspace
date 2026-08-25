export type PrivacyLevel = "private" | "trusted" | "public";
export type IncidentCategory =
  | "profiling"
  | "housing"
  | "workplace"
  | "policing"
  | "education"
  | "medical"
  | "harassment";

export type Incident = {
  /** Local identifier, `inc_<millis>`. Generated on this device. */
  id: string;
  /**
   * Identifier issued by the backend when the incident was persisted, format
   * `inc_<millis>_<rand5>`. Deliberately separate from `id` — the two formats
   * differ, and the server does not recognise local ids.
   *
   * Absent when the report predates server persistence, or when the create call
   * failed. Anything reading the server copy must handle that.
   */
  serverId?: string;
  title: string;
  summary: string;
  category: IncidentCategory;
  privacy: PrivacyLevel;
  area: string;
  timestamp: number;
  supporters: number;
  verifications: number;
  hasEvidence: boolean;
  evidenceCount: number;
  author: {
    handle: string;
    anonymous: boolean;
  };
  urgent?: boolean;
};

const now = Date.now();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export const MOCK_INCIDENTS: Incident[] = [
  {
    id: "inc_01",
    title: "Stopped and searched without cause outside corner market",
    summary:
      "Officers approached without explanation, requested ID, and searched my bag. No reason given. Logged badge numbers and timestamps.",
    category: "policing",
    privacy: "public",
    area: "Brownsville, Brooklyn",
    timestamp: now - 2 * HOUR,
    supporters: 142,
    verifications: 12,
    hasEvidence: true,
    evidenceCount: 3,
    author: { handle: "M. Thompson", anonymous: false },
    urgent: true,
  },
  {
    id: "inc_02",
    title: "Landlord refused to accept housing voucher",
    summary:
      "Application was pre-approved, then withdrawn the moment voucher was mentioned. Saved emails and voicemail.",
    category: "housing",
    privacy: "public",
    area: "Atlanta, GA",
    timestamp: now - 9 * HOUR,
    supporters: 87,
    verifications: 5,
    hasEvidence: true,
    evidenceCount: 7,
    author: { handle: "Anonymous", anonymous: true },
  },
  {
    id: "inc_03",
    title: "Promotion denied after 4 years — same role passed to newer hire",
    summary:
      "Documented reviews for three years, all exceeding expectations. Requesting HR records.",
    category: "workplace",
    privacy: "trusted",
    area: "Houston, TX",
    timestamp: now - 1 * DAY,
    supporters: 54,
    verifications: 2,
    hasEvidence: false,
    evidenceCount: 0,
    author: { handle: "Anonymous", anonymous: true },
  },
  {
    id: "inc_04",
    title: "Pharmacy clerk followed me through aisles for 20 minutes",
    summary:
      "Recorded timestamps, have receipt. Looking to connect with others who've experienced the same location.",
    category: "profiling",
    privacy: "public",
    area: "Oakland, CA",
    timestamp: now - 2 * DAY,
    supporters: 201,
    verifications: 18,
    hasEvidence: true,
    evidenceCount: 2,
    author: { handle: "J. Reeves", anonymous: false },
  },
  {
    id: "inc_05",
    title: "ER wait time 4x longer than others in waiting room",
    summary:
      "Triage bypassed me twice. Chest pain. Filed patient advocate report, still awaiting response.",
    category: "medical",
    privacy: "public",
    area: "Chicago, IL",
    timestamp: now - 3 * DAY,
    supporters: 312,
    verifications: 9,
    hasEvidence: true,
    evidenceCount: 5,
    author: { handle: "Anonymous", anonymous: true },
    urgent: true,
  },
  {
    id: "inc_06",
    title: "Teacher repeatedly mispronounced name after correction",
    summary:
      "Documented pattern over the semester. Son now refuses to raise his hand in class.",
    category: "education",
    privacy: "trusted",
    area: "Detroit, MI",
    timestamp: now - 5 * DAY,
    supporters: 68,
    verifications: 3,
    hasEvidence: false,
    evidenceCount: 0,
    author: { handle: "D. Okoro", anonymous: false },
  },
];

export const CATEGORY_LABELS: Record<IncidentCategory, string> = {
  profiling: "Profiling",
  housing: "Housing",
  workplace: "Workplace",
  policing: "Policing",
  education: "Education",
  medical: "Medical",
  harassment: "Harassment",
};

export function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  const w = Math.floor(d / 7);
  return `${w}w ago`;
}
