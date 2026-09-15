/**
 * User profile — one member account.
 *
 * Left column is the account and what it has reported; right column is
 * enforcement. Which enforcement actions appear depends on the account's
 * current state, so a suspended user is offered reinstatement rather than a
 * second suspension.
 */

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { useToast } from "@/app/providers/ToastProvider";
import { useDeniedReason } from "@/components/rbac/Can";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Card } from "@/components/ui/Page";
import { Select } from "@/components/ui/Select";
import env from "@/config/env";
import { appUsers } from "@/mocks/appUsers";
import type { AppUser, AppUserRole, AppUserStatus } from "@/mocks/types";

const STATUS_TONES: Record<AppUserStatus, BadgeTone> = {
  active: "active",
  suspended: "suspended",
  deleted: "deleted",
};

const ROLE_OPTIONS = [
  { value: "member" as const, label: "Member — standard community access" },
  { value: "advocate" as const, label: "Advocate — can view trusted cases" },
  { value: "moderator" as const, label: "Moderator — can work the queue" },
];

const SUSPEND_REASONS = [
  { value: "harassment", label: "Harassment of other members" },
  { value: "false", label: "Repeated false reports" },
  { value: "spam", label: "Spam or advertising" },
  { value: "abuse", label: "Abusive language" },
];

type Action = "role" | "suspend" | "reinstate" | "delete" | null;

