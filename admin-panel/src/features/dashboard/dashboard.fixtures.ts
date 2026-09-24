/**
 * The dashboard figures that still come from the approved prototype.
 *
 * What remains here has no endpoint yet: member accounts (the Users module is
 * out of scope, plan §12) and regional clusters. Everything else on the
 * dashboard is live — the incident and moderation tiles, the activity chart,
 * the categories and the urgent queue read the API (`dashboard.api.ts`,
 * `dashboard.hooks.ts`) — and the screen marks these two parts with a
 * `FixtureNotice` of their own, so nobody mistakes them for the live ones.
 */

/** The Total Users tile, as the prototype showed it. */
export const totalUsersFixture = {
  value: "1,280",
  growth: "↑ +14.8%",
  period: "vs last month",
} as const;

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
