/**
 * The KPI row — the prototype's five tiles, on the modules' own counts.
 *
 *   Total Incidents     `GET /admin/incidents/summary`, with the prototype's
 *                       "N Submitted · N Under Review · N Verified" footer.
 *                       Deactivated incidents are not in the total, as on the
 *                       Incidents screen's "All" tab. An advocate's figures
 *                       are their assignments, so the tile says so.
 *   Pending Moderation  `GET /admin/moderation/cases/summary` — open cases,
 *                       with the urgent and safety-risk counts.
 *   Verified Advocates  `GET /admin/staff/summary` — active advocate accounts.
 *   Support Inquiries   `GET /admin/contact/summary` — inquiries still open
 *                       (new or in progress), with the untriaged ones.
 *   Total Users         still the prototype's figure: member accounts have no
 *                       endpoint yet (the Users module is out of scope, plan
 *                       §12). The page marks it with a `FixtureNotice`.
 *
 * A tile the role cannot read is left out rather than shown with the
 * prototype's number beside live ones (see `DashboardAccess`). With fewer
 * than five tiles the row switches from the design's fixed five columns to
 * fluid ones, so the tiles that remain share the width instead of leaving
 * empty slots on the right.
 *
 * A tile that has not loaded shows a dash, as the contact screen's tiles do;
 * one that failed says so under the dash and offers the request again. The
 * counts poll every minute (`dashboard.hooks.ts`), so a background failure
 * with a figure already on screen keeps the figure.
 */

import type { ReactNode } from "react";
import type { UseQueryResult } from "@tanstack/react-query";

import { Icon, type IconName } from "@/components/ui/Icon";
import { KpiCard, KpiGrid } from "@/components/ui/Page";
import { totalUsersFixture } from "@/features/dashboard/dashboard.fixtures";
import {
  useDashboardCaseSummary,
  useDashboardContactSummary,
  useDashboardIncidentSummary,
  useDashboardStaffSummary,
} from "@/features/dashboard/dashboard.hooks";
import type { DashboardAccess } from "@/features/dashboard/dashboard.types";

/** The design's icon well per tile — light tints that read on both themes. */
const TILE_ICONS: Record<
  "users" | "incidents" | "moderation" | "advocates" | "inquiries",
  { name: IconName; background: string; color: string }
> = {
  users: { name: "users", background: "#e8f2ff", color: "#0a7cff" },
  incidents: { name: "incidents", background: "#e0f2fe", color: "#0284c7" },
  moderation: { name: "moderation", background: "#fee2e2", color: "#dc2626" },
  advocates: { name: "shieldCheck", background: "#f3e8ff", color: "#7e22ce" },
  inquiries: { name: "message", background: "#ecfdf5", color: "#047857" },
};

/** The design's five columns hold a full row; a shorter row shares the width. */
const FULL_ROW = 5;
const FLUID_COLUMNS = "repeat(auto-fit, minmax(min(100%, 180px), 1fr))";

function TileIcon({ tile }: { tile: keyof typeof TILE_ICONS }) {
  return <Icon name={TILE_ICONS[tile].name} />;
}

function iconStyle(tile: keyof typeof TILE_ICONS): React.CSSProperties {
  const spec = TILE_ICONS[tile];
  return { background: spec.background, color: spec.color };
}

