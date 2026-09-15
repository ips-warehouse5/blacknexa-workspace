/**
 * Dashboard — the operations overview.
 *
 * Ported from the prototype's command centre: five KPI tiles, a weekly activity
 * chart, the category breakdown, regional clusters, and the urgent queue.
 *
 * The bar chart is drawn with CSS rather than a charting library. Seven bars
 * with a label each do not justify a dependency, and this way the bars inherit
 * the accent token and follow a theme change for free.
 */

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { Card, KpiCard, KpiGrid, PageHeader } from "@/components/ui/Page";
import { Select } from "@/components/ui/Select";
import env from "@/config/env";
import {
  DATE_RANGES,
  categoryShares,
  kpiFigures,
  regionalClusters,
  urgentAlerts,
  weekActivity,
  type DateRange,
  type RiskLevel,
} from "@/features/dashboard/dashboard.fixtures";
import { FixtureNotice } from "@/features/misc/FixtureNotice";

/** Extra detail under the value on specific tiles, matching the design. */
const KPI_FOOTERS: Record<string, React.ReactNode> = {
  "Total Users": (
    <>
      <span className="kpi-growth-pill positive">↑ +14.8%</span>
      <span>vs last month</span>
    </>
  ),
  "Total Incidents": (
    <span style={{ fontSize: 11, display: "flex", flexWrap: "wrap", gap: 4 }}>
      <span style={{ color: "#0284c7", fontWeight: 600 }}>4 Submitted</span>
      <span>·</span>
      <span style={{ color: "#d97706", fontWeight: 600 }}>18 Under Review</span>
      <span>·</span>
      <span style={{ color: "#15803d", fontWeight: 600 }}>62 Verified</span>
    </span>
  ),
  "Pending Moderation": (
    <>
      <span className="kpi-growth-pill urgent">3 Urgent</span>
      <span>need review</span>
    </>
  ),
  "Verified Advocates": (
    <>
      <span className="kpi-growth-pill positive">100% Verified</span>
      <span>active duty</span>
    </>
  ),
  "Support Inquiries": (
    <>
      <span className="kpi-growth-pill positive">4 Staff Active</span>
      <span>triage queue</span>
    </>
  ),
};

/** Badge tone per risk level. Moderate has no badge class, so it is styled inline. */
function RiskBadge({ risk }: { risk: RiskLevel }) {
  if (risk === "High Risk") {
    return (
      <Badge tone="suspended" className="risk-badge">
        High Risk
      </Badge>
    );
  }
  if (risk === "Normal") {
    return (
      <Badge tone="active" className="risk-badge">
        Normal
      </Badge>
    );
  }
  return <span className="badge risk-badge risk-moderate">Moderate</span>;
}

