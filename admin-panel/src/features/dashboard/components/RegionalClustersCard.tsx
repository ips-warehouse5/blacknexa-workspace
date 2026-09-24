/**
 * Top Regional Clusters — still the prototype's table.
 *
 * No endpoint answers it yet: a report carries a free-text area label, not a
 * region, and the prototype's risk levels have no definition behind them to
 * compute. Rather than invent both, the card keeps the design's rows and says
 * so with its own `FixtureNotice`, so the live cards around it are not taken
 * for prototypes and this one is not taken for live.
 */

import { Badge } from "@/components/ui/Badge";
import { regionalClusters, type RiskLevel } from "@/features/dashboard/dashboard.fixtures";
import { FixtureNotice } from "@/features/misc/FixtureNotice";

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

export function RegionalClustersCard() {
  return (
    <div className="dash-card">
      <div className="dash-card-header">
        <div>
          <div className="dash-card-title">Top Regional Clusters</div>
          <div className="dash-card-sub">Active community safety reports by location</div>
        </div>
      </div>

      <FixtureNotice module="Top Regional Clusters" />

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
  );
}

export default RegionalClustersCard;
