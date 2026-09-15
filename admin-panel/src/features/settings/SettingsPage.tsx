/**
 * Settings — incident categories, the role matrix, security policy, audit log.
 *
 * The roles tab is deliberately read-only. The brief asks for four fixed roles
 * rather than a permission-authoring system, and this screen shows what each
 * role can do so an administrator can answer "why can't they see that?" without
 * reading the source. Making the matrix editable would turn a static model into
 * a dynamic one through the back door — and the API enforces the static one, so
 * edits here would be a lie.
 */

import { useEffect, useMemo, useState } from "react";

import { useToast } from "@/app/providers/ToastProvider";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { SearchInput, Switch, TextField } from "@/components/ui/Fields";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { Card, PageHeader, Tabs } from "@/components/ui/Page";
import { Pagination } from "@/components/ui/Pagination";
import env from "@/config/env";
import { FixtureNotice } from "@/features/misc/FixtureNotice";
import { auditEntries, securityPolicy } from "@/features/settings/settings.fixtures";
import { useLocalTable } from "@/hooks/useLocalTable";
import { ROLE_LIST, roleCan } from "@/lib/rbac";
import { incidentCategories as seedCategories } from "@/mocks/incidentCategories";
import type { IncidentCategory } from "@/mocks/types";
import { PERMISSIONS, type Permission } from "@/types/rbac";

type SettingsTab = "incidents" | "roles" | "security" | "audit";

/** Plain-English label for each permission key. */
const PERMISSION_LABELS: Record<Permission, string> = {
  "users.view": "View user profiles",
  "users.edit": "Edit user profiles",
  "users.role": "Change a user's community role",
  "users.suspend": "Suspend and reinstate users",
  "users.delete": "Delete user accounts",
  "users.bulk": "Bulk user actions",
  "incidents.view": "View incidents",
  "incidents.verify": "Verify incidents",
  "incidents.dismiss": "Dismiss incidents",
  "incidents.notes": "Add case notes",
  "incidents.assign": "Assign and reassign cases",
  "incidents.deactivate": "Deactivate incidents",
  "moderation.view": "View the moderation queue",
  "moderation.decide": "Approve and reject content",
  "moderation.ban": "Ban users from moderation",
  "moderation.keywords": "Manage keyword rules",
  "staff.view": "View staff accounts",
  "staff.create": "Create staff accounts",
  "staff.edit": "Edit staff accounts",
  "staff.role": "Change staff roles",
  "staff.reset": "Reset staff passwords",
  "staff.toggle": "Enable and disable staff accounts",
  "staff.delete": "Delete staff accounts",
  "audit.view": "View the audit log",
};

