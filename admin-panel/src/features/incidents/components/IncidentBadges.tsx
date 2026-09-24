/**
 * The small markers an incident wears in the queue and on its detail page.
 *
 * One module so the table row and the detail top bar cannot disagree about
 * what an incident is: its status pill (with "Deactivated" standing in for the
 * case status, as the prototype's sixth tab reads), the moderation chip while
 * it is not published, and the URGENT / SLA markers.
 *
 * The SLA marker is the C6 promise made visible (plan §10, contract §3.1): an
 * urgent report still submitted and unassigned past the SLA. It borrows the
 * `.urgent` pill's shape in the danger colours rather than adding a class,
 * because it is the same kind of marker at a higher severity.
 */

import { Badge } from "@/components/ui/Badge";
import { moderationChip, statusPill } from "@/features/incidents/incidents.format";
import type {
  ReportModerationState,
  ReportStatus,
} from "@/features/incidents/incidents.types";

export function IncidentStatusBadge({
  status,
  moderationState,
}: {
  status: ReportStatus;
  moderationState: ReportModerationState;
}) {
  const pill = statusPill({ status, moderationState });
  return <Badge tone={pill.tone}>{pill.label}</Badge>;
}

/**
 * The publication chip, rendered only while the incident waits on Content
 * Moderation. Smaller than the status pill so the two read as primary and
 * secondary rather than as two competing statuses.
 */
export function ModerationChip({ moderationState }: { moderationState: ReportModerationState }) {
  const chip = moderationChip(moderationState);
  if (!chip) return null;
  return (
    <span
      className={`badge ${chip.tone}`}
      style={{ fontSize: 11, padding: "2px 7px" }}
      title="Publication — decided in Content Moderation"
    >
      {chip.label}
    </span>
  );
}

export function UrgentBadge() {
  return (
    <span className="urgent" title="The reporter marked this urgent">
      URGENT
    </span>
  );
}

export function SlaBadge() {
  return (
    <span
      className="urgent"
      style={{ background: "#fee2e2", color: "#b91c1c" }}
      title="Urgent, still unassigned, and past the response SLA"
    >
      SLA
    </span>
  );
}
