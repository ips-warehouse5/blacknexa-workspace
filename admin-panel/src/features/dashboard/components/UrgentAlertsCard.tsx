/**
 * Urgent Queue Alerts — the prototype's alert rows, on the live queues.
 *
 * Two sources, each read only by the roles that can read it:
 *   • the open moderation queue's first page, in priority order, kept to the
 *     cases with a safety risk or an urgent report (`moderation.view`);
 *   • the urgent incidents nobody is working yet — unassigned and still
 *     submitted, or, for an advocate, assigned to them and still under review
 *     (`incidents.view`; see `dashboardApi.urgentIncidents`).
 * `buildUrgentAlerts` merges them into one list, most pressing first and one
 * row per report. Each row opens the record it names — `/moderation/<caseId>`
 * or `/incidents/<reportId>`, database ids, never the prototype's display
 * references.
 *
 * A source that fails does not take the other down: its rows are missing, and
 * a line under the list says which and offers it again. "Waiting 12 minutes"
 * is measured from the last successful refresh rather than from each render,
 * so the text only changes when the figures do (every minute).
 */

import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { CardError, CardPlaceholder, StaleNotice } from "@/features/dashboard/components/CardStatus";
import { buildUrgentAlerts, errorText } from "@/features/dashboard/dashboard.format";
import { useUrgentCases, useUrgentIncidents } from "@/features/dashboard/dashboard.hooks";
import type { DashboardAccess } from "@/features/dashboard/dashboard.types";
import { SlaBadge } from "@/features/incidents/components/IncidentBadges";
import { RiskPills } from "@/features/moderation/components/CaseBadges";

/** The alert list's height while it loads or has nothing to show. */
const LIST_HEIGHT = 150;

/** What the card lists, in the caption, per what the role can read. */
function caption(access: DashboardAccess): string {
  if (access.assignedOnly) return "Urgent incidents assigned to you that are still under review";
  if (access.moderation && access.incidents) {
    return "Safety-risk and urgent moderation cases, and urgent incidents nobody has picked up";
  }
  if (access.moderation) return "Safety-risk and urgent moderation cases";
  return "Urgent incidents nobody has picked up yet";
}

/** What an empty list means for this role. */
function allClear(access: DashboardAccess): string {
  if (access.assignedOnly) return "None of the incidents assigned to you is urgent and waiting.";
  if (access.moderation) {
    return "Nothing urgent is waiting — no safety-risk or urgent cases, and every urgent incident has someone on it.";
  }
  return "Every urgent incident has someone on it.";
}

/** The line under the list for a source that failed while the other loaded. */
function SourceFailed({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <p style={{ margin: "10px 0 0", fontSize: 11.5, color: "var(--muted)" }} role="status">
      Couldn’t load {what}, so they aren’t listed.{" "}
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
    </p>
  );
}

const footerLink: React.CSSProperties = { color: "var(--accent)", fontWeight: 600 };

