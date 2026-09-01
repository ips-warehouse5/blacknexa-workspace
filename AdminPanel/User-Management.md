# User Management Module

> **Status:** `Completed & Live in Admin Panel`

## Purpose
The **User Management** module provides tools to audit, moderate, and manage community members, verified advocates, moderators, and operator accounts.

---

## Core Features & Functionality

### 1. User Directory & Queue
* **Search & Lookup:** Search by User Name, Email, User ID (`USR-1082`), Role, or Status.
* **Role & Status Tabs:**
  * `All Users`
  * `Active`
  * `Advocates` (Verified legal/community advocates)
  * `Moderators` (Staff queue operators)
  * `Suspended / Banned`
* **Custom Dropdown Filters:** Role filter, Status filter, and Sort filter (*Newest Joined, Most Incidents*).
* **Bulk Operations Bar:** Select multiple accounts with checkboxes to perform bulk actions:
  * Bulk Suspend / Ban
  * Bulk Role Change
  * Bulk Delete Account

### 2. Table Column Schema
1. **User Name & ID:** Avatar initials, display name, and unique user identifier.
2. **Email Address:** Masked or full email with verification checkmark.
3. **Role:** `Member`, `Advocate`, `Moderator`, `Admin`.
4. **Status:** `Active` (green badge), `Suspended` (amber/red badge), `Deleted` (gray badge).
5. **Incidents Filed:** Count of reports submitted with a direct filter link to Incident Management.
6. **Joined Date:** Two-line formatted Date & Time.
7. **Actions:** Vector SVG action buttons (Edit Profile, View Activity & Profile, Change Role, Suspend/Ban, Delete).

### 3. User Profile & Activity Log (Detail View)
* **Profile & Preferences Grid:** Display name, email verification, default visibility (`Public` vs `Trusted`), notification settings, registration date, and last active timestamp.
* **Incident Activity Log:** Chronological table listing all reports, incidents, and comments submitted by this user with direct navigation to their case files.
* **Moderation & Enforcement History:** Record of previous warnings, community flags, and internal administrative audit notes.

### 4. Modals & Actions
* **Edit Profile Info Modal:** Update display name, email, or privacy defaults.
* **Change Role Modal:** Promote to Verified Advocate or Moderator with permission descriptions.
* **Suspend / Ban User Modal:** Predefined reason dropdown (*Harassment, False reports, Terms breach*) + notes.
* **Delete Account Modal:** Soft-delete confirmation with GDPR/privacy compliance options.