function humanise(value: string): string {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function InfoCell({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="info-cell">
      <div className="info-cell-label">{label}</div>
      <div className="info-cell-value">{value}</div>
    </div>
  );
}

function UserDetailView() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  const roleDenied = useDeniedReason("users.role");
  const suspendDenied = useDeniedReason("users.suspend");
  const deleteDenied = useDeniedReason("users.delete");

  const source = useMemo(() => appUsers.find((u) => u.id === userId), [userId]);

  // Local copy so actions show immediately, as in the prototype.
  const [user, setUser] = useState<AppUser | undefined>(source);
  const [action, setAction] = useState<Action>(null);
  const [role, setRole] = useState<AppUserRole>("member");
  const [reason, setReason] = useState("");

  useEffect(() => {
    document.title = user
      ? `${user.display_name} · ${env.appName} Admin`
      : `Not found · ${env.appName} Admin`;
  }, [user]);

  if (!user) {
    return (
      <Card>
        <div className="page-placeholder">
          <h2>User not found</h2>
          <p>No account matches “{userId}”.</p>
          <div style={{ marginTop: 16 }}>
            <Link className="btn primary" to="/users">
              Back to users
            </Link>
          </div>
        </div>
      </Card>
    );
  }

  const runAction = () => {
    if (action === "role") {
      setUser((current) => (current ? { ...current, role } : current));
      toast.success("Role updated", `${user.display_name} is now a ${humanise(role)}.`);
    } else if (action === "suspend") {
      setUser((current) => (current ? { ...current, status: "suspended" } : current));
      toast.success("Account suspended", `${user.display_name} has been signed out.`);
    } else if (action === "reinstate") {
      setUser((current) => (current ? { ...current, status: "active" } : current));
      toast.success("Account reinstated", `${user.display_name} can post again.`);
    } else if (action === "delete") {
      setUser((current) => (current ? { ...current, status: "deleted" } : current));
      toast.success("Account scheduled for deletion", "Reports are retained but anonymised.");
    }
    setAction(null);
    setReason("");
  };

  return (
    <div className="details-page">
      <div className="details-top-bar">
        <button
          type="button"
          className="back-btn-pill"
          title="Back to users"
          aria-label="Back to the user directory"
          onClick={() => navigate("/users")}
        >
          ←
        </button>
        <div className="meta-chip-wrap">
          <strong>{user.id}</strong>
          <Badge tone={STATUS_TONES[user.status]}>{humanise(user.status)}</Badge>
          <span className={`role-pill ${user.role}`}>{humanise(user.role)}</span>
        </div>
      </div>

      <h1 className="details-main-title">{user.display_name}</h1>

      <div className="details-grid">
        <div className="details-left">
          <div className="detail-card">
            <div className="detail-card-head">
              <div className="card-section-label">Profile</div>
            </div>
            <div className="content-info-grid">
              <InfoCell label="Display Name" value={user.display_name} />
              <InfoCell
                label="Email"
                value={
                  <>
                    {user.email}{" "}
                    {user.email_verified_at ? (
                      <span className="verified-tick" title="Verified">
                        ✓
                      </span>
                    ) : (
                      <span style={{ color: "var(--warning)", fontSize: 11 }}>Unverified</span>
                    )}
                  </>
                }
              />
              <InfoCell label="Region" value={humanise(user.region)} />
              <InfoCell label="Tier" value={humanise(user.tier)} />
              <InfoCell label="Joined" value={user.created_at} />
              <InfoCell label="Last Sign-in" value={user.last_login_at} />
              <InfoCell label="Default Visibility" value={humanise(user.default_visibility)} />
              <InfoCell label="Location Precision" value={humanise(user.default_precision)} />
              <InfoCell
                label="Posts Anonymously"
                value={user.anonymous_by_default ? "Yes" : "No"}
              />
            </div>
          </div>

          <div className="detail-card">
            <div className="detail-card-head">
              <div className="card-section-label">
                Incident History ({user.incidents.length})
              </div>
            </div>
            {user.incidents.length === 0 ? (
              <div className="empty">This member has not reported an incident.</div>
            ) : (
              <table className="mini">
                <thead>
                  <tr>
                    <th scope="col" style={{ width: "16%" }}>
                      ID
                    </th>
                    <th scope="col" style={{ width: "42%" }}>
                      Title
                    </th>
                    <th scope="col" style={{ width: "16%" }}>
                      Category
                    </th>
                    <th scope="col" style={{ width: "13%" }}>
                      Status
                    </th>
                    <th scope="col" style={{ width: "13%" }}>
                      Submitted
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {user.incidents.map((incident) => (
                    <tr key={incident.id}>
                      <td>
                        <Link to={`/incidents/${incident.id}`}>{incident.id}</Link>
                      </td>
                      <td>{incident.title}</td>
                      <td>{incident.category}</td>
                      <td>{incident.status}</td>
                      <td style={{ color: "var(--muted)", fontSize: 12 }}>
                        {incident.submitted}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="detail-card">
            <div className="detail-card-head">
              <div className="card-section-label">Moderation Notes</div>
            </div>
            <div className="content-body-text">
              {user.notes || <span style={{ color: "var(--muted)" }}>No notes recorded.</span>}
            </div>
          </div>
        </div>

        <div className="details-right">
          <div className="action-card">
            <div className="action-card-title">Community Role</div>
            <div className="action-btn-stack">
              <Button
                variant="outline"
                {...(roleDenied ? { deniedReason: roleDenied } : {})}
                onClick={() => {
                  setRole(user.role);
                  setAction("role");
                }}
              >
                Change Role
              </Button>
            </div>
            <div className="action-help-text">
              Currently a <strong>{humanise(user.role)}</strong>. Promoted advocates can view
              trusted cases; moderators can work the queue.
            </div>
          </div>

          <div className="action-card">
            <div className="action-card-title">Enforcement</div>
            <div className="action-btn-stack">
              {user.status === "suspended" ? (
                <Button
                  variant="primary"
                  {...(suspendDenied ? { deniedReason: suspendDenied } : {})}
                  onClick={() => setAction("reinstate")}
                >
                  Reinstate Account
                </Button>
              ) : (
                <Button
                  variant="danger"
                  {...(suspendDenied ? { deniedReason: suspendDenied } : {})}
                  disabled={user.status === "deleted"}
                  onClick={() => setAction("suspend")}
                >
                  Suspend Account
                </Button>
              )}
            </div>
            <div className="action-help-text">
              Suspension signs the member out and blocks posting. It is reversible; deletion is
              not.
            </div>
          </div>

          <div className="action-card">
            <div className="action-card-title">Account Deletion</div>
            <div className="action-btn-stack">
              <Button
                variant="danger"
                {...(deleteDenied ? { deniedReason: deleteDenied } : {})}
                disabled={user.status === "deleted"}
                onClick={() => setAction("delete")}
              >
                Delete Account
              </Button>
            </div>
            <div className="action-help-text">
              Reports the member filed are kept and anonymised, so cases built on them survive.
            </div>
          </div>
        </div>
      </div>

      <Modal
        open={action !== null}
        onClose={() => setAction(null)}
        title={
          action === "role"
            ? "Change community role"
            : action === "suspend"
              ? "Suspend this account"
              : action === "reinstate"
                ? "Reinstate this account"
                : "Delete this account"
        }
        description={
          action === "role"
            ? `Assign a new community role for ${user.display_name}.`
            : action === "suspend"
              ? `${user.display_name} will be signed out and unable to post until reinstated.`
              : action === "reinstate"
                ? "The suspension is lifted and posting is restored immediately."
                : "The account is scheduled for deletion. Their reports are retained but anonymised."
        }
        dismissOnBackdrop={false}
        footer={
          <>
            <Button variant="outline" onClick={() => setAction(null)}>
              Cancel
            </Button>
            <Button
              variant={action === "role" || action === "reinstate" ? "primary" : "danger"}
              disabled={action === "suspend" && !reason}
              onClick={runAction}
            >
              {action === "role"
                ? "Save Role"
                : action === "suspend"
                  ? "Suspend"
                  : action === "reinstate"
                    ? "Reinstate"
                    : "Delete Account"}
            </Button>
          </>
        }
      >
        {action === "role" ? (
          <Select
            label="Community role"
            showLabel
            value={role}
            options={ROLE_OPTIONS}
            onChange={setRole}
          />
        ) : null}

        {action === "suspend" ? (
          <Select
            label="Suspension reason"
            showLabel
            value={reason}
            placeholder="Select a reason…"
            options={SUSPEND_REASONS}
            onChange={setReason}
          />
        ) : null}

        {action === "delete" ? (
          <div className="delete-lifecycle-card">
            <div className="delete-lifecycle-title">What happens next</div>
            <div className="delete-timeline-row">
              <span className="delete-tag-today">Today</span>
              <span>Signed out of every device and hidden from the community.</span>
            </div>
            <div className="delete-timeline-row">
              <span className="delete-tag-30">30 days</span>
              <span>Recoverable on request. Nothing is erased yet.</span>
            </div>
            <div className="delete-timeline-row">
              <span className="delete-tag-day31">Day 31</span>
              <span>Personal data erased. Reports remain, anonymised.</span>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}


/*
 * Remounting on the id, rather than resetting state in an effect.
 *
 * This screen keeps local edits (the action dialog, a typed reason). Moving to
 * another record has to clear all of it, and the effect that did so ran *after*
 * the first render — so for one frame the new record was shown wearing the old
 * record's dialog state. Changing `key` makes React discard the instance
 * instead, which is both correct on the first frame and simpler to read.
 */
export function UserDetailPage() {
  const { userId } = useParams<{ userId: string }>();
  return <UserDetailView key={userId} />;
}

export default UserDetailPage;