export function UrgentAlertsCard({ access }: { access: DashboardAccess }) {
  const cases = useUrgentCases(access.moderation);
  const incidents = useUrgentIncidents(access.assignedOnly, access.incidents);

  const sources = [
    ...(access.moderation ? [{ query: cases, what: "the urgent moderation cases" }] : []),
    ...(access.incidents ? [{ query: incidents, what: "the urgent incidents" }] : []),
  ];
  const loading = sources.some(({ query }) => query.data === undefined && !query.isError);
  const failed = sources.filter(({ query }) => query.data === undefined && query.isError);
  const stale = sources.some(({ query }) => query.data !== undefined && query.isError);
  const retryAll = () => {
    for (const { query } of failed) void query.refetch();
  };

  const caseItems = access.moderation ? (cases.data?.items ?? []) : [];
  const incidentItems = access.incidents ? (incidents.data?.items ?? []) : [];
  const moreIncidents = Math.max(0, (incidents.data?.total ?? 0) - incidentItems.length);
  const asOf = new Date(Math.max(cases.dataUpdatedAt, incidents.dataUpdatedAt));
  const { alerts, hidden } = buildUrgentAlerts(caseItems, incidentItems, asOf, {
    selfId: access.selfId,
  });
  const settled = !loading && failed.length < sources.length;

  let body: ReactNode;
  if (loading) {
    body = (
      <CardPlaceholder busy minHeight={LIST_HEIGHT}>
        Loading urgent alerts…
      </CardPlaceholder>
    );
  } else if (sources.length > 0 && failed.length === sources.length) {
    body = (
      <CardError
        minHeight={LIST_HEIGHT}
        message={errorText(failed[0]?.query.error, "Could not load the urgent alerts.")}
        onRetry={retryAll}
      />
    );
  } else if (alerts.length === 0) {
    body = (
      <CardPlaceholder minHeight={LIST_HEIGHT}>
        {/* With one source down, "all clear" would be a claim about what did not load. */}
        {failed.length > 0 ? "Nothing urgent among the alerts that did load." : allClear(access)}
      </CardPlaceholder>
    );
  } else {
    body = (
      <ul
        aria-label="Urgent alerts"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 4,
          margin: 0,
          padding: 0,
          listStyle: "none",
        }}
      >
        {alerts.map((alert) => (
          <li className="dash-alert-item" key={alert.key} style={{ gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                <RiskPills urgent={alert.urgent} safetyRisk={alert.safetyRisk} />
                {alert.slaBreached ? <SlaBadge /> : null}
                <span
                  style={{
                    fontWeight: 600,
                    fontSize: 13,
                    color: "var(--text)",
                    overflowWrap: "anywhere",
                  }}
                >
                  {alert.title}
                </span>
              </div>
              <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>
                {alert.detail}
              </div>
            </div>
            <Link
              to={alert.to}
              className="action-icon-btn"
              title={alert.linkLabel}
              aria-label={alert.linkLabel}
              style={{ flexShrink: 0 }}
            >
              <Icon name="eye" />
            </Link>
          </li>
        ))}
      </ul>
    );
  }

  const incidentsPath = access.assignedOnly ? "/incidents/assigned" : "/incidents";
  const showMore = settled && alerts.length > 0 && (hidden > 0 || moreIncidents > 0);

  return (
    <div className="dash-card">
      <div className="dash-card-header" style={{ gap: 12 }}>
        <div>
          <div className="dash-card-title">Urgent Queue Alerts</div>
          <div className="dash-card-sub">{caption(access)}</div>
        </div>
        {settled && alerts.length > 0 ? (
          <Badge tone="suspended" className="risk-badge">
            Action Required
          </Badge>
        ) : null}
        {settled && alerts.length === 0 && failed.length === 0 ? (
          <Badge tone="active" className="risk-badge">
            All Clear
          </Badge>
        ) : null}
      </div>

      {body}

      {showMore ? (
        <p style={{ margin: "10px 0 0", fontSize: 11.5, color: "var(--muted)" }}>
          Showing the {alerts.length} most pressing.{" "}
          {access.moderation ? (
            <>
              <Link to="/moderation" style={footerLink}>
                Open the moderation queue
              </Link>
              {access.incidents ? " · " : null}
            </>
          ) : null}
          {access.incidents ? (
            <Link to={incidentsPath} style={footerLink}>
              {access.assignedOnly ? "Open My Assigned Cases" : "Open all incidents"}
            </Link>
          ) : null}
        </p>
      ) : null}

      {settled && failed.length > 0
        ? failed.map(({ what, query }) => (
            <SourceFailed key={what} what={what} onRetry={() => void query.refetch()} />
          ))
        : null}

      {settled && failed.length === 0 && stale ? (
        <StaleNotice
          onRetry={() => {
            for (const { query } of sources) void query.refetch();
          }}
        />
      ) : null}
    </div>
  );
}

export default UrgentAlertsCard;
