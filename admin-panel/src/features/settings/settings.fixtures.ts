/**
 * Settings fixtures, from the approved prototype.
 */

export interface SecurityPolicy {
  maxLoginAttempts: number;
  lockoutMinutes: number;
  mfaTtlMinutes: number;
  sessionIdleMinutes: number;
  requireMfa: boolean;
  forcePasswordChange: boolean;
  notifyOnNewDevice: boolean;
}

/**
 * Defaults matching what the API enforces today.
 *
 * Five attempts and a fifteen-minute lockout are the prototype's values, and
 * the backend was built to the same numbers so the screen is not describing a
 * policy nobody applies.
 */
export const securityPolicy: SecurityPolicy = {
  maxLoginAttempts: 5,
  lockoutMinutes: 15,
  mfaTtlMinutes: 5,
  sessionIdleMinutes: 60,
  requireMfa: true,
  forcePasswordChange: true,
  notifyOnNewDevice: true,
};

/** Outcome of an audited action. Drives the result chip's colour. */
export type AuditResult = "success" | "failed" | "blocked";

export interface AuditEntry {
  at: string;
  actor: string;
  action: string;
  target: string;
  result: AuditResult;
}

export const auditEntries: AuditEntry[] = [
  {
    at: "Sep 02, 2026  12:15 AM",
    actor: "Devon Vance",
    action: "Signed in to the admin console",
    target: "superadmin@blacknexa.com",
    result: "success",
  },
  {
    at: "Sep 01, 2026  11:42 PM",
    actor: "System",
    action: "Account locked — 5 failed attempts",
    target: "unknown@blacknexa.com",
    result: "blocked",
  },
  {
    at: "Sep 01, 2026  11:30 PM",
    actor: "M. Kaur",
    action: "Approved flagged content",
    target: "INC-20455",
    result: "success",
  },
  {
    at: "Sep 01, 2026  10:04 PM",
    actor: "M. Kaur",
    action: "Banned user from the moderation queue",
    target: "USR-1090",
    result: "success",
  },
  {
    at: "Sep 01, 2026  09:40 PM",
    actor: "R. Idris",
    action: "Added a case note",
    target: "INC-20481",
    result: "success",
  },
  {
    at: "Sep 01, 2026  08:12 PM",
    actor: "Elena Ramos",
    action: "Attempted to open Admin & Roles",
    target: "/admin-roles",
    result: "blocked",
  },
  {
    at: "Sep 01, 2026  06:55 PM",
    actor: "Devon Vance",
    action: "Created a staff account",
    target: "advocate@blacknexa.com",
    result: "success",
  },
  {
    at: "Sep 01, 2026  06:31 PM",
    actor: "Devon Vance",
    action: "Reset a staff password",
    target: "moderator@blacknexa.com",
    result: "success",
  },
  {
    at: "Aug 31, 2026  04:22 PM",
    actor: "System",
    action: "Security code expired before verification",
    target: "staff@blacknexa.com",
    result: "failed",
  },
  {
    at: "Aug 31, 2026  04:20 PM",
    actor: "Elena Ramos",
    action: "Signed in to the admin console",
    target: "staff@blacknexa.com",
    result: "success",
  },
  {
    at: "Aug 31, 2026  02:10 PM",
    actor: "Devon Vance",
    action: "Published a new Terms of Service version",
    target: "legal/terms v1.0",
    result: "success",
  },
  {
    at: "Aug 30, 2026  09:18 AM",
    actor: "M. Kaur",
    action: "Updated a keyword rule",
    target: "Direct Threat & Violence",
    result: "success",
  },
];