/** The footer of a tile whose count failed to load. */
function TileRetry({ onRetry }: { onRetry: () => void }) {
  return (
    <>
      <span>Couldn’t load.</span>
      <button
        type="button"
        onClick={onRetry}
        style={{
          padding: 0,
          border: 0,
          background: "none",
          color: "var(--accent)",
          font: "inherit",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Try again
      </button>
    </>
  );
}

/**
 * One tile on one query: the figure once it is there, a dash before, and a
 * retry under the dash when the first load failed.
 */
function LiveTile<T>({
  label,
  tile,
  query,
  value,
  footer,
}: {
  label: string;
  tile: keyof typeof TILE_ICONS;
  query: UseQueryResult<T>;
  value: (data: T) => number;
  footer: (data: T) => ReactNode;
}) {
  const data = query.data;
  let shown: ReactNode = "—";
  let below: ReactNode = <span>Loading…</span>;
  if (data !== undefined) {
    shown = value(data).toLocaleString();
    below = footer(data);
  } else if (query.isError) {
    below = <TileRetry onRetry={() => void query.refetch()} />;
  }
  return (
    <KpiCard
      label={label}
      value={shown}
      icon={<TileIcon tile={tile} />}
      iconStyle={iconStyle(tile)}
      footer={below}
    />
  );
}

/** "3 Urgent · 1 Safety need review", or a calm pill when nothing is urgent. */
function moderationFooter(urgent: number, safety: number): ReactNode {
  if (urgent === 0 && safety === 0) {
    return (
      <>
        <span className="kpi-growth-pill positive">0 Urgent</span>
        <span>in the queue</span>
      </>
    );
  }
  return (
    <>
      {safety > 0 ? <span className="kpi-growth-pill urgent">{safety} Safety</span> : null}
      {urgent > 0 ? <span className="kpi-growth-pill urgent">{urgent} Urgent</span> : null}
      <span>need review</span>
    </>
  );
}

export function KpiTiles({ access }: { access: DashboardAccess }) {
  const incidents = useDashboardIncidentSummary(access.incidents);
  const cases = useDashboardCaseSummary(access.moderation);
  const staff = useDashboardStaffSummary(access.staff);
  const contact = useDashboardContactSummary(access.contact);

  const tiles: ReactNode[] = [
    <KpiCard
      key="users"
      label="Total Users"
      value={totalUsersFixture.value}
      icon={<TileIcon tile="users" />}
      iconStyle={iconStyle("users")}
      footer={
        <>
          <span className="kpi-growth-pill positive">{totalUsersFixture.growth}</span>
          <span>{totalUsersFixture.period}</span>
        </>
      }
    />,
  ];

  if (access.incidents) {
    tiles.push(
      <LiveTile
        key="incidents"
        label={access.assignedOnly ? "Assigned Incidents" : "Total Incidents"}
        tile="incidents"
        query={incidents}
        value={(summary) => summary.all}
        footer={(summary) => (
          <span style={{ fontSize: 11, display: "flex", flexWrap: "wrap", gap: 4 }}>
            <span style={{ color: "#0284c7", fontWeight: 600 }}>
              {summary.submitted.toLocaleString()} Submitted
            </span>
            <span aria-hidden="true">·</span>
            <span style={{ color: "#d97706", fontWeight: 600 }}>
              {summary.under_review.toLocaleString()} Under Review
            </span>
            <span aria-hidden="true">·</span>
            <span style={{ color: "#15803d", fontWeight: 600 }}>
              {summary.verified.toLocaleString()} Verified
            </span>
          </span>
        )}
      />,
    );
  }

  if (access.moderation) {
    tiles.push(
      <LiveTile
        key="moderation"
        label="Pending Moderation"
        tile="moderation"
        query={cases}
        value={(summary) => summary.open}
        footer={(summary) => moderationFooter(summary.urgent, summary.safety)}
      />,
    );
  }

  if (access.staff) {
    tiles.push(
      <LiveTile
        key="advocates"
        label="Verified Advocates"
        tile="advocates"
        query={staff}
        value={(summary) => summary.advocate}
        footer={(summary) => (
          <>
            <span className="kpi-growth-pill positive">
              {summary.moderator.toLocaleString()} Moderators
            </span>
            <span>active accounts</span>
          </>
        )}
      />,
    );
  }

  if (access.contact) {
    tiles.push(
      <LiveTile
        key="inquiries"
        label="Support Inquiries"
        tile="inquiries"
        query={contact}
        value={(summary) => summary.new + summary.in_progress}
        footer={(summary) => (
          <>
            <span className={`kpi-growth-pill ${summary.new > 0 ? "urgent" : "positive"}`}>
              {summary.new.toLocaleString()} New
            </span>
            <span>awaiting triage</span>
          </>
        )}
      />,
    );
  }

  return (
    <KpiGrid {...(tiles.length < FULL_ROW ? { style: { gridTemplateColumns: FLUID_COLUMNS } } : {})}>
      {tiles}
    </KpiGrid>
  );
}

export default KpiTiles;