export function SettingsPage() {
  const toast = useToast();
  const [tab, setTab] = useState<SettingsTab>("incidents");

  useEffect(() => {
    document.title = `Settings · ${env.appName} Admin`;
  }, []);

  return (
    <Card className="cm-page">
      <PageHeader
        title="Settings"
        description="Platform configuration: incident taxonomy, role permissions, security policy, and the audit trail."
      />

      <FixtureNotice module="Settings" />

      <Tabs
        variant="section"
        label="Settings sections"
        items={[
          { value: "incidents" as const, label: "Incident Categories" },
          { value: "roles" as const, label: "Roles & Permissions" },
          { value: "security" as const, label: "Security" },
          { value: "audit" as const, label: "Audit Log" },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === "incidents" ? <CategoriesPanel toast={toast} /> : null}
      {tab === "roles" ? <RolesPanel /> : null}
      {tab === "security" ? <SecurityPanel toast={toast} /> : null}
      {tab === "audit" ? <AuditPanel /> : null}
    </Card>
  );
}

// ── Incident categories ─────────────────────────────────────────────────────

function CategoriesPanel({ toast }: { toast: ReturnType<typeof useToast> }) {
  const [categories, setCategories] = useState<IncidentCategory[]>(seedCategories);
  const [editing, setEditing] = useState<IncidentCategory | null>(null);
  const [deleting, setDeleting] = useState<IncidentCategory | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftActive, setDraftActive] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const table = useLocalTable<IncidentCategory>({
    rows: categories,
    searchFields: useMemo(() => (c: IncidentCategory) => [c.name, c.id], []),
  });

  const save = () => {
    const name = draftName.trim();
    if (name.length < 2) {
      setError("Enter a category name.");
      return;
    }
    if (
      categories.some(
        (c) => c.name.toLowerCase() === name.toLowerCase() && c.id !== editing?.id,
      )
    ) {
      setError("That category already exists.");
      return;
    }

    const status = draftActive ? "active" : "inactive";
    if (editing?.id) {
      setCategories((current) =>
        current.map((c) => (c.id === editing.id ? { ...c, name, status } : c)),
      );
      toast.success("Category updated", `${name} has been saved.`);
    } else {
      setCategories((current) => [
        ...current,
        { id: `ICT-${String(current.length + 1).padStart(3, "0")}`, name, status },
      ]);
      toast.success("Category created", `${name} can now be assigned to incidents.`);
    }
    setEditing(null);
  };

  const columns: Column<IncidentCategory>[] = [
    {
      key: "name",
      header: "Category",
      width: "50%",
      render: (category) => (
        <>
          <div style={{ fontWeight: 600, fontSize: 13.5, color: "var(--text)" }}>
            {category.name}
          </div>
          <span className="sub">{category.id}</span>
        </>
      ),
    },
    {
      key: "status",
      header: "Status",
      width: "28%",
      render: (category) => (
        <Badge tone={category.status === "active" ? "active" : "draft"}>
          {category.status === "active" ? "Active" : "Inactive"}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      width: "22%",
      align: "right",
      render: (category) => (
        <div style={{ display: "inline-flex", gap: 6, justifyContent: "flex-end" }}>
          <button
            type="button"
            className="action-icon-btn"
            aria-label={`Edit ${category.name}`}
            title="Edit"
            onClick={() => {
              setEditing(category);
              setDraftName(category.name);
              setDraftActive(category.status === "active");
              setError(null);
            }}
          >
            <Icon name="edit" />
          </button>
          <button
            type="button"
            className="action-icon-btn delete-icon-btn"
            aria-label={`Delete ${category.name}`}
            title="Delete"
            onClick={() => setDeleting(category)}
          >
            <Icon name="disable" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="settings-panel">
      <div className="settings-panel-head">
        <div>
          <h2 className="settings-panel-title">Incident Categories</h2>
          <p className="settings-panel-sub">
            The categories members choose when reporting. Inactive ones stay on existing
            incidents but cannot be picked for new reports.
          </p>
        </div>
        <Button
          variant="primary"
          className="add-keyword-btn"
          icon={<Icon name="plus" />}
          onClick={() => {
            setEditing({ id: "", name: "", status: "active" });
            setDraftName("");
            setDraftActive(true);
            setError(null);
          }}
        >
          Add Category
        </Button>
      </div>

      <div className="filters">
        <SearchInput
          value={table.search}
          onChange={table.setSearch}
          placeholder="Search categories…"
          label="Search incident categories"
        />
      </div>

      <DataTable
        caption="Incident categories"
        columns={columns}
        rows={table.pageRows}
        rowKey={(category) => category.id}
        minWidth="620px"
        emptyMessage="No categories match your search."
      />

      {table.total > 0 ? (
        <Pagination
          page={table.page}
          pageSize={table.pageSize}
          total={table.total}
          onPageChange={table.setPage}
          onPageSizeChange={table.setPageSize}
          itemLabel="categories"
        />
      ) : null}

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.id ? "Edit Category" : "Add Category"}
        dismissOnBackdrop={false}
        footer={
          <>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save}>
              {editing?.id ? "Save Changes" : "Create Category"}
            </Button>
          </>
        }
      >
        <TextField
          label="Category name"
          value={draftName}
          error={error ?? undefined}
          onChange={(e) => {
            setDraftName(e.target.value);
            setError(null);
          }}
        />
        <Switch
          checked={draftActive}
          onChange={setDraftActive}
          label="Active"
          hint="Members can select this category when reporting an incident."
        />
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        title="Delete Category"
        description={
          deleting
            ? `“${deleting.name}” will be removed. Incidents already filed under it keep the label but it cannot be chosen again.`
            : ""
        }
        confirmLabel="Delete Category"
        destructive
        onConfirm={() => {
          if (!deleting) return;
          setCategories((current) => current.filter((c) => c.id !== deleting.id));
          toast.success("Category removed", `${deleting.name} has been deleted.`);
          setDeleting(null);
        }}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

// ── Roles ───────────────────────────────────────────────────────────────────

function RolesPanel() {
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return PERMISSIONS;
    return PERMISSIONS.filter(
      (key) => PERMISSION_LABELS[key].toLowerCase().includes(q) || key.toLowerCase().includes(q),
    );
  }, [query]);

  return (
    <div className="settings-panel">
      <div className="settings-panel-head">
        <div>
          <h2 className="settings-panel-title">Roles & Permissions</h2>
          <p className="settings-panel-sub">
            What each of the four roles can do. This matrix is fixed in the application and
            enforced by the API — it is shown here for reference, not editing.
          </p>
        </div>
      </div>

      <div className="role-summary-grid">
        {ROLE_LIST.map((role) => (
          <div className="role-summary-card" key={role.key}>
            <span className={`role-badge-pill ${role.key}`}>{role.label}</span>
            <p>{role.description}</p>
            <div className="role-summary-count">
              {role.permissions.length} of {PERMISSIONS.length} permissions
            </div>
          </div>
        ))}
      </div>

      <div className="filters">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search permissions…"
          label="Search permissions"
        />
      </div>

      <div style={{ overflowX: "auto", width: "100%" }}>
        <table className="table" style={{ width: "100%", minWidth: "820px" }}>
          <caption className="sr-only">Permissions by role</caption>
          <thead>
            <tr>
              <th scope="col" style={{ width: "40%" }}>
                Permission
              </th>
              {ROLE_LIST.map((role) => (
                <th key={role.key} scope="col" style={{ width: "15%", textAlign: "center" }}>
                  {role.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((key) => (
              <tr key={key}>
                <th scope="row" style={{ textAlign: "left", fontWeight: 400 }}>
                  <strong style={{ fontSize: 13 }}>{PERMISSION_LABELS[key]}</strong>
                  <div className="sub">{key}</div>
                </th>
                {ROLE_LIST.map((role) => {
                  const allowed = roleCan(role.key, key);
                  return (
                    <td key={role.key} style={{ textAlign: "center" }}>
                      {/* The glyph is decorative; the text beside it carries
                          the answer for anyone not reading the symbol. */}
                      <span className={allowed ? "perm-yes" : "perm-no"}>
                        <span aria-hidden="true">{allowed ? "✓" : "—"}</span>
                        <span className="sr-only">
                          {allowed ? "Allowed" : "Not allowed"}
                        </span>
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}

            {visible.length === 0 ? (
              <tr>
                <td colSpan={ROLE_LIST.length + 1}>
                  <div className="empty">No permissions match your search.</div>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Security ────────────────────────────────────────────────────────────────

function SecurityPanel({ toast }: { toast: ReturnType<typeof useToast> }) {
  const [policy, setPolicy] = useState(securityPolicy);
  const [saved, setSaved] = useState(securityPolicy);

  const dirty = JSON.stringify(policy) !== JSON.stringify(saved);

  return (
    <div className="settings-panel">
      <div className="settings-panel-head">
        <div>
          <h2 className="settings-panel-title">Security Policy</h2>
          <p className="settings-panel-sub">
            Sign-in rules for operator accounts. These are enforced by the API; this screen sets
            the values it reads.
          </p>
        </div>
        <Button
          variant="primary"
          disabled={!dirty}
          onClick={() => {
            setSaved(policy);
            toast.success("Security policy saved", "The new rules apply from the next sign-in.");
          }}
        >
          Save Policy
        </Button>
      </div>

      <div className="cm-section-box">
        <div className="cm-section-head">Sign-in</div>

        <div className="form-row-2">
          <TextField
            label="Maximum failed attempts"
            type="number"
            min={3}
            max={10}
            value={policy.maxLoginAttempts}
            hint="Before the account is locked."
            onChange={(e) =>
              setPolicy((p) => ({ ...p, maxLoginAttempts: Number(e.target.value) }))
            }
          />
          <TextField
            label="Lockout duration (minutes)"
            type="number"
            min={5}
            max={120}
            value={policy.lockoutMinutes}
            onChange={(e) =>
              setPolicy((p) => ({ ...p, lockoutMinutes: Number(e.target.value) }))
            }
          />
        </div>

        <div className="form-row-2">
          <TextField
            label="Security code lifetime (minutes)"
            type="number"
            min={1}
            max={30}
            value={policy.mfaTtlMinutes}
            hint="How long an emailed code stays valid."
            onChange={(e) =>
              setPolicy((p) => ({ ...p, mfaTtlMinutes: Number(e.target.value) }))
            }
          />
          <TextField
            label="Session idle timeout (minutes)"
            type="number"
            min={10}
            max={480}
            value={policy.sessionIdleMinutes}
            onChange={(e) =>
              setPolicy((p) => ({ ...p, sessionIdleMinutes: Number(e.target.value) }))
            }
          />
        </div>
      </div>

      <div className="cm-section-box">
        <div className="cm-section-head">Requirements</div>

        <Switch
          checked={policy.requireMfa}
          onChange={(value) => setPolicy((p) => ({ ...p, requireMfa: value }))}
          label="Require two-factor authentication"
          hint="Every operator must confirm an emailed code at sign-in. Turning this off weakens every account."
        />
        <Switch
          checked={policy.forcePasswordChange}
          onChange={(value) => setPolicy((p) => ({ ...p, forcePasswordChange: value }))}
          label="Force a password change on first sign-in"
          hint="Applies to accounts created with a temporary password."
        />
        <Switch
          checked={policy.notifyOnNewDevice}
          onChange={(value) => setPolicy((p) => ({ ...p, notifyOnNewDevice: value }))}
          label="Email on sign-in from a new device"
          hint="Tells an operator when their account is used somewhere unfamiliar."
        />
      </div>
    </div>
  );
}

// ── Audit ───────────────────────────────────────────────────────────────────

function AuditPanel() {
  const table = useLocalTable({
    rows: auditEntries,
    searchFields: useMemo(
      () => (entry: (typeof auditEntries)[number]) => [
        entry.actor,
        entry.action,
        entry.target,
        entry.result,
      ],
      [],
    ),
  });

  const columns: Column<(typeof auditEntries)[number]>[] = [
    {
      key: "at",
      header: "When",
      width: "18%",
      render: (entry) => <span className="audit-mono">{entry.at}</span>,
    },
    { key: "actor", header: "Actor", width: "18%", render: (entry) => entry.actor },
    { key: "action", header: "Action", width: "34%", render: (entry) => entry.action },
    {
      key: "target",
      header: "Target",
      width: "18%",
      cellClassName: "cell-truncate",
      render: (entry) => <span className="audit-mono">{entry.target}</span>,
    },
    {
      key: "result",
      header: "Result",
      width: "12%",
      align: "right",
      render: (entry) => <span className={`audit-result ${entry.result}`}>{entry.result}</span>,
    },
  ];

  return (
    <div className="settings-panel">
      <div className="settings-panel-head">
        <div>
          <h2 className="settings-panel-title">Audit Log</h2>
          <p className="settings-panel-sub">
            Every consequential action taken in the console, with who took it.
          </p>
        </div>
      </div>

      <div className="filters">
        <SearchInput
          value={table.search}
          onChange={table.setSearch}
          placeholder="Search the audit log…"
          label="Search the audit log"
        />
      </div>

      <DataTable
        caption="Audit log"
        columns={columns}
        rows={table.pageRows}
        rowKey={(entry) => `${entry.at}-${entry.action}`}
        minWidth="900px"
        emptyMessage="No audit entries match your search."
      />

      {table.total > 0 ? (
        <Pagination
          page={table.page}
          pageSize={table.pageSize}
          total={table.total}
          onPageChange={table.setPage}
          onPageSizeChange={table.setPageSize}
          itemLabel="entries"
        />
      ) : null}
    </div>
  );
}

export default SettingsPage;
