/**
 * Incident Categories — the prototype's share bars, on the metrics endpoint.
 *
 * Reads the same `GET /admin/incidents/metrics` answer as Incident Activity
 * (one request for both — the range is chosen on the activity card and shared
 * through the page), so the two cards always describe the same period. Labels
 * are the server's category names; only categories with reports are listed,
 * most first, so a quiet week shows two rows rather than nine with seven
 * empty.
 *
 * Every bar is the accent colour. The prototype gave each category its own
 * hue, but each row already names its category in text beside the bar, so
 * colour carried no identity — it only made nine categories need nine
 * distinguishable colours in two themes. One hue reads as what it is: a share.
 */

import { CardError, CardPlaceholder, StaleNotice } from "@/features/dashboard/components/CardStatus";
import { errorText, rangePhrase, sharePercent } from "@/features/dashboard/dashboard.format";
import { useIncidentMetrics } from "@/features/dashboard/dashboard.hooks";
import type { IncidentMetricsRange } from "@/features/dashboard/dashboard.types";

export function CategoryCard({ range }: { range: IncidentMetricsRange }) {
  const metrics = useIncidentMetrics(range);
  const data = metrics.data;
  const rows = (data?.categories ?? []).filter((category) => category.count > 0);
  const total = rows.reduce((sum, category) => sum + category.count, 0);

  let body;
  if (!data) {
    body = metrics.isError ? (
      <CardError
        message={errorText(metrics.error, "Could not load the category breakdown.")}
        onRetry={() => void metrics.refetch()}
      />
    ) : (
      <CardPlaceholder busy>Loading categories…</CardPlaceholder>
    );
  } else if (rows.length === 0) {
    body = <CardPlaceholder busy={metrics.isPlaceholderData}>No incidents were filed in this period.</CardPlaceholder>;
  } else {
    body = (
      <div
        className="cat-progress-list"
        style={{ opacity: metrics.isPlaceholderData ? 0.5 : 1, transition: "opacity 0.15s" }}
      >
        {rows.map((category) => {
          const share = sharePercent(category.count, total);
          return (
            <div className="cat-progress-row" key={category.category}>
              <div className="cat-progress-meta">
                <span style={{ fontWeight: 500 }}>{category.label}</span>
                <strong style={{ color: "var(--text)" }}>
                  {share.label} ({category.count})
                </strong>
              </div>
              <div
                className="cat-progress-bar-bg"
                role="meter"
                aria-valuenow={Math.round(share.value)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${category.label}: ${share.label} of incidents filed, ${category.count} ${category.count === 1 ? "incident" : "incidents"}`}
              >
                <div className="cat-progress-fill" style={{ width: `${share.value}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="dash-card">
      <div className="dash-card-header">
        <div>
          <div className="dash-card-title">Incident Categories</div>
          <div className="dash-card-sub">
            {total > 0
              ? `${total} ${total === 1 ? "incident" : "incidents"} filed ${rangePhrase(range)}`
              : `Incidents filed ${rangePhrase(range)}`}
          </div>
        </div>
      </div>

      {body}

      {data && metrics.isError ? <StaleNotice onRetry={() => void metrics.refetch()} /> : null}
    </div>
  );
}

export default CategoryCard;
