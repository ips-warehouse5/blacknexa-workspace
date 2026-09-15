/**
 * Incident Management — every reported incident.
 */

import { useEffect } from "react";

import { Card, PageHeader } from "@/components/ui/Page";
import env from "@/config/env";
import { IncidentsTable } from "@/features/incidents/IncidentsTable";
import { FixtureNotice } from "@/features/misc/FixtureNotice";
import { incidents } from "@/mocks/incidents";

export function IncidentsPage() {
  useEffect(() => {
    document.title = `Incidents · ${env.appName} Admin`;
  }, []);

  return (
    <Card>
      <PageHeader
        title="Incident Management"
        description="Review reported incidents, verify evidence, assign advocates, and record case decisions."
      />
      <FixtureNotice module="Incident management" />
      <IncidentsTable
        incidents={incidents}
        emptyMessage="No incidents match the selected filters."
      />
    </Card>
  );
}

export default IncidentsPage;
