# Comprehensive Implementation Plan: Core Admin Modules

This document outlines the detailed technical architecture, backend API design, database schemas, and frontend UI specifications for the three core modules:

1. **Admin Login & Roles (High Security Zone)**
2. **Dashboard Overview (Monitor System Health)**
3. **User Management (User Control & Moderation)**

---

## Module 1: Admin Login & Roles (High Security Zone)

### 1. Scope & Capabilities
* **Secure Admin Login & MFA:** Email/Password authentication with 2FA / MFA (One-Time Passcode verification) and rate-limiting (`authLimiter`).
* **Admin Roles & RBAC Management:** `Super Admin`, `Admin`, `Moderator`, `Advocate Admin`, `Support Staff`, `Auditor`.
* **Account Lifecycle & Security Controls:**
  * Create new operator/staff accounts.
  * Enable / Disable admin accounts (`is_active: boolean`).
  * Force password reset / Send password reset instructions.
  * Session revocation (log out specific devices or revoke all active sessions).
  * Immutable audit log of all administrative actions.

### 2. Backend Architecture (`blacknexa-backend`)
* **Existing Model:** `AdminUser` (`src/models/admin_user.model.ts`) with bcrypt hashing (12 rounds), role discrimination, and refresh-token rotation.
* **New / Enhanced Endpoints:**
  * `POST /api/v1/admin/auth/login` — Email + password authentication (returns MFA challenge token or full session).
  * `POST /api/v1/admin/auth/mfa/verify` — Validates 6-digit TOTP / email code.
  * `POST /api/v1/admin/auth/refresh` — Rotates refresh token and issues fresh JWT.
  * `POST /api/v1/admin/auth/logout` & `/logout-all` — Revokes active refresh token ID.
  * `GET /api/v1/admin/operators` — List all operator/staff accounts (Super Admin & Admin).
  * `POST /api/v1/admin/operators` — Create new staff account with assigned role.
  * `PATCH /api/v1/admin/operators/:id` — Update role, permissions, or toggle enabled/disabled status.
  * `POST /api/v1/admin/operators/:id/reset-password` — Generate temporary password / trigger reset link.
  * `GET /api/v1/admin/audit-logs` — Immutable ledger of operator actions with timestamps & IP records.

### 3. Frontend UI Specifications (`BlackNexa-Admin-Panel.html`)
* **Secure Admin Login View (`#adminAuthView`):**
  * Modern split-layout login modal/screen with BlackNexa branding.
  * Step 1: Email & Password entry with password reveal toggle.
  * Step 2: 6-Digit MFA Verification Code entry with resend cooldown timer.
* **Admin Roles & Staff Directory Page (`#adminRolesView`):**
  * Staff list table: Name & Avatar, Email, Role badge, MFA status, Account Status (`Active` / `Disabled`), Last Login, and Actions.
  * Action modals: **Add New Staff Member**, **Edit Permissions & Role**, **Reset Password**, **Disable Account**.

---

## Module 2: Dashboard Overview (Monitor System Health)

### 1. Scope & Capabilities
* **High-Level System Metrics (KPI Cards):**
  * **Total Users:** Total registered accounts, active monthly users, and growth trend (+X%).
  * **Total Incidents:** Total count with status breakdown (`Submitted`, `Under Review`, `Verified`, `Dismissed`).
  * **Verifications & Shields:** Incidents successfully verified with active public community shield.
  * **Support & Advocates:** Active advocates on duty and assigned case load.
* **Interactive Visualizations (Charts & Graphs):**
  * **Incidents Over Time:** Trend line / bar chart (Daily, Weekly, Monthly volume).
  * **Category Distribution:** Proportional breakdown (*Policing, Housing, Workplace, Harassment, Education, Medical, Digital*).
  * **Geographic Incident Heatmap / Regional Breakdown:** Top affected cities & boroughs (*London, Hackney, Manchester, Birmingham, Toronto, Chicago*).
* **Urgent Attention & Alerts Widget:**
  * Real-time list of unassigned cases, high-risk flags, and `URGENT` reports with 1-click jump to review.

### 2. Backend Architecture (`blacknexa-backend`)
* **New Endpoints (`/api/v1/admin/dashboard`):**
  * `GET /api/v1/admin/dashboard/metrics` — Aggregated counts for users, incidents by status, verification rates, and advocate workload.
  * `GET /api/v1/admin/dashboard/trends?range=30d` — Time-series incident submission and resolution counts.
  * `GET /api/v1/admin/dashboard/categories` — Incident distribution grouped by category.
  * `GET /api/v1/admin/dashboard/geo-distribution` — Grouped incident counts by city/region.
  * `GET /api/v1/admin/dashboard/urgent-alerts` — List of unassigned and high-risk items requiring immediate operator action.

