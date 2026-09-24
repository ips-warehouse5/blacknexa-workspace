/**
 * The incident queue, shared by "All Incidents" and "My Assigned Cases".
 *
 * The two screens differ only in scope — *My Assigned Cases* asks the server
 * for `assignee=me` and drops the Assigned To column, whose every cell would
 * name the reader — so they are one component with two entry points rather
 * than two nearly-identical files that drift apart.
 *
 * Server-paged (plan §9.2, contract §3.1): the status tab, search, category,
 * date window and sort all go to `GET /admin/incidents`, and the tab counts
 * come from `GET /admin/incidents/summary` in the same scope. As in the
 * prototype, the counts describe the whole queue for the tab strip and ignore
 * the other filters. The server applies the access tier too: an advocate's
 * list is their assignments whatever this screen asks for, which is why the
 * "All Incidents" screen tells an advocate so rather than implying the queue
 * is empty elsewhere.
 *
 * Layout and copy follow the prototype's incident queue: the six status tabs,
 * search, category (now including *Other*, which the backend and the mobile
 * wizard have and the prototype's dropdown lacked), the date filter with its
 * inline Custom From / To and Apply / Reset, and the Newest / Oldest sort.
 *
 * The filters live in the URL (review Q17, `incidents.queue.ts`), so opening an
 * incident and coming back lands on the same tab, page, search and filters.
 * Only what is mid-edit stays local: the search box until typing settles, and
 * the custom From / To until Apply.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { DataTable, type Column } from "@/components/ui/DataTable";
import { SearchInput } from "@/components/ui/Fields";
import { Icon } from "@/components/ui/Icon";
import { Tabs } from "@/components/ui/Page";
import { Pagination } from "@/components/ui/Pagination";
import { Select } from "@/components/ui/Select";
import {
  IncidentStatusBadge,
  ModerationChip,
  SlaBadge,
  UrgentBadge,
} from "@/features/incidents/components/IncidentBadges";
import { formatDate, formatTime } from "@/features/incidents/incidents.format";
import { useIncidentList, useIncidentSummary } from "@/features/incidents/incidents.hooks";
import {
  INCIDENT_PAGE_SIZES,
  readIncidentFilters,
  writeIncidentFilters,
  type IncidentQueueFilters,
} from "@/features/incidents/incidents.queue";
import {
  CATEGORY_LABELS,
  INCIDENT_DATE_FILTERS,
  INCIDENT_DATE_FILTER_LABELS,
  INCIDENT_STATUS_TABS,
  INCIDENT_STATUS_TAB_LABELS,
  REPORT_CATEGORIES,
  type IncidentDateFilter,
  type IncidentListItem,
  type IncidentScope,
  type IncidentSort,
  type IncidentStatusTab,
  type ReportCategory,
} from "@/features/incidents/incidents.types";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useAuthStore } from "@/stores/auth.store";
import { ApiError } from "@/types/api";

const CATEGORY_OPTIONS: { value: ReportCategory | "all"; label: string }[] = [
  { value: "all", label: "All Categories" },
  ...REPORT_CATEGORIES.map((category) => ({
    value: category as ReportCategory | "all",
    label: CATEGORY_LABELS[category],
  })),
];

const DATE_OPTIONS = INCIDENT_DATE_FILTERS.map((value) => ({
  value,
  label: INCIDENT_DATE_FILTER_LABELS[value],
}));

const SORT_OPTIONS: { value: IncidentSort; label: string }[] = [
  { value: "newest", label: "Newest First" },
  { value: "oldest", label: "Oldest First" },
];

/** The prototype's inline styling for the custom-range inputs and buttons. */
const DATE_INPUT_STYLE: React.CSSProperties = {
  padding: "7px 10px",
  fontSize: 12.5,
  fontWeight: 400,
  borderRadius: 8,
  border: "1px solid var(--line)",
  background: "var(--surface)",
  color: "var(--text)",
  outline: "none",
};
const DATE_LABEL_STYLE: React.CSSProperties = {
  fontSize: 12,
  color: "var(--muted)",
  fontWeight: 500,
};
const DATE_BUTTON_STYLE: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
  padding: "7px 14px",
  borderRadius: 8,
};

