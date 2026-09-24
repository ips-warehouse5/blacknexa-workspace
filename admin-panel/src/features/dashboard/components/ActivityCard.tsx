/**
 * Incident Activity — the prototype's bar chart, on `GET /admin/incidents/metrics`.
 *
 * The prototype drew one series (report submissions) over seven days. The
 * endpoint answers three measures — filed, published for the first time, sent
 * to a moderator — over 7, 30 or 90 days or 12 months. Three coloured series
 * side by side would put up to 270 bars in one card; instead one measure is
 * drawn at a time in the accent colour, and the tabs above the plot choose it
 * and carry each measure's total for the period, so every figure is one click
 * away and the chart never needs a legend. Every bar's tooltip, and the
 * screen-reader table under the plot, carry all three.
 *
 * The bars stay CSS, as in the prototype: they inherit the accent token and
 * follow a theme change, and a charting library would add weight for no mark
 * this card needs. With thirty or ninety buckets the gaps narrow and only
 * every seventh or fourteenth bar is labelled (`axisLabel`).
 *
 * Changing the range keeps the previous figures on screen, dimmed, until the
 * new ones arrive (`useIncidentMetrics`). Bucket dates are UTC days — see
 * `dashboard.format.ts` for why they are printed that way.
 */

import { useState, type ReactNode } from "react";

import { Tabs } from "@/components/ui/Page";
import { Select } from "@/components/ui/Select";
import { CardError, CardPlaceholder, StaleNotice } from "@/features/dashboard/components/CardStatus";
import {
  STATUS_SPLIT,
  activityCaption,
  axisLabel,
  bucketFor,
  bucketName,
  bucketTooltip,
  errorText,
  rangePhrase,
} from "@/features/dashboard/dashboard.format";
import { useIncidentMetrics } from "@/features/dashboard/dashboard.hooks";
import {
  ACTIVITY_SERIES,
  ACTIVITY_SERIES_EMPTY,
  ACTIVITY_SERIES_LABELS,
  METRICS_RANGE_OPTIONS,
  type ActivitySeries,
  type IncidentMetricsRange,
} from "@/features/dashboard/dashboard.types";

const RANGE_OPTIONS = METRICS_RANGE_OPTIONS.map((option) => ({
  value: option.value,
  label: option.label,
}));

/** Narrower gaps as the bucket count grows, so ninety bars still fit the card. */
function barGap(count: number): number {
  if (count > 45) return 2;
  if (count > 12) return 4;
  return 12;
}

export function ActivityCard({
  range,
  onRangeChange,
}: {
  range: IncidentMetricsRange;
  onRangeChange: (range: IncidentMetricsRange) => void;
}) {
  const [series, setSeries] = useState<ActivitySeries>("filed");
  const metrics = useIncidentMetrics(range);
  const data = metrics.data;
  const bucket = data?.bucket ?? bucketFor(range);
  const points = data?.activity ?? [];
  const total = data?.totals[series] ?? 0;
  // Bars are sized against the busiest bucket, so the tallest always fills
  // the plot and the shape stays readable whatever the absolute numbers are.
  const peak = Math.max(1, ...points.map((point) => point[series]));
  const updating = metrics.isPlaceholderData;

  const tabs = ACTIVITY_SERIES.map((value) => ({
    value,
    label: ACTIVITY_SERIES_LABELS[value],
    ...(data ? { count: data.totals[value] } : {}),
  }));

  let plot: ReactNode;
  if (!data) {
    plot = metrics.isError ? (
      <CardError
        message={errorText(metrics.error, "Could not load incident activity.")}
        onRetry={() => void metrics.refetch()}
      />
    ) : (
      <CardPlaceholder busy>Loading incident activity…</CardPlaceholder>
    );
  } else if (total === 0) {
    plot = <CardPlaceholder busy={updating}>{ACTIVITY_SERIES_EMPTY[series]}</CardPlaceholder>;
  } else {
    plot = (
      <>
        <div
          className="chart-bars-wrap"
          // The bars are pictures of the table below; the table is what a
          // screen reader reads, so the bars are hidden from it.
          aria-hidden="true"
          style={{
            gap: barGap(points.length),
            opacity: updating ? 0.5 : 1,
            transition: "opacity 0.15s",
          }}
        >
          {points.map((point, index) => {
            const value = point[series];
            const height = value === 0 ? 0 : Math.max(2, Math.round((value / peak) * 100));
            const label = axisLabel(point.date, index, points.length, bucket);
            const latest = index === points.length - 1;
            return (
              <div
                className="chart-bar-group"
                key={point.date}
                // On the whole column, not the bar: a short bar is a small
                // target, and an empty bucket has no bar to hover at all.
                title={bucketTooltip(point, bucket, latest)}
                style={{ minWidth: 0 }}
              >
                <div className="chart-bar" style={{ height: `${height}%` }} />
                <span
                  className="chart-bar-label"
                  style={{
                    whiteSpace: "nowrap",
                    ...(latest ? { fontWeight: 700, color: "var(--text)" } : {}),
                  }}
                >
                  {label ?? "\u00a0"}
                </span>
              </div>
            );
          })}
        </div>

        {/* The same numbers as a table, for anyone who cannot use the bars. */}
        <table className="sr-only">
          <caption>{`Incident activity per ${bucket} ${rangePhrase(data.range)}`}</caption>
          <thead>
            <tr>
              <th scope="col">{bucket === "month" ? "Month" : "Day"}</th>
              <th scope="col">Filed</th>
              <th scope="col">Published</th>
              <th scope="col">Held</th>
            </tr>
          </thead>
          <tbody>
            {points.map((point) => (
              <tr key={point.date}>
                <th scope="row">{bucketName(point.date, bucket)}</th>
                <td>{point.filed}</td>
                <td>{point.published}</td>
                <td>{point.held}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </>
    );
  }

  return (
    <div className="dash-card">
      <div className="dash-card-header">
        <div>
          <div className="dash-card-title">Incident Activity</div>
          <div className="dash-card-sub">{activityCaption(series, bucketFor(range), range)}</div>
        </div>
        <Select
          label="Activity date range"
          value={range}
          options={RANGE_OPTIONS}
          onChange={onRangeChange}
          minWidth={150}
        />
      </div>

      <Tabs label="Activity measure" items={tabs} value={series} onChange={setSeries} />

      {plot}

      {data && data.totals.filed > 0 ? (
        <p style={{ margin: "14px 0 0", fontSize: 11.5, color: "var(--muted)" }}>
          Filed in this period, where they stand now:{" "}
          {STATUS_SPLIT.map((status) => `${data.byStatus[status.key]} ${status.label}`).join(" · ")}
        </p>
      ) : null}

      {data && metrics.isError ? <StaleNotice onRetry={() => void metrics.refetch()} /> : null}
    </div>
  );
}

export default ActivityCard;
