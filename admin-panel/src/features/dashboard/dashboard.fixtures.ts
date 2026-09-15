/**
 * Dashboard figures, from the approved prototype.
 *
 * Held apart from the component so that wiring this screen to a real endpoint
 * is a change of import, not a rewrite. The shapes are what a metrics endpoint
 * would reasonably return.
 */

export interface KpiFigure {
  label: string;
  value: string;
  /** Light/dark-safe tint for the icon well. */
  iconBg: string;
  iconColor: string;
  icon: "users" | "incidents" | "moderation" | "shieldCheck" | "message";
}

export const kpiFigures: KpiFigure[] = [
  {
    label: "Total Users",
    value: "1,280",
    icon: "users",
    iconBg: "#e8f2ff",
    iconColor: "#0a7cff",
  },
  {
    label: "Total Incidents",
    value: "84",
    icon: "incidents",
    iconBg: "#e0f2fe",
    iconColor: "#0284c7",
  },
  {
    label: "Pending Moderation",
    value: "12",
    icon: "moderation",
    iconBg: "#fee2e2",
    iconColor: "#dc2626",
  },
  {
    label: "Verified Advocates",
    value: "46",
    icon: "shieldCheck",
    iconBg: "#f3e8ff",
    iconColor: "#7e22ce",
  },
  {
    label: "Support Inquiries",
    value: "28",
    icon: "message",
    iconBg: "#ecfdf5",
    iconColor: "#047857",
  },
];

/** Daily report volume for the activity chart. */
export interface ActivityPoint {
  day: string;
  date: string;
  reports: number;
}

export const weekActivity: ActivityPoint[] = [
  { day: "Mon", date: "Aug 25", reports: 7 },
  { day: "Tue", date: "Aug 26", reports: 9 },
  { day: "Wed", date: "Aug 27", reports: 5 },
  { day: "Thu", date: "Aug 28", reports: 14 },
  { day: "Fri", date: "Aug 29", reports: 8 },
  { day: "Sat", date: "Aug 30", reports: 16 },
  { day: "Sun", date: "Aug 31", reports: 18 },
];

export interface CategoryShare {
  label: string;
  percent: number;
  count: number;
  /** Fixed per category so a category keeps its colour between renders. */
  colour: string;
}

export const categoryShares: CategoryShare[] = [
  { label: "Policing & Stop-and-Search", percent: 38, count: 32, colour: "#0a7cff" },
  { label: "Workplace & Labor Discrimination", percent: 24, count: 20, colour: "#0e8a5f" },
  { label: "Housing & Unlawful Eviction", percent: 18, count: 15, colour: "#b78a00" },
  { label: "Public Harassment & Hate Speech", percent: 14, count: 12, colour: "#c63d49" },
  { label: "Education & Campus", percent: 6, count: 5, colour: "#4f46e5" },
];

export type RiskLevel = "High Risk" | "Moderate" | "Normal";

export interface RegionalCluster {
  region: string;
  cases: number;
  risk: RiskLevel;
}

export const regionalClusters: RegionalCluster[] = [
  { region: "Hackney, London", cases: 28, risk: "High Risk" },
  { region: "Manchester, UK", cases: 19, risk: "Moderate" },
  { region: "Toronto, Canada", cases: 14, risk: "Normal" },
  { region: "Chicago, US", cases: 12, risk: "Moderate" },
  { region: "Birmingham, UK", cases: 11, risk: "Normal" },
];

export interface UrgentAlert {
  id: string;
  title: string;
  detail: string;
  /** Where the "view" action leads. */
  to: string;
}

export const urgentAlerts: UrgentAlert[] = [
  {
    id: "INC-20481",
    title: "INC-20481 · Stopped and searched",
    detail: "Hackney, London · Unassigned Advocate",
    to: "/incidents/INC-20481",
  },
  {
    id: "CMT-90412",
    title: "CMT-90412 · Threatening comment",
    detail: "AI Threat Flag · Multiple User Reports",
    to: "/moderation/CMT-90412",
  },
  {
    id: "INC-20475",
    title: "INC-20475 · Targeted public abuse",
    detail: "Manchester, UK · Audio & Image Evidence",
    to: "/incidents/INC-20475",
  },
];

/** Ranges offered by the activity chart's date filter. */
export const DATE_RANGES = [
  { value: "week", label: "Last 7 Days", caption: "Report submissions over the last 7 days" },
  { value: "month", label: "Last 30 Days", caption: "Report submissions over the last 30 days" },
  { value: "quarter", label: "Last 90 Days", caption: "Report submissions over the last 90 days" },
  { value: "year", label: "Last 12 Months", caption: "Report submissions over the last year" },
] as const;

export type DateRange = (typeof DATE_RANGES)[number]["value"];
