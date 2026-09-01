# Source Management Module

## Purpose
The **Source Management** module oversees external news wire feeds, RSS aggregators, official legal gazettes, court docket monitors, and automated content ingestion pipelines that feed the BlackNexa editorial engine.

---

## Core Features & Functionality

### 1. Ingestion Sources Directory
* **Source Types:**
  * `RSS / Atom Feeds`: Legal news outlets, public defense blogs, community journalism desks.
  * `Official Legal Gazettes & Dockets`: Government court filing feeds, police oversight boards.
  * `Wire APIs`: Verified news wire services.
  * `Direct Partner Feeds`: Partner civil rights organizations and legal aid societies.
* **Source Directory Table:**
  * Source Name & Favicon (*e.g., Civil Rights Gazette, Judicial Watch UK*)
  * Feed URL & Ingestion Endpoint
  * Ingestion Frequency (*Every 15m, Hourly, Daily*)
  * Health / Status Badge (`Active`, `Degraded`, `Failing`, `Paused`)
  * Credibility & Trust Score (`Tier 1 - Verified`, `Tier 2 - Community`, `Tier 3 - Unverified`)
  * Articles Ingested (Total count & daily average)
  * Actions (Fetch Now, Edit Config, Pause/Resume, Delete)

### 2. Ingestion Rules & Content Filtering
* **Keyword Whitelist / Blacklist:**
  * Auto-accept articles containing designated legal keywords.
  * Automatically discard irrelevant or clickbait content before reaching drafts.
* **Deduplication & Similarity Threshold:**
  * Automated cosine similarity matching to group multi-source reporting into a single consolidated story cluster.
* **Source Health Monitoring & Alerts:**
  * Automated detection of broken XML feeds, SSL expiration, or 404/500 errors with administrator email/Slack alerts.