### 3. Frontend UI Specifications (`BlackNexa-Admin-Panel.html`)
* **KPI Metric Cards Grid (4 Top Cards):**
  * Crisp typography, percentage badges, and distinct icon accents.
* **Charts & Analytics Grid (2-Column Responsive):**
  * Left: Incident Volume Trend (CSS / SVG-rendered smooth responsive bar/line chart).
  * Right: Category Distribution Donut / Progress breakdown.
* **Geographic Breakdown & Heatmap Table:**
  * Top regional clusters with incident severity levels.
* **Urgent Alerts Action Widget:**
  * Highlighting unassigned urgent cases with quick assign and review buttons.

---

## Module 3: User Management (User Control & Moderation)

### 1. Scope & Capabilities
* **User Accounts Directory & Search:**
  * Instant search across User Names, Emails, and User IDs.
  * Filter tabs: `All Users`, `Active`, `Advocates`, `Moderators`, `Suspended / Banned`.
  * Multi-dimensional dropdown filters (*Role, Status, Sort Order*).
* **User Profile & Incident Activity Log (Detail View):**
  * Full profile inspector (display name, email verification, registration date, last login, default privacy & location precision).
  * Comprehensive **Incident Activity Log** (all incident reports and comments submitted by this user).
  * Moderation enforcement history (warnings issued, flags received, notes).
* **Individual & Bulk Moderation Actions:**
  * Edit profile information.
  * Change user role (Member $\leftrightarrow$ Verified Advocate $\leftrightarrow$ Moderator).
  * Suspend / Ban user with predefined policy reasons.
  * Delete user account (soft-delete with data retention compliance).
  * **Bulk Operations:** Checkbox multi-select toolbar to Bulk Ban, Bulk Change Role, or Bulk Delete.

### 2. Backend Architecture (`blacknexa-backend`)
* **Existing Models:** `AppUser` (`src/models/app_user.model.ts`), `Report` (`src/models/report.model.ts`).
* **New Route Surface (`/api/v1/admin/users`):**
  * `GET /api/v1/admin/users` — List and search users with pagination (`limit`, `page`), role, and status filters.
  * `GET /api/v1/admin/users/:id` — Complete user profile with their submitted incident reports and activity history.
  * `PATCH /api/v1/admin/users/:id` — Update user profile details (display name, email, avatar mode, default visibility).
  * `POST /api/v1/admin/users/:id/role` — Update role (`member`, `advocate`, `moderator`).
  * `POST /api/v1/admin/users/:id/status` — Set account status (`active`, `suspended`, `deleted`) with reason.
  * `DELETE /api/v1/admin/users/:id` — Soft-delete account and revoke active sessions.
  * `POST /api/v1/admin/users/bulk` — Execute bulk actions (e.g. `{ action: "ban", userIds: [...] }`).

### 3. Frontend UI Specifications (`BlackNexa-Admin-Panel.html`)
* **Directory Table (`#userQueue`):**
  * Checkboxes for multi-selection.
  * Proportional fixed-grid columns: User Name & ID, Email, Role, Status, Incidents Filed, Joined Date, Actions.
  * Floating Bulk Actions Bar when $\ge 1$ user is selected.
* **User Details View (`#userDetails`):**
  * Back button (`← Back to Users`), User ID chip, Status badge.
  * Profile details card + Incident history log table + Action cards stack.
* **Action Modals:**
  * Edit User Profile Modal
  * Change Role Modal (with permission definitions)
  * Suspend / Ban Modal (predefined reasons + notes)
  * Delete User Confirmation Modal
  * Bulk Actions Confirmation Modal

---

## 4. Execution & Delivery Phases

1. **Phase 1: Admin Documentation & Architecture Setup**
   * Finalize the markdown blueprint files in `AdminPanel/` for all 3 modules (`Admin-Login-Roles.md`, `Dashboard-Overview.md`, `User-Management.md`).
2. **Phase 2: Backend API Implementation (`blacknexa-backend`)**
   * Implement controllers, services, routes, and validation schemas for Admin Auth/Roles, Dashboard Metrics, and User Administration.
3. **Phase 3: Frontend Dashboard Integration (`BlackNexa-Admin-Panel.html`)**
   * Build the UI views for Dashboard Overview, User Management, and Admin Roles with full interactivity, state management, light/dark mode, and responsive layout.
4. **Phase 4: End-to-End Testing & Verification**
   * Run automated syntax tests, verify token guards, and validate responsive rendering across all screen sizes.
