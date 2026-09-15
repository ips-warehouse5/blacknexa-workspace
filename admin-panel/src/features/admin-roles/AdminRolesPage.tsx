/**
 * Admin & Staff Roles.
 *
 * The directory of operator accounts, wired to the API. Three rules from the
 * design are enforced here and again on the server:
 *
 *   • Only a Super Admin sees Super Admin accounts at all.
 *   • Super Admin accounts cannot be edited, disabled or deleted from this
 *     screen — they show as "Protected". That is what stops the last
 *     administrator locking everyone out by mistake.
 *   • Anyone else reaching this screen sees it read-only.
 */

import { useEffect, useMemo, useState } from "react";

import { useToast } from "@/app/providers/ToastProvider";
import { Can, useDeniedReason } from "@/components/rbac/Can";
import { Badge, RoleBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { SearchInput } from "@/components/ui/Fields";
import { Icon } from "@/components/ui/Icon";
import { Card, KpiCard, KpiGrid, PageHeader } from "@/components/ui/Page";
import { Pagination } from "@/components/ui/Pagination";
import { Select } from "@/components/ui/Select";
import env from "@/config/env";
import { PasswordResetDialog } from "@/features/admin-roles/components/PasswordResetDialog";
import { StaffFormDialog } from "@/features/admin-roles/components/StaffFormDialog";
import {
  useCreateStaff,
  useResetStaffPassword,
  useSetStaffActive,
  useStaffList,
  useStaffSummary,
  useUpdateStaff,
} from "@/features/admin-roles/staff.hooks";
import type {
  StaffMember,
  StaffRoleFilter,
  StaffStatusFilter,
} from "@/features/admin-roles/staff.types";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { ROLE_LIST } from "@/lib/rbac";
import { useAuthStore } from "@/stores/auth.store";
import { ApiError } from "@/types/api";
import { ROLE_LABELS, type RoleKey } from "@/types/rbac";

const ROLE_FILTER_OPTIONS: { value: StaffRoleFilter; label: string }[] = [
  { value: "all", label: "All Roles" },
  ...ROLE_LIST.map((r) => ({ value: r.key as StaffRoleFilter, label: r.label })),
];

const STATUS_FILTER_OPTIONS: { value: StaffStatusFilter; label: string }[] = [
  { value: "all", label: "All Statuses" },
  { value: "active", label: "Active" },
  { value: "disabled", label: "Disabled" },
];

/** Which dialog, if any, is open. One value beats four booleans that can lie. */
type DialogState =
  | { kind: "none" }
  | { kind: "form"; staff: StaffMember | null }
  | { kind: "toggle"; staff: StaffMember }
  | { kind: "reset"; staff: StaffMember }
  | { kind: "resetResult"; staff: StaffMember; password: string };

export function AdminRolesPage() {
  const toast = useToast();
  const currentAdmin = useAuthStore((s) => s.admin);
  const isSuperAdmin = currentAdmin?.role === "superadmin";

  const [page, setPage] = useState(1);
  const [limit, setLimitState] = useState(10);
  const [search, setSearchState] = useState("");
  const [role, setRoleState] = useState<StaffRoleFilter>("all");
  const [status, setStatusState] = useState<StaffStatusFilter>("all");
  const [dialog, setDialog] = useState<DialogState>({ kind: "none" });

  // Typing should not fire a request per keystroke.
  const debouncedSearch = useDebouncedValue(search, 300);

  /*
   * Every filter returns to page one, because page 7 of an unfiltered list is
   * rarely page 7 of a filtered one. Done in the setters rather than an effect
   * watching the filters: the reset belongs to the interaction that caused it,
   * and doing it here means the request is made once with the right page
   * instead of once with the stale one and again after a correcting render.
   */
  const setSearch = (value: string) => {
    setSearchState(value);
    setPage(1);
  };
  const setRole = (value: StaffRoleFilter) => {
    setRoleState(value);
    setPage(1);
  };
  const setStatus = (value: StaffStatusFilter) => {
    setStatusState(value);
    setPage(1);
  };
  const setLimit = (value: number) => {
    setLimitState(value);
    setPage(1);
  };

  const params = useMemo(
    () => ({ page, limit, search: debouncedSearch, role, status }),
    [page, limit, debouncedSearch, role, status],
  );

  const list = useStaffList(params);
  const summary = useStaffSummary();

  const createStaff = useCreateStaff();
  const updateStaff = useUpdateStaff();
  const setActive = useSetStaffActive();
  const resetPassword = useResetStaffPassword();

  const createDenied = useDeniedReason("staff.create");

  useEffect(() => {
    document.title = `Admin & Roles · ${env.appName} Admin`;
  }, []);

  const rows = list.data?.items ?? [];
  const pagination = list.data?.pagination;

  /**
   * Whether this row can be acted on.
   *
   * Super Admin rows are protected for everyone, including other Super Admins:
   * the design shows them as locked, and a console that lets one administrator
   * disable another has no floor under it.
   */
  const canManage = (member: StaffMember) => isSuperAdmin && member.role !== "superadmin";

  const columns: Column<StaffMember>[] = [
    {
      key: "member",
      header: "Staff Member",
      width: "28%",
      render: (member) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: 13.5, color: "var(--text)" }}>
            {member.name}
            {member.id === currentAdmin?.id ? (
              <span style={{ fontSize: 10.5, color: "var(--accent)", fontWeight: 600 }}>
                {" "}
                (You)
              </span>
            ) : null}
          </div>
          <div className="sub" style={{ fontSize: 11, color: "var(--muted)" }}>
            ID: {member.id}
          </div>
        </div>
      ),
    },
    {
      key: "email",
      header: "Email Address",
      width: "30%",
      cellClassName: "cell-truncate",
      render: (member) => (
        <span style={{ fontSize: 13, color: "var(--text)" }}>{member.email}</span>
      ),
    },
    {
      key: "role",
      header: "Assigned Role",
      width: "16%",
      render: (member) => <RoleBadge role={member.role}>{ROLE_LABELS[member.role]}</RoleBadge>,
    },
    {
      key: "lastLogin",
      header: "Last Sign-in",
      width: "14%",
      render: (member) => (
        <span style={{ fontSize: 12, color: "var(--muted)" }}>
          {member.lastLoginAt ? formatDateTime(member.lastLoginAt) : "Never"}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      width: "10%",
      render: (member) => (
        <Badge tone={member.isActive ? "active" : "suspended"}>
          {member.isActive ? "Active" : "Disabled"}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      width: "12%",
      align: "right",
      render: (member) => {
        if (member.role === "superadmin") {
          return (
            <span className="protected-chip">
              <Icon name="lock" /> Protected
            </span>
          );
        }
        if (!canManage(member)) {
          return <span style={{ fontSize: 12, color: "var(--muted)" }}>View Only</span>;
        }
        return (
          <div style={{ display: "inline-flex", gap: 6, justifyContent: "flex-end" }}>
            <button
              type="button"
              className="action-icon-btn"
              title={`Edit ${member.name}`}
              aria-label={`Edit ${member.name}`}
              onClick={() => setDialog({ kind: "form", staff: member })}
            >
              <Icon name="edit" />
            </button>
            <button
              type="button"
              className="action-icon-btn"
              title={`Reset password for ${member.name}`}
              aria-label={`Reset password for ${member.name}`}
              onClick={() => setDialog({ kind: "reset", staff: member })}
            >
              <Icon name="key" />
            </button>
            <button
              type="button"
              className={`action-icon-btn${member.isActive ? " delete-icon-btn" : ""}`}
              title={member.isActive ? `Disable ${member.name}` : `Enable ${member.name}`}
              aria-label={member.isActive ? `Disable ${member.name}` : `Enable ${member.name}`}
              onClick={() => setDialog({ kind: "toggle", staff: member })}
            >
              <Icon name="disable" />
            </button>
          </div>
        );
      },
    },
  ];

  const onSubmitForm = async (values: {
    name: string;
    email: string;
    role: RoleKey;
    password?: string;
  }) => {
    const editing = dialog.kind === "form" ? dialog.staff : null;
    try {
      if (editing) {
        await updateStaff.mutateAsync({
          id: editing.id,
          input: { name: values.name, role: values.role },
        });
      } else {
        await createStaff.mutateAsync({
          name: values.name,
          email: values.email,
          role: values.role,
          password: values.password ?? "",
        });
      }
      setDialog({ kind: "none" });
    } catch {
      // The hook has already shown the failure; the dialog stays open so the
      // operator can correct the input rather than retype it from scratch.
    }
  };

  const onConfirmReset = async () => {
    if (dialog.kind !== "reset") return;
    const target = dialog.staff;
    try {
      const { temporaryPassword } = await resetPassword.mutateAsync(target.id);
      setDialog({ kind: "resetResult", staff: target, password: temporaryPassword });
    } catch {
      setDialog({ kind: "none" });
    }
  };

  const onConfirmToggle = async () => {
    if (dialog.kind !== "toggle") return;
    try {
      await setActive.mutateAsync({ id: dialog.staff.id, isActive: !dialog.staff.isActive });
    } finally {
      setDialog({ kind: "none" });
    }
  };

  return (
    <>
      <Card>
        <PageHeader
          title="Admin & Staff Roles"
          description="Manage administrator accounts, assign role-based access, reset credentials, and control console access."
          actions={
            <Can perform="staff.create">
              <Button
                variant="primary"
                className="add-keyword-btn"
                icon={<Icon name="plus" />}
                {...(createDenied ? { deniedReason: createDenied } : {})}
                onClick={() => setDialog({ kind: "form", staff: null })}
              >
                Add
              </Button>
            </Can>
          }
        />

        {/* The Super Admin tile is only meaningful to a Super Admin — everyone
            else cannot see those accounts, so a count of them would be a
            number with no rows behind it. */}
        <KpiGrid columns={isSuperAdmin ? 4 : 3} style={{ marginBottom: 20 }}>
          {ROLE_LIST.filter((r) => isSuperAdmin || r.key !== "superadmin").map((r) => (
            <KpiCard
              key={r.key}
              compact
              label={`${r.label}s`}
              tag={<RoleBadge role={r.key}>{r.tagline}</RoleBadge>}
              value={summary.isLoading ? "—" : (summary.data?.[r.key] ?? 0)}
            />
          ))}
        </KpiGrid>

        <div
          className="filters"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
            marginBottom: 8,
          }}
        >
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search staff by name or email…"
            label="Search staff"
            style={{ flex: 1, maxWidth: 440, minWidth: 260, margin: 0 }}
          />

          <Select
            label="Filter by role"
            value={role}
            options={ROLE_FILTER_OPTIONS}
            onChange={setRole}
            minWidth={160}
          />

          <Select
            label="Filter by status"
            value={status}
            options={STATUS_FILTER_OPTIONS}
            onChange={setStatus}
            minWidth={150}
          />
        </div>

        <DataTable
          caption="Administrator and staff accounts"
          columns={columns}
          rows={rows}
          rowKey={(member) => member.id}
          loading={list.isLoading}
          error={list.isError ? errorMessage(list.error) : null}
          onRetry={() => void list.refetch()}
          skeletonRows={limit > 10 ? 10 : limit}
          emptyMessage="No staff accounts match the selected filters."
        />

        {pagination && pagination.total > 0 ? (
          <Pagination
            page={page}
            pageSize={limit}
            total={pagination.total}
            onPageChange={setPage}
            onPageSizeChange={setLimit}
            itemLabel="staff accounts"
          />
        ) : null}
      </Card>

      <StaffFormDialog
        open={dialog.kind === "form"}
        staff={dialog.kind === "form" ? dialog.staff : null}
        busy={createStaff.isPending || updateStaff.isPending}
        onClose={() => setDialog({ kind: "none" })}
        onSubmit={(values) => void onSubmitForm(values)}
      />

      <ConfirmDialog
        open={dialog.kind === "reset"}
        title="Reset Password"
        description={
          dialog.kind === "reset"
            ? `A new temporary password will be generated for ${dialog.staff.email}. Their current password stops working immediately.`
            : ""
        }
        confirmLabel="Reset Password"
        busy={resetPassword.isPending}
        onConfirm={() => void onConfirmReset()}
        onCancel={() => setDialog({ kind: "none" })}
      />

      <PasswordResetDialog
        open={dialog.kind === "resetResult"}
        staff={dialog.kind === "resetResult" ? dialog.staff : null}
        temporaryPassword={dialog.kind === "resetResult" ? dialog.password : null}
        onClose={() => {
          setDialog({ kind: "none" });
          toast.success("Password reset", "Share the temporary password securely.");
        }}
      />

      <ConfirmDialog
        open={dialog.kind === "toggle"}
        title={
          dialog.kind === "toggle" && dialog.staff.isActive
            ? "Disable Account"
            : "Enable Account"
        }
        description={
          dialog.kind !== "toggle"
            ? ""
            : dialog.staff.isActive
              ? `${dialog.staff.name} will be signed out and will no longer be able to access the console. The account is kept and can be re-enabled.`
              : `${dialog.staff.name} will be able to sign in to the console again.`
        }
        confirmLabel={
          dialog.kind === "toggle" && dialog.staff.isActive ? "Disable Account" : "Enable Account"
        }
        destructive={dialog.kind === "toggle" && dialog.staff.isActive}
        busy={setActive.isPending}
        onConfirm={() => void onConfirmToggle()}
        onCancel={() => setDialog({ kind: "none" })}
      />
    </>
  );
}

/** A date the API sent, in the console's display format. */
function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : "Could not load the staff directory.";
}

export default AdminRolesPage;
