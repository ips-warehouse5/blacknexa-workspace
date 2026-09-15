/**
 * Incident categories configured in settings.
 *
 * Lifted verbatim from the approved prototype so that the ported screens show
 * exactly what was signed off. Replaced by a real endpoint when this module is
 * wired up — the typing is the domain shape, not the fixture's shape, so the
 * screen does not change when that happens.
 */

import type { IncidentCategory } from "@/mocks/types";

export const incidentCategories: IncidentCategory[] = [
  { id: "ICT-001", name: "Policing", status: "active" },
  { id: "ICT-002", name: "Profiling", status: "active" },
  { id: "ICT-003", name: "Housing", status: "active" },
  { id: "ICT-004", name: "Workplace", status: "active" },
  { id: "ICT-005", name: "Education", status: "active" },
  { id: "ICT-006", name: "Medical", status: "active" },
  { id: "ICT-007", name: "Digital", status: "active" },
  { id: "ICT-008", name: "Harassment", status: "active" },
  { id: "ICT-009", name: "Abuse", status: "inactive" },
];

export default incidentCategories;
