/**
 * Dashboard — the operations overview.
 *
 * The prototype's command centre, on the API (plan §11 Phase 3C): five KPI
 * tiles, the incident activity chart, the category breakdown, regional
 * clusters and the urgent queue.
 *
 *   KPI tiles              the modules' own summaries (`KpiTiles`)
 *   Incident Activity      `GET /admin/incidents/metrics?range=` (`ActivityCard`)
 *   Incident Categories    the same answer, the same range (`CategoryCard`)
 *   Urgent Queue Alerts    the moderation queue and the urgent incidents
 *                          (`UrgentAlertsCard`)
 *   Top Regional Clusters  still prototype data (`RegionalClustersCard`)
 *
 * The page owns only two things: the date range, because the activity chart
 * chooses it and the category breakdown has to describe the same period; and
 * what the signed-in role may read (`useDashboardAccess`), resolved once and
 * handed to every card so none of them asks for what the role cannot see. An
 * advocate's incident figures are their own assignments — the server scopes
 * them (contract §3.0), and the cards word themselves to match.
 *
 * Only two parts still show prototype figures — the Total Users tile and the
 * regional clusters — and each carries its own `FixtureNotice`, so the notice
 * no longer covers the screen.
 */

import { useEffect, useState } from "react";

import { Card, PageHeader } from "@/components/ui/Page";
import env from "@/config/env";
import { ActivityCard } from "@/features/dashboard/components/ActivityCard";
import { CategoryCard } from "@/features/dashboard/components/CategoryCard";
import { KpiTiles } from "@/features/dashboard/components/KpiTiles";
import { RegionalClustersCard } from "@/features/dashboard/components/RegionalClustersCard";
import { UrgentAlertsCard } from "@/features/dashboard/components/UrgentAlertsCard";
import { useDashboardAccess } from "@/features/dashboard/dashboard.hooks";
import type { IncidentMetricsRange } from "@/features/dashboard/dashboard.types";
import { FixtureNotice } from "@/features/misc/FixtureNotice";

export function DashboardPage() {
  const access = useDashboardAccess();
  const [range, setRange] = useState<IncidentMetricsRange>("7d");

  useEffect(() => {
    document.title = `Dashboard · ${env.appName} Admin`;
  }, []);

  return (
    <Card>
      <PageHeader
        title="Dashboard Overview"
        description={
          access.assignedOnly
            ? "Your assigned incidents at a glance: case volume, activity and anything urgent waiting on you."
            : "Real-time command center monitoring platform safety, user activity, incident volume, and queue health."
        }
      />

      <FixtureNotice module="The Total Users tile" />

      <KpiTiles access={access} />

      {access.incidents ? (
        <div className="dash-grid-2">
          <ActivityCard range={range} onRangeChange={setRange} />
          <CategoryCard range={range} />
        </div>
      ) : null}

      <div className="dash-grid-2">
        <RegionalClustersCard />
        {access.incidents || access.moderation ? <UrgentAlertsCard access={access} /> : null}
      </div>
    </Card>
  );
}

export default DashboardPage;