export interface IncidentsTableProps {
  scope: IncidentScope;
  emptyMessage: string;
  /** Hidden on *My Assigned Cases*, where every row is assigned to the reader. */
  showAssignee?: boolean;
}

export function IncidentsTable({ scope, emptyMessage, showAssignee = true }: IncidentsTableProps) {
  const navigate = useNavigate();
  const role = useAuthStore((s) => s.admin?.role ?? null);

  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useMemo(() => readIncidentFilters(searchParams), [searchParams]);
  const { page, limit, status, category, sort, date } = filters;

  /*
   * Every change replaces the history entry rather than pushing one, so Back
   * leaves the queue instead of stepping through each tab clicked. Filter
   * changes also return to page one — page 7 of an unfiltered queue is rarely
   * page 7 of a filtered one — written into the same update, so the request
   * is made once with the right page.
   */
  const updateFilters = useCallback(
    (patch: Partial<IncidentQueueFilters>) => {
      setSearchParams(
        (current) => writeIncidentFilters({ ...readIncidentFilters(current), ...patch }),
        { replace: true },
      );
    },
    [setSearchParams],
  );

  /*
   * The search box is local until typing settles, then committed to the URL.
   *
   * Two guards keep the box and the URL from fighting. The box follows the URL
   * when the URL changes from outside (Back, the sidebar link to a clean
   * queue) — but not when the change is our own commit of what was typed, or a
   * trailing space mid-word would be trimmed away under the caret. And only a
   * new settled value is committed, so the stale settled value still in the
   * debouncer cannot write an old search back over a URL that just cleared it.
   */
  const [search, setSearch] = useState(filters.search);
  const [urlSearch, setUrlSearch] = useState(filters.search);
  if (filters.search !== urlSearch) {
    setUrlSearch(filters.search);
    if (filters.search !== search.trim()) setSearch(filters.search);
  }
  const debouncedSearch = useDebouncedValue(search, 300);
  const committedSearch = useRef(debouncedSearch);
  useEffect(() => {
    if (debouncedSearch === committedSearch.current) return;
    committedSearch.current = debouncedSearch;
    const next = debouncedSearch.trim();
    if (next !== filters.search) updateFilters({ search: next, page: 1 });
  }, [debouncedSearch, filters.search, updateFilters]);

  const setStatus = (value: IncidentStatusTab) => updateFilters({ status: value, page: 1 });
  const setCategory = (value: ReportCategory | "all") =>
    updateFilters({ category: value, page: 1 });
  const setSort = (value: IncidentSort) => updateFilters({ sort: value, page: 1 });
  const setLimit = (value: number) => updateFilters({ limit: value, page: 1 });
  const setPage = (value: number) => updateFilters({ page: value });

  /*
   * The custom window has two copies: what is typed (here), and what was
   * applied (the URL). The prototype filters only on Apply, so typing a From
   * date does not fire a request per keystroke of the date picker and half a
   * range is never sent. The drafts start from the applied window, so coming
   * back to a custom-filtered queue shows the dates it is filtered by.
   */
  const [draftFrom, setDraftFrom] = useState(filters.from);
  const [draftTo, setDraftTo] = useState(filters.to);
  // Follow the applied window when the URL changes it from outside, as the
  // search box does; after Apply this sets the drafts to what they already are.
  const appliedRange = `${filters.from}|${filters.to}`;
  const [urlRange, setUrlRange] = useState(appliedRange);
  if (appliedRange !== urlRange) {
    setUrlRange(appliedRange);
    setDraftFrom(filters.from);
    setDraftTo(filters.to);
  }
  const fromInputRef = useRef<HTMLInputElement>(null);

  const setDate = (value: IncidentDateFilter) => {
    if (value === "custom") {
      updateFilters({ date: value, page: 1 });
      // After the dropdown has handed focus back to its trigger, move it on to
      // the first date input — the prototype's behaviour, and the next thing
      // the operator has to do.
      requestAnimationFrame(() => fromInputRef.current?.focus());
    } else {
      // Leaving Custom forgets the window, as the prototype's inputs did.
      setDraftFrom("");
      setDraftTo("");
      updateFilters({ date: value, from: "", to: "", page: 1 });
    }
  };

  const customRangeInvalid = Boolean(draftFrom && draftTo && draftFrom > draftTo);

  const applyCustomRange = () => {
    if (customRangeInvalid) return;
    updateFilters({ from: draftFrom, to: draftTo, page: 1 });
  };

  const resetCustomRange = () => {
    setDraftFrom("");
    setDraftTo("");
    updateFilters({ date: "all", from: "", to: "", page: 1 });
  };

  const params = useMemo(() => ({ ...filters, scope }), [filters, scope]);

  const list = useIncidentList(params);
  const summary = useIncidentSummary(scope);

  const rows = list.data?.items ?? [];
  const pagination = list.data?.pagination;

  /*
   * A decision elsewhere can shrink the queue under the page being viewed —
   * verify the last row on page 3 and page 3 no longer exists. Step back to the
   * last real page rather than showing an empty table with a footer that says
   * there are rows. In an effect now that the page is in the URL: a router
   * navigation cannot be made during render.
   */
  const lastPage = pagination && pagination.total > 0 ? pagination.totalPages : null;
  useEffect(() => {
    if (lastPage !== null && page > lastPage) updateFilters({ page: lastPage });
  }, [lastPage, page, updateFilters]);

  /**
   * Opening a row remembers which queue it came from — with its filters — so
   * Back returns to the same view (review Q17).
   */
  const openIncident = (incident: IncidentListItem) => {
    const queuePath = scope === "assigned" ? "/incidents/assigned" : "/incidents";
    const query = searchParams.toString();
    navigate(`/incidents/${incident.id}`, {
      state: { from: query ? `${queuePath}?${query}` : queuePath },
    });
  };

  const columns: Column<IncidentListItem>[] = [
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
            {incident.urgent ? <UrgentBadge /> : null}
            {incident.slaBreached ? <SlaBadge /> : null}
          </div>
          <span
            className="sub"
            style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 3, display: "block" }}
          >
            {incident.caseRef}
          </span>
        </>
      ),
    },
    {
      key: "category",
      header: "Category",
      width: showAssignee ? "13%" : "14%",
      render: (incident) => CATEGORY_LABELS[incident.category] ?? incident.category,
    },
    {
      key: "location",
      header: "Location",
      width: showAssignee ? "13%" : "16%",
      cellClassName: "cell-truncate",
      render: (incident) =>
        incident.location ? (
          <span title={incident.location}>{incident.location}</span>
        ) : (
          <span style={{ color: "var(--muted)" }}>Not given</span>
        ),
    },
    {
      key: "status",
      header: "Status",
      width: showAssignee ? "12%" : "14%",
      render: (incident) => (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 4 }}>
          <IncidentStatusBadge status={incident.status} moderationState={incident.moderationState} />
          <ModerationChip moderationState={incident.moderationState} />
        </div>
      ),
    },
    ...(showAssignee
      ? [
          {
            key: "assignee",
            header: "Assigned To",
            width: "15%",
            cellClassName: "cell-truncate",
            render: (incident: IncidentListItem) =>
              incident.assignee ? (
                <>
                  <div style={{ fontSize: 13, color: "var(--text)" }} title={incident.assignee.name}>
                    {incident.assignee.name}
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>
                    {incident.assignee.roleLabel}
                  </div>
                </>
              ) : (
                <span style={{ color: "var(--muted)", fontStyle: "italic" }}>Unassigned</span>
              ),
          },
        ]
      : []),
    {
      key: "submitted",
      header: "Submitted At",
      width: showAssignee ? "11%" : "13%",
      render: (incident) => (
        <div style={{ fontSize: 12.5 }}>
          <div>{formatDate(incident.submittedAt)}</div>
          <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>
            {formatTime(incident.submittedAt)}
          </div>
        </div>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      width: showAssignee ? "8%" : "9%",
      align: "right",
      render: (incident) => (
        <button
          type="button"
          className="action-icon-btn"
          aria-label={`View & manage incident case ${incident.caseRef}`}
          title="View & Manage Incident Case"
          onClick={(e) => {
            // The row is clickable too; without this the handler fires twice.
            e.stopPropagation();
            openIncident(incident);
          }}
        >
          <Icon name="eye" />
        </button>
      ),
    },
  ];

  const counts = summary.data;

  return (
    <>
      <Tabs
        label="Filter incidents by status"
        items={INCIDENT_STATUS_TABS.map((value) => ({
          value,
          label: INCIDENT_STATUS_TAB_LABELS[value],
          ...(counts ? { count: counts[value] } : {}),
        }))}
        value={status}
        onChange={setStatus}
      />

      <div className="filters">
        <div style={{ display: "flex", gap: 10, flex: 1, alignItems: "center", flexWrap: "wrap" }}>
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search by ID, title, location…"
            label="Search incidents"
            style={{ maxWidth: 320, flex: 1, minWidth: 220, margin: 0 }}
          />
          <Select
            label="Filter by category"
            value={category}
            options={CATEGORY_OPTIONS}
            onChange={setCategory}
            minWidth={170}
          />
          <Select
            label="Filter by date submitted"
            value={date}
            options={DATE_OPTIONS}
            onChange={setDate}
            minWidth={150}
          />

          {date === "custom" ? (
            <div
              role="group"
              aria-label="Custom date range"
              style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}
            >
              <label style={{ display: "flex", alignItems: "center", gap: 6, margin: 0 }}>
                <span style={DATE_LABEL_STYLE}>From:</span>
                <input
                  ref={fromInputRef}
                  type="date"
                  className="select"
                  value={draftFrom}
                  max={draftTo || undefined}
                  style={DATE_INPUT_STYLE}
                  onChange={(e) => setDraftFrom(e.target.value)}
                />
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6, margin: 0 }}>
                <span style={DATE_LABEL_STYLE}>To:</span>
                <input
                  type="date"
                  className="select"
                  value={draftTo}
                  min={draftFrom || undefined}
                  style={DATE_INPUT_STYLE}
                  onChange={(e) => setDraftTo(e.target.value)}
                />
              </label>
              <button
                type="button"
                className="btn primary"
                style={DATE_BUTTON_STYLE}
                disabled={customRangeInvalid}
                title={customRangeInvalid ? "The From date is after the To date." : "Apply this date range"}
                onClick={applyCustomRange}
              >
                Apply
              </button>
              <button
                type="button"
                className="btn outline"
                style={{ ...DATE_BUTTON_STYLE, padding: "7px 12px" }}
                onClick={resetCustomRange}
              >
                Reset
              </button>
            </div>
          ) : null}
        </div>

        <Select
          label="Sort order"
          value={sort}
          options={SORT_OPTIONS}
          onChange={setSort}
          minWidth={150}
        />
      </div>

      {scope === "all" && role === "advocate" ? (
        <p className="readonly-hint" style={{ margin: "0 0 10px" }}>
          Advocates see only the incidents assigned to them, so this list matches My Assigned Cases.
        </p>
      ) : null}

      <DataTable
        caption={scope === "assigned" ? "Incidents assigned to you" : "Reported incidents"}
        columns={columns}
        rows={rows}
        rowKey={(incident) => incident.id}
        minWidth="960px"
        loading={list.isLoading}
        error={list.isError ? errorMessage(list.error) : null}
        onRetry={() => void list.refetch()}
        skeletonRows={limit > 10 ? 10 : limit}
        emptyMessage={emptyMessage}
        onRowClick={openIncident}
      />

      {pagination && pagination.total > 0 ? (
        <Pagination
          page={page}
          pageSize={limit}
          total={pagination.total}
          pageSizeOptions={INCIDENT_PAGE_SIZES}
          onPageChange={setPage}
          onPageSizeChange={setLimit}
          itemLabel="incidents"
        />
      ) : null}
    </>
  );
}

function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : "Could not load the incident queue.";
}

export default IncidentsTable;
