# Settings & Config Module

## Purpose
The **Settings & Config** module controls platform-wide system configurations, dynamic feature flags, API keys, security parameters, UI theme customization, and system maintenance tasks.

---

## Core Features & Functionality

### 1. General Platform Configuration
* **System Identity:** Platform Name, Support Email, Emergency Hotline, Default System Locale.
* **Incident Submission Rules:**
  * Auto-anonymization default toggle.
  * Maximum evidence upload size (e.g. 50 MB per incident).
  * Geolocation precision limits (`Exact`, `Approximate`, `Hidden`).
* **Moderation Thresholds:**
  * Automatic hold score for AI content scanning.
  * Urgent alert threshold based on keyword severity.

### 2. Security & Access Configurations
* **Session Policies:** Operator session timeout duration (e.g. 30 mins idle), max concurrent sessions per admin.
* **MFA Enforcement:** Mandatory 2FA for all `Super Admin` and `Admin` roles.
* **Rate Limiting Tiers:** API request rate limiter quotas for mobile clients, web users, and internal operators.

### 3. Appearance & Theme Settings
* **Light / Dark Mode Engine:** Dynamic theme switching tokens with persistent local & server preferences.
* **5 Curated Accent Palettes:**
  1. *Signal Blue* (`#0A7CFF` / `#3D97FF`)
  2. *Mono Dark* (`#111827` / `#FFFFFF`)
  3. *Indigo* (`#4F46E5` / `#8B83FF`)
  4. *Emerald Green* (`#0E8A5F` / `#43C792`)
  5. *Warm Gold* (`#B78A00` / `#D8B64B`)

### 4. Dynamic Feature Flags & Maintenance
* **Feature Toggles:** Enable/disable new features in real time without code deployment (*e.g., Audio Briefings, Public Shield Badges, Anonymous Tipping*).
* **System Maintenance Mode:** Put platform into read-only mode for scheduled database migrations with custom banner messages.
