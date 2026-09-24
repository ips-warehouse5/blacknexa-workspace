/**
 * Incident Management — every reported incident.
 *
 * The case-verification side of a filed report (plan §9, D1): track,
 * investigate, assign and verify. Publication is decided in Content
 * Moderation; this queue shows it only as the moderation chip on rows whose
 * case decisions are waiting on it.
 *
 * Wired to `GET /admin/incidents` and `/summary` through `IncidentsTable`.
 * The access tier is the server's: an advocate's "All Incidents" is their own
 * assignments, and the table says so.
 */

import { useEffect } from "react";

import { Card, PageHeader } from "@/components/ui/Page";
import env from "@/config/env";
import { IncidentsTable } from "@/features/incidents/IncidentsTable";

export function IncidentsPage() {
  useEffect(() => {
    document.title = `Incidents · ${env.appName} Admin`;
  }, []);

  return (
    <Card>
      <PageHeader
        title="Incident Management"
        description="Track, investigate, assign, and verify reported incidents across all categories and locations."
      />
      <IncidentsTable scope="all" emptyMessage="No incidents found matching current filters." />
    </Card>
  );
}

export default IncidentsPage;
