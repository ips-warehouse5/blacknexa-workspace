/**
 * My Assigned Cases — the incidents assigned to the signed-in operator.
 *
 * Assignment is stored as a display string ("Advocate R. Idris") rather than an
 * id, so matching is by name. That is the prototype's model and it is kept
 * here; a real endpoint would filter by actor id server-side and this screen
 * would simply stop doing the matching.
 */

import { useEffect, useMemo } from "react";

import { Card, PageHeader } from "@/components/ui/Page";
import env from "@/config/env";
import { IncidentsTable } from "@/features/incidents/IncidentsTable";
import { FixtureNotice } from "@/features/misc/FixtureNotice";
import { incidents } from "@/mocks/incidents";
import { useAuthStore } from "@/stores/auth.store";

export function AssignedCasesPage() {
  const admin = useAuthStore((s) => s.admin);

  useEffect(() => {
    document.title = `My Assigned Cases · ${env.appName} Admin`;
  }, []);

  const mine = useMemo(() => {
    const name = admin?.name.trim().toLowerCase();
    if (!name) return [];
    return incidents.filter((incident) => {
      const assignee = incident.assignee.toLowerCase();
      if (!assignee || assignee === "unassigned") return false;
      // The assignee string carries the role as a prefix, so a substring match
      // on the name is what identifies the person.
      return assignee.includes(name);
    });
  }, [admin?.name]);

  return (
    <Card>
      <PageHeader
        title="My Assigned Cases"
        description="Incidents assigned to you. Add case notes and record the outcome of your review."
      />
      <FixtureNotice module="Assigned cases" />
      <IncidentsTable
        incidents={mine}
        showAssignee={false}
        emptyMessage="Nothing is assigned to you right now."
      />
    </Card>
  );
}

export default AssignedCasesPage;
