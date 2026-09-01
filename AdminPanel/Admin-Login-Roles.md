# Admin Login & Roles Module (High Security Zone)

## Purpose
The **Admin Login & Roles** module provides enterprise-grade authentication, multi-factor authentication (MFA), role-based access control (RBAC), and staff account governance for operators of the BlackNexa platform.

---

## Core Features & Functionality

### 1. Secure Admin Authentication
* **Multi-Factor Authentication (MFA / 2FA):**
  * Step 1: Email & Password verification with strict brute-force rate-limiting (`authLimiter` max 8 attempts per window).
  * Step 2: Time-based One-Time Password (TOTP / Email OTP) 6-digit challenge verification.
* **Session Security:**
  * Short-lived JWT Access Tokens (`15m`).
  * Cryptographically rotated Refresh Tokens with automatic reuse detection and revocation.
  * Device session isolation and remote "Sign out all devices" action.

### 2. Role-Based Access Control (RBAC Hierarchy)
* **`Super Admin`**: Full operational authority, operator account provisioning, billing, and destructive route access.
* **`Admin`**: Incident management, broadcast alerts, user management, and general platform operations.
* **`Moderator`**: Frontline moderation queue reviews, content approvals, takedowns, and user warnings.
* **`Advocate Admin`**: Oversees verified advocate caseloads, case transfers, and legal aid resources.
* **`Support Staff`**: Read-only user inquiry support and dispute triage.
* **`Auditor`**: Read-only compliance inspection across moderation timelines and financial ledgers.

### 3. Staff & Operator Account Management
* **Staff Directory Table:**
  * Staff Name & Avatar
  * Email Address
  * Role Badge (`Super Admin`, `Admin`, `Moderator`, `Advocate Admin`, `Support`)
  * 2FA Status (`Enabled` / `Pending Setup`)
  * Account Status (`Active` / `Disabled`)
  * Last Login Timestamp
  * Actions (Edit Role & Permissions, Reset Password, Disable/Enable Account)
* **Operator Lifecycle Modals:**
  * **Add Staff Member Modal**: Input name, email, and assign initial role.
  * **Edit Permissions Modal**: Update role and granular permission scope.
  * **Force Password Reset Modal**: Generates secure one-time password reset link.
  * **Disable / Enable Account Modal**: Instantly revokes all active operator tokens and blocks login.

### 4. Immutable Audit Ledger
* Comprehensive logging of every administrative action:
  * Actor ID & Name
  * Action Type (*Role Changed, User Banned, Incident Verified, Content Removed*)
  * Target Entity Reference
  * IP Address & Timestamp