export function DashboardPage() {
  const [range, setRange] = useState<DateRange>("week");

  useEffect(() => {
    document.title = `Dashboard · ${env.appName} Admin`;
  }, []);

  const caption = useMemo(
    () => DATE_RANGES.find((r) => r.value === range)?.caption ?? "",
    [range],
  );

  // Bars are sized against the busiest day, so the tallest always fills the
  // plot and the shape stays readable whatever the absolute numbers are.
  const peak = Math.max(...weekActivity.map((point) => point.reports));

  return (
    <Card>
      <PageHeader
        title="Dashboard Overview"
        description="Real-time command center monitoring platform safety, user activity, incident volume, and queue health."
      />

      <FixtureNotice />

      <KpiGrid>
        {kpiFigures.map((figure) => (
          <KpiCard
            key={figure.label}
            label={figure.label}
            value={figure.value}
            icon={<Icon name={figure.icon} />}
            iconStyle={{ background: figure.iconBg, color: figure.iconColor }}
            footer={KPI_FOOTERS[figure.label]}
          />
        ))}
      </KpiGrid>

      <div className="dash-grid-2">
        {/* ── Activity ────────────────────────────────────────────────── */}
        <div className="dash-card">
          <div className="dash-card-header">
            <div>
              <div className="dash-card-title">Incident Activity</div>
              <div className="dash-card-sub">{caption}</div>
            </div>
            <Select
              label="Activity date range"
              value={range}
              options={DATE_RANGES.map((r) => ({ value: r.value, label: r.label }))}
              onChange={setRange}
              minWidth={150}
            />
          </div>

          <div className="chart-bars-wrap">
            {weekActivity.map((point, index) => {
              const isLatest = index === weekActivity.length - 1;
              return (
                <div className="chart-bar-group" key={point.day}>
                  <div
                    className="chart-bar"
                    style={{ height: `${Math.round((point.reports / peak) * 100)}%` }}
                    // The bar is decorative; the figure it represents is in the
                    // title so it is reachable by pointer and by screen reader.
                    title={`${point.date}: ${point.reports} reports`}
                  />
                  <span
                    className="chart-bar-label"
                    {...(isLatest ? { style: { fontWeight: 700, color: "var(--text)" } } : {})}
                  >
                    {point.day}
                  </span>
                </div>
              );
            })}
          </div>

          {/* The same numbers as a table, for anyone who cannot use the bars. */}
          <table className="sr-only">
            <caption>Report submissions per day</caption>
            <thead>
              <tr>
                <th scope="col">Day</th>
                <th scope="col">Reports</th>
              </tr>
            </thead>
            <tbody>
              {weekActivity.map((point) => (
                <tr key={point.day}>
                  <th scope="row">{point.date}</th>
                  <td>{point.reports}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── Category distribution ───────────────────────────────────── */}
        <div className="dash-card">
          <div className="dash-card-header">
            <div>
              <div className="dash-card-title">Incident Categories</div>
              <div className="dash-card-sub">Distribution across community report domains</div>
            </div>
          </div>

          <div className="cat-progress-list">
            {categoryShares.map((category) => (
              <div className="cat-progress-row" key={category.label}>
                <div className="cat-progress-meta">
                  <span style={{ fontWeight: 500 }}>{category.label}</span>
                  <strong style={{ color: "var(--text)" }}>
                    {category.percent}% ({category.count})
                  </strong>
                </div>
                <div
                  className="cat-progress-bar-bg"
                  role="meter"
                  aria-valuenow={category.percent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${category.label}: ${category.percent} percent, ${category.count} incidents`}
                >
                  <div
                    className="cat-progress-fill"
                    style={{ width: `${category.percent}%`, background: category.colour }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="dash-grid-2">
        {/* ── Regional clusters ───────────────────────────────────────── */}
        <div className="dash-card">
          <div className="dash-card-header">
            <div>
              <div className="dash-card-title">Top Regional Clusters</div>
              <div className="dash-card-sub">Active community safety reports by location</div>
            </div>
          </div>

          <table className="table" style={{ tableLayout: "fixed", marginTop: 0 }}>
            <thead>
              <tr>
                <th scope="col" style={{ width: "45%" }}>
                  Region / City
                </th>
                <th scope="col" style={{ width: "25%" }}>
                  Active Cases
                </th>
                <th scope="col" style={{ width: "30%", textAlign: "right" }}>
                  Risk Level
                </th>
              </tr>
            </thead>
            <tbody>
              {regionalClusters.map((cluster) => (
                <tr key={cluster.region}>
                  <td>
                    <strong>{cluster.region}</strong>
                  </td>
                  <td>{cluster.cases} cases</td>
                  <td style={{ textAlign: "right" }}>
                    <RiskBadge risk={cluster.risk} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── Urgent queue ────────────────────────────────────────────── */}
        <div className="dash-card">
          <div className="dash-card-header">
            <div>
              <div className="dash-card-title">Urgent Queue Alerts</div>
              <div className="dash-card-sub">Reports requiring immediate operator attention</div>
            </div>
            <Badge tone="suspended" className="risk-badge">
              Action Required
            </Badge>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {urgentAlerts.map((alert) => (
              <div className="dash-alert-item" key={alert.id}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text)" }}>
                    {alert.title}
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>
                    {alert.detail}
                  </div>
                </div>
                <Link
                  to={alert.to}
                  className="action-icon-btn"
                  title={`Open ${alert.id}`}
                  aria-label={`Open ${alert.id}`}
                  style={{ flexShrink: 0 }}
                >
                  <Icon name="eye" />
                </Link>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

export default DashboardPage;
