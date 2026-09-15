/**
 * User Management — the end-user directory.
 *
 * The one screen with bulk actions, which is why selection is tracked here
 * rather than inside the table. Two details that matter:
 *
 *   • Selection is scoped to the current page. Selecting rows, changing a
 *     filter, and then hitting "suspend" must not act on rows the operator can
 *     no longer see — so the set is cleared whenever the result set changes.
 *   • The header checkbox is indeterminate when only some rows are selected,
 *     because a plain unchecked box would claim the page is unselected.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useToast } from "@/app/providers/ToastProvider";
import { Can, useDeniedReason } from "@/components/rbac/Can";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { SearchInput } from "@/components/ui/Fields";
import { Icon } from "@/components/ui/Icon";
import { Card, PageHeader, Tabs } from "@/components/ui/Page";
import { Pagination } from "@/components/ui/Pagination";
import { Select } from "@/components/ui/Select";
import env from "@/config/env";
import { FixtureNotice } from "@/features/misc/FixtureNotice";
import { useLocalTable } from "@/hooks/useLocalTable";
import { appUsers } from "@/mocks/appUsers";
import type { AppUser, AppUserStatus } from "@/mocks/types";

const STATUS_TONES: Record<AppUserStatus, BadgeTone> = {
  active: "active",
  suspended: "suspended",
  deleted: "deleted",
};

const STATUS_OPTIONS = [
  { value: "All", label: "All Statuses" },
  { value: "active", label: "Active" },
  { value: "suspended", label: "Suspended" },
  { value: "deleted", label: "Deleted" },
];

const SORT_OPTIONS = [
  { value: "newest" as const, label: "Newest First" },
  { value: "oldest" as const, label: "Oldest First" },
];

type UserTab = "All Users" | "Active" | "Advocates" | "Moderators" | "Suspended / Banned";

/** Whether a user belongs under a tab. */
function matchesTab(user: AppUser, tab: UserTab): boolean {
  switch (tab) {
    case "Active":
      return user.status === "active";
    case "Advocates":
      return user.role === "advocate";
    case "Moderators":
      return user.role === "moderator";
    case "Suspended / Banned":
      return user.status === "suspended";
    default:
      return true;
  }
}

const TABS: UserTab[] = [
  "All Users",
  "Active",
  "Advocates",
  "Moderators",
  "Suspended / Banned",
];

