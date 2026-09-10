# Incident Management Module

## Purpose
The **Incident Management** module handles the end-to-end lifecycle of reported community incidents, legal support routing, evidence inspection, case advocate assignment, and community shield verification.

---

## Submenu Structure & Views

### 1. All Incidents (`#incidentQueue`)
* **Comprehensive Directory:** Full searchable repository of all submitted incidents regardless of status.
* **Search & Filters:** Search by ID (`INC-20481`), Title, Author, Location, and Category (*Policing, Housing, Workplace, Abuse, Discrimination*).
* **Date Filters:** `All Dates`, `Today`, `Past 7 Days`, `This Month`.
* **Category Filters:** Custom dropdown popovers with instant table filtering.
* **Proportional Table Grid:**
  * Title & ID (Single line with tooltip for truncated titles)
  * Category & Geographical Location
  * Status Badge (`Submitted`, `Under Review`, `Verified`, `Dismissed`, `Deactivated`)
  * Assigned Advocate / Moderator
  * Submitted At (Two-line Date & Time)
  * Actions (Eye icon for Case Management)

### 2. Verification Queue (`#incidentVerificationQueue`)
* **Focused Queue:** Dedicated queue for senior moderators and lead advocates to review cases that have completed evidence intake and require final verification decisions.
* **Verification Criteria Checklist:**
  * Primary evidence authenticity validated.
  * Corroborating witness statement checked.
  * Jurisdiction legal review completed.
* **Actions:** One-click **Verify & Issue Public Shield** or **Dismiss / Retract**.

### 3. My Assigned Cases (`#incidentMyCases`)
* **Personal Advocate Workspace:** Filtered view displaying only incidents actively assigned to the logged-in advocate or moderator (*e.g., M. Kaur, Advocate Sarah Miller*).
* **Case Progress Tracker:**
  * Intake & Contact status.
  * Follow-up task reminders and appointment logs.
  * Direct case reassignment option if transfer is needed.

---

## Incident Case Details View (`#incidentDetails`)
* **Incident Metadata Header:** Category, Reference ID, Verified status badge, and Back navigation.
* **Dynamic Lifecycle Timeline:**
  1. *Incident Submitted* (Author name, timestamp, evidence count).
  2. *Case Assignment & Investigation* (Assigned advocate, in-review state).
  3. *Final Decision* (Verified with active shield, Dismissed with reason, or Deactivated).
* **Evidence Inspection Grid:**
  * Secure previews of photos (`IMG`), witness statements (`PDF`), audio recordings (`AUD`), and body-cam/cellphone videos (`MP4`).
  * Cryptographic integrity check confirmation badge.
* **Advocate Assignment Subsystem:**
  * Assign or re-assign case to verified advocates (*e.g., Advocate Sarah Miller, Advocate Jason Ross*).
* **Internal Case Notes & Audit Thread:**
  * Chronological internal thread for investigators and moderators to record findings without exposing them to public users.

---

## Decision Modals
* **Verify Incident Modal:** Confirms case validity and activates public shield badge.
* **Dismiss Incident Modal:** Predefined reason (*Not credible, Duplicate, Out of scope, Withdrawn*) + notes.
* **Deactivate Incident Modal:** Legal removal or reporter retraction with full audit trail.
