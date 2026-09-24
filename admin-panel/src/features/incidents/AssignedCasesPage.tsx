/**
 * My Assigned Cases — the incidents assigned to the signed-in operator.
 *
 * The server filters by the operator's admin id (`assignee=me`, contract §3.1),
 * replacing the prototype's match on a display-name substring, which could not
 * tell two people with similar names apart and broke when a name was edited.
 * The tab counts use the same scope, so "Under Review (3)" means three of
 * *mine*.
 *
 * Assignees are moderators and advocates (D17), which is why the sidebar hides
 * this screen from Super Admins — they assign cases but are never assigned one.
 */

import { useEffect } from "react";

import { Card, PageHeader } from "@/components/ui/Page";
import env from "@/config/env";
import { IncidentsTable } from "@/features/incidents/IncidentsTable";

export function AssignedCasesPage() {
  useEffect(() => {
    document.title = `My Assigned Cases · ${env.appName} Admin`;
  }, []);

  return (
    <Card>
      <PageHeader
        title="My Assigned Cases"
        description="Review and manage cases currently assigned directly to you."
      />
      <IncidentsTable
        scope="assigned"
        showAssignee={false}
        emptyMessage="Nothing assigned to you matches the current filters."
      />
    </Card>
  );
}

export default AssignedCasesPage;