/** Human-readable region, from the fixture's snake_case value. */
function humanise(value: string): string {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function UsersPage() {
  const navigate = useNavigate();
  const toast = useToast();

  const [tab, setTabState] = useState<UserTab>("All Users");
  const [status, setStatusState] = useState("All");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<"suspend" | "delete" | null>(null);

  const headerCheckbox = useRef<HTMLInputElement>(null);
  const bulkDenied = useDeniedReason("users.bulk");

  useEffect(() => {
    document.title = `Users · ${env.appName} Admin`;
  }, []);

  const rows = useMemo(
    () => (sort === "oldest" ? [...appUsers].reverse() : appUsers),
    [sort],
  );

  const filters = useMemo(
    () => [
      (user: AppUser) => matchesTab(user, tab),
      (user: AppUser) => status === "All" || user.status === status,
    ],
    [tab, status],
  );

  const table = useLocalTable<AppUser>({
    rows,
    searchFields: useMemo(
      () => (user: AppUser) => [user.display_name, user.email, user.id],
      [],
    ),
    filters,
  });

  /*
   * Anything that changes which rows are on screen also clears the selection.
   *
   * This is correctness, not tidiness: without it an operator can tick three
   * rows, change the filter so those rows are no longer visible, and then press
   * "Suspend" — acting on accounts they can no longer see. Wrapping the setters
   * ties the clear to the interaction that caused it, so no combination of
   * filter changes can leave a selection behind.
   */
  const clearSelection = () => setSelected(new Set());

  const setTab = (value: UserTab) => {
    setTabState(value);
    clearSelection();
  };
  const setStatus = (value: string) => {
    setStatusState(value);
    clearSelection();
  };
  const setSearch = (value: string) => {
    table.setSearch(value);
    clearSelection();
  };
  const setPage = (value: number) => {
    table.setPage(value);
    clearSelection();
  };
  const setPageSize = (value: number) => {
    table.setPageSize(value);
    clearSelection();
  };

  const pageIds = table.pageRows.map((user) => user.id);
  const selectedOnPage = pageIds.filter((id) => selected.has(id));
  const allSelected = pageIds.length > 0 && selectedOnPage.length === pageIds.length;
  const someSelected = selectedOnPage.length > 0 && !allSelected;

  // `indeterminate` is a DOM property with no HTML attribute, so it has to be
  // set imperatively.
  useEffect(() => {
    if (headerCheckbox.current) headerCheckbox.current.indeterminate = someSelected;
  }, [someSelected]);

  const toggleRow = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(pageIds));

  const runBulk = () => {
    const count = selected.size;
    toast.success(
      bulkAction === "suspend" ? "Users suspended" : "Users deleted",
      `${count} ${count === 1 ? "account" : "accounts"} updated.`,
    );
    setSelected(new Set());
    setBulkAction(null);
  };

  const columns: Column<AppUser>[] = [
    {
      key: "select",
      header: (
        <>
          <input
            ref={headerCheckbox}
            type="checkbox"
            checked={allSelected}
            onChange={toggleAll}
            aria-label="Select all users on this page"
          />
        </>
      ),
      width: "4%",
      align: "center",
      render: (user) => (
        <input
          type="checkbox"
          checked={selected.has(user.id)}
          onChange={() => toggleRow(user.id)}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Select ${user.display_name}`}
        />
      ),
    },
    {
      key: "name",
      header: "User Name & ID",
      width: "24%",
      render: (user) => (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div className="user-avatar-badge" aria-hidden="true">
            {user.display_name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 13.5, color: "var(--text)" }}>
              {user.display_name}
            </div>
            <span className="sub">{user.id}</span>
          </div>
        </div>
      ),
    },
    {
      key: "email",
      header: "Email Address",
      width: "24%",
      cellClassName: "cell-truncate",
      render: (user) => user.email,
    },
    {
      key: "role",
      header: "Role",
      width: "11%",
      render: (user) => <span className={`role-pill ${user.role}`}>{humanise(user.role)}</span>,
    },
    {
      key: "status",
      header: "Status",
      width: "10%",
      render: (user) => (
        <Badge tone={STATUS_TONES[user.status]}>{humanise(user.status)}</Badge>
      ),
    },
    {
      key: "incidents",
      header: "Incidents",
      width: "9%",
      render: (user) => user.incidents.length,
    },
    {
      key: "joined",
      header: "Joined",
      width: "11%",
      render: (user) => (
        <span style={{ fontSize: 12.5 }}>{user.created_at.split(/ {2}/)[0]}</span>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      width: "7%",
      align: "right",
      render: (user) => (
        <button
          type="button"
          className="action-icon-btn"
          aria-label={`Open ${user.display_name}`}
          title="Open profile"
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/users/${user.id}`);
          }}
        >
          <Icon name="eye" />
        </button>
      ),
    },
  ];

  return (
    <Card>
      <PageHeader
        title="User Management"
        description="Review member accounts, community roles, incident history, and enforcement status."
      />

      <FixtureNotice module="User management" />

      <Tabs
        label="Filter users"
        items={TABS.map((value) => ({
          value,
          label: value,
          count: appUsers.filter((user) => matchesTab(user, value)).length,
        }))}
        value={tab}
        onChange={setTab}
      />

      <div className="filters">
        <SearchInput
          value={table.search}
          onChange={setSearch}
          placeholder="Search by name, email, or user ID…"
          label="Search users"
        />
        <Select
          label="Filter by status"
          value={status}
          options={STATUS_OPTIONS}
          onChange={setStatus}
          minWidth={160}
        />
        <Select
          label="Sort order"
          value={sort}
          options={SORT_OPTIONS}
          onChange={setSort}
          minWidth={150}
        />
      </div>

      {selected.size > 0 ? (
        <Can perform="users.bulk">
          <div className="bulk-bar" style={{ display: "flex" }}>
            <span>
              <strong>{selected.size}</strong> {selected.size === 1 ? "user" : "users"} selected
            </span>
            <div className="bulk-actions">
              <Button
                variant="outline"
                {...(bulkDenied ? { deniedReason: bulkDenied } : {})}
                onClick={() => setBulkAction("suspend")}
              >
                Suspend
              </Button>
              <Button
                variant="danger"
                {...(bulkDenied ? { deniedReason: bulkDenied } : {})}
                onClick={() => setBulkAction("delete")}
              >
                Delete
              </Button>
              <Button variant="outline" onClick={clearSelection}>
                Clear
              </Button>
            </div>
          </div>
        </Can>
      ) : null}

      <DataTable
        caption="Member accounts"
        columns={columns}
        rows={table.pageRows}
        rowKey={(user) => user.id}
        minWidth="1000px"
        emptyMessage="No users match the selected filters."
        onRowClick={(user) => navigate(`/users/${user.id}`)}
      />

      {table.total > 0 ? (
        <Pagination
          page={table.page}
          pageSize={table.pageSize}
          total={table.total}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          itemLabel="users"
        />
      ) : null}

      <ConfirmDialog
        open={bulkAction !== null}
        title={bulkAction === "suspend" ? "Suspend selected users" : "Delete selected users"}
        description={
          bulkAction === "suspend"
            ? `${selected.size} ${selected.size === 1 ? "account" : "accounts"} will be suspended. They will be signed out and unable to post until reinstated.`
            : `${selected.size} ${selected.size === 1 ? "account" : "accounts"} will be scheduled for deletion. Their incident reports are retained but anonymised.`
        }
        confirmLabel={bulkAction === "suspend" ? "Suspend" : "Delete"}
        destructive
        onConfirm={runBulk}
        onCancel={() => setBulkAction(null)}
      />
    </Card>
  );
}

export default UsersPage;
