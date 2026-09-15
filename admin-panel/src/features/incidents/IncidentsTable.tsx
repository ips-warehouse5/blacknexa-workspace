/**
 * The incident queue, shared by "All Incidents" and "My Assigned Cases".
 *
 * The two screens differ only in which incidents they start from and what they
 * say when there are none, so they are one component with two entry points
 * rather than two nearly-identical files that drift apart.
 */

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { SearchInput } from "@/components/ui/Fields";
import { Icon } from "@/components/ui/Icon";
import { Tabs } from "@/components/ui/Page";
import { Pagination } from "@/components/ui/Pagination";
import { Select } from "@/components/ui/Select";
import { useLocalTable } from "@/hooks/useLocalTable";
import type { Incident, IncidentStatus } from "@/mocks/types";

/** Status labels mapped onto the badge classes the design defines. */
export const STATUS_TONES: Record<IncidentStatus, BadgeTone> = {
  Submitted: "submitted",
  "Under Review": "under_review",
  Verified: "verified",
  Dismissed: "dismissed",
  Deactivated: "deactivated",
};

const STATUS_TABS: (IncidentStatus | "All")[] = [
  "All",
  "Submitted",
  "Under Review",
  "Verified",
  "Dismissed",
  "Deactivated",
];

const CATEGORY_OPTIONS = [
  { value: "All", label: "All Categories" },
  { value: "Policing", label: "Policing" },
  { value: "Profiling", label: "Profiling" },
  { value: "Housing", label: "Housing" },
  { value: "Workplace", label: "Workplace" },
  { value: "Education", label: "Education" },
  { value: "Medical", label: "Medical" },
  { value: "Digital", label: "Digital" },
  { value: "Harassment", label: "Harassment" },
];

const SORT_OPTIONS = [
  { value: "newest" as const, label: "Newest First" },
  { value: "oldest" as const, label: "Oldest First" },
];

export interface IncidentsTableProps {
  incidents: readonly Incident[];
  emptyMessage: string;
  /** Hidden when every row is assigned to the same person anyway. */
  showAssignee?: boolean;
}

export function IncidentsTable({
  incidents,
  emptyMessage,
  showAssignee = true,
}: IncidentsTableProps) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<IncidentStatus | "All">("All");
  const [category, setCategory] = useState("All");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");

  const rows = useMemo(
    () => (sort === "oldest" ? [...incidents].reverse() : incidents),
    [incidents, sort],
  );

  const filters = useMemo(
    () => [
      (incident: Incident) => tab === "All" || incident.status === tab,
      (incident: Incident) => category === "All" || incident.category === category,
    ],
    [tab, category],
  );

  const table = useLocalTable<Incident>({
    rows,
    searchFields: useMemo(
      () => (incident: Incident) => [
        incident.id,
        incident.title,
        incident.location,
        incident.author,
        incident.category,
        incident.story,
      ],
      [],
    ),
    filters,
  });

  const columns: Column<Incident>[] = [
    {
      key: "title",
      header: "Title & ID",
      width: showAssignee ? "28%" : "34%",
      render: (incident) => (
        <>
          <div className="title-row-wrap">
            <span className="title-truncate" title={incident.title}>
              {incident.title}
            </span>
          </div>
          <span className="sub">
            {incident.id} · {incident.author}
          </span>
        </>
      ),
    },
    { key: "category", header: "Category", width: "13%", render: (i) => i.category },
    {
      key: "location",
      header: "Location",
      width: "13%",
      cellClassName: "cell-truncate",
      render: (i) => i.location,
    },
    {
      key: "status",
      header: "Status",
      width: "12%",
      render: (i) => <Badge tone={STATUS_TONES[i.status]}>{i.status}</Badge>,
    },
    ...(showAssignee
      ? [
          {
            key: "assignee",
            header: "Assigned To",
            width: "15%",
            render: (incident: Incident) =>
              incident.assignee === "Unassigned" ? (
                <span style={{ color: "var(--muted)", fontStyle: "italic" }}>Unassigned</span>
              ) : (
                <span style={{ fontSize: 13 }}>{incident.assignee}</span>
              ),
          },
        ]
      : []),
    {
      key: "submitted",
      header: "Submitted At",
      width: "11%",
      render: (i) => <span style={{ fontSize: 12.5 }}>{i.submitted}</span>,
    },
    {
      key: "actions",
      header: "Actions",
      width: "8%",
      align: "right",
      render: (incident) => (
        <button
          type="button"
          className="action-icon-btn"
          aria-label={`Open ${incident.id}`}
          title="Open incident"
          onClick={(e) => {
            // The row is clickable too; without this the handler fires twice.
            e.stopPropagation();
            navigate(`/incidents/${incident.id}`);
          }}
        >
          <Icon name="eye" />
        </button>
      ),
    },
  ];

  return (
    <>
      <Tabs
        label="Filter incidents by status"
        items={STATUS_TABS.map((value) => ({
          value,
          label: value,
          count:
            value === "All"
              ? incidents.length
              : incidents.filter((i) => i.status === value).length,
        }))}
        value={tab}
        onChange={setTab}
      />

      <div className="filters">
        <SearchInput
          value={table.search}
          onChange={table.setSearch}
          placeholder="Search by ID, title, location…"
          label="Search incidents"
        />
        <Select
          label="Filter by category"
          value={category}
          options={CATEGORY_OPTIONS}
          onChange={setCategory}
          minWidth={170}
        />
        <Select
          label="Sort order"
          value={sort}
          options={SORT_OPTIONS}
          onChange={setSort}
          minWidth={150}
        />
      </div>

      <DataTable
        caption="Reported incidents"
        columns={columns}
        rows={table.pageRows}
        rowKey={(incident) => incident.id}
        minWidth="960px"
        emptyMessage={emptyMessage}
        onRowClick={(incident) => navigate(`/incidents/${incident.id}`)}
      />

      {table.total > 0 ? (
        <Pagination
          page={table.page}
          pageSize={table.pageSize}
          total={table.total}
          onPageChange={table.setPage}
          onPageSizeChange={table.setPageSize}
          itemLabel="incidents"
        />
      ) : null}
    </>
  );
}

export default IncidentsTable;
