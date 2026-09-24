/**
 * CASE ASSIGNMENT — who is working the case (plan §9.2, D17).
 *
 * The prototype's card, made real. Assigned: ASSIGNED TO, ROLE, ASSIGNED AT
 * (plus who assigned it, which the API now records) with Reassign. Unassigned,
 * or reassigning: "Select advocate or moderator to assign this case:", the
 * picker, Save Assignment and Cancel. Added to the prototype: Unassign, which
 * the API supports (`adminId: null`) and without which a wrong assignment could
 * only be corrected by assigning someone else.
 *
 * The picker is the real roster — `GET /admin/incidents/assignees`, active
 * moderators and advocates with their open-case counts — replacing the five
 * hard-coded display strings (two of whom were app users, one of whom existed
 * nowhere). That endpoint needs `incidents.assign` (superadmin), so it is only
 * asked for by operators who hold it; everyone else sees the assignment
 * read-only with the action locked and a reason, rather than a picker that
 * would fail.
 *
 * Assigning a published, submitted incident also moves it to Under Review
 * (D17) — the help text says so, because the status pill changing on its own
 * would otherwise look like a side effect nobody asked for.
 */

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Select } from "@/components/ui/Select";
import { RecordField } from "@/features/incidents/components/RecordField";
import { formatDateTime } from "@/features/incidents/incidents.format";
import { useAssignIncident, useIncidentAssignees } from "@/features/incidents/incidents.hooks";
import type { IncidentDetail } from "@/features/incidents/incidents.types";
import { ApiError } from "@/types/api";

export interface CaseAssignmentCardProps {
  incidentId: string;
  caseRef: string;
  assignee: IncidentDetail["assignee"];
  /** `incidents.assign` — decides whether the roster is fetched at all. */
  canAssign: boolean;
  /** Why the controls are locked, for operators without `incidents.assign`. */
  assignDenied: string | undefined;
}

export function CaseAssignmentCard({
  incidentId,
  caseRef,
  assignee,
  canAssign,
  assignDenied,
}: CaseAssignmentCardProps) {
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState("");
  const [confirmUnassign, setConfirmUnassign] = useState(false);

  const roster = useIncidentAssignees(canAssign);
  const assign = useAssignIncident();

  const options = (roster.data ?? []).map((person) => ({
    value: person.id,
    label: `${person.name} (${person.roleLabel})`,
    hint:
      person.id === assignee?.id
        ? "Currently assigned"
        : `${person.openAssigned} open ${person.openAssigned === 1 ? "case" : "cases"}`,
  }));

  const startReassign = () => {
    setSelected(assignee?.id ?? "");
    setEditing(true);
  };

  const cancelReassign = () => {
    setSelected("");
    setEditing(false);
  };

  const save = async () => {
    if (!selected) return;
    try {
      await assign.mutateAsync({ id: incidentId, input: { adminId: selected } });
      setSelected("");
      setEditing(false);
    } catch {
      // The hook has already reported it; the picker stays open with the
      // choice intact so the operator can try again or pick someone else.
    }
  };

  const unassign = async () => {
    try {
      await assign.mutateAsync({ id: incidentId, input: { adminId: null } });
    } finally {
      setConfirmUnassign(false);
    }
  };

  const lockProps = assignDenied ? { deniedReason: assignDenied } : {};
  const showPicker = canAssign && (!assignee || editing);

  return (
    <div className="action-card">
      <div className="action-card-title">Case Assignment</div>

      {assignee && !editing ? (
        <>
          <RecordField label="Assigned To" emphasis>
            {assignee.name}
          </RecordField>
          <RecordField label="Role">{assignee.roleLabel}</RecordField>
          <RecordField label="Assigned At" last={!assignee.assignedBy}>
            {formatDateTime(assignee.assignedAt)}
          </RecordField>
          {assignee.assignedBy ? (
            <RecordField label="Assigned By" last>
              {assignee.assignedBy.name}
            </RecordField>
          ) : null}

          <div style={{ display: "flex", gap: 8 }}>
            <Button
              variant="outline"
              style={{ flex: 1, padding: 9, fontSize: 13, fontWeight: 600 }}
              {...lockProps}
              onClick={startReassign}
            >
              Reassign
            </Button>
            <Button
              variant="outline"
              style={{ padding: "9px 12px", fontSize: 13, fontWeight: 600 }}
              {...lockProps}
              onClick={() => setConfirmUnassign(true)}
            >
              Unassign
            </Button>
          </div>
        </>
      ) : null}

      {showPicker ? (
        <>
          <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 8 }}>
            Select advocate or moderator to assign this case:
          </div>

          {roster.isError ? (
            <div style={{ fontSize: 12, color: "var(--danger)", marginBottom: 10 }}>
              {roster.error instanceof ApiError
                ? roster.error.message
                : "Could not load the people this case can be assigned to."}{" "}
              <button
                type="button"
                className="review"
                style={{ padding: 0, fontSize: 12 }}
                onClick={() => void roster.refetch()}
              >
                Try again
              </button>
            </div>
          ) : (
            <div style={{ marginBottom: 10 }}>
              <Select
                label="Assign to"
                value={selected}
                options={options}
                placeholder={
                  roster.isLoading
                    ? "Loading team members…"
                    : options.length === 0
                      ? "No active moderators or advocates"
                      : "Choose a moderator or advocate…"
                }
                disabled={roster.isLoading || options.length === 0}
                onChange={setSelected}
              />
            </div>
          )}

          <div style={{ display: "flex", gap: 6 }}>
            <Button
              variant="primary"
              style={{ flex: 1, padding: 8, fontSize: 12 }}
              loading={assign.isPending}
              disabled={!selected || selected === assignee?.id}
              onClick={() => void save()}
            >
              Save Assignment
            </Button>
            {editing ? (
              <Button
                variant="outline"
                style={{ padding: "8px 12px", fontSize: 12 }}
                disabled={assign.isPending}
                onClick={cancelReassign}
              >
                Cancel
              </Button>
            ) : null}
          </div>
        </>
      ) : null}

      {!assignee && !canAssign ? (
        <>
          <RecordField label="Assigned To" emphasis last>
            <span style={{ color: "var(--muted)", fontStyle: "italic", fontWeight: 400 }}>
              Unassigned
            </span>
          </RecordField>
          <Button
            variant="outline"
            style={{ width: "100%", padding: 9, fontSize: 13, fontWeight: 600 }}
            {...lockProps}
          >
            Assign Case
          </Button>
        </>
      ) : null}

      <div className="action-help-text">
        {canAssign
          ? "Assigning a published, submitted incident moves it to Under Review. Only active moderators and advocates can be assigned."
          : "Cases are assigned by a Super Admin. Assigned moderators and advocates find them under My Assigned Cases."}
      </div>

      <ConfirmDialog
        open={confirmUnassign}
        title="Unassign Case"
        description={
          assignee
            ? `${caseRef} goes back to the unassigned queue.${
                assignee.role === "advocate"
                  ? ` ${assignee.name} is an advocate, so they will no longer be able to open it.`
                  : ""
              }`
            : ""
        }
        confirmLabel="Unassign"
        destructive
        busy={assign.isPending}
        onConfirm={() => void unassign()}
        onCancel={() => setConfirmUnassign(false)}
      />
    </div>
  );
}

export default CaseAssignmentCard;
