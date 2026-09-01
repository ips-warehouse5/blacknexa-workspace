# BlackNexa Admin Panel Architecture & Module Directory

## Overview
The **BlackNexa Admin Panel** is an enterprise-grade administrative dashboard designed for platform administrators, verified advocates, and moderation teams. It provides comprehensive real-time governance, community safety tooling, incident verification workflows, user control, and cloud infrastructure monitoring.

---

## Official Modules & Submenu Hierarchy (14 Primary Modules)

| # | Primary Module | Submenu Items & Sub-Features | Documentation File | High-Level Scope |
|---|----------------|------------------------------|--------------------|------------------|
| 1 | **Admin Login & Roles** | • MFA Authentication<br>• Staff Directory<br>• RBAC Hierarchy & Permissions<br>• Session Security & Audit Logs | [`Admin-Login-Roles.md`](./Admin-Login-Roles.md) | **High Security Zone:** Secure login, 2FA/MFA, operator management, and session controls. |
| 2 | **Dashboard Overview** | • High-Level KPIs & Turnaround Health<br>• Incidents Trend Charts<br>• Category Distribution<br>• Regional Geographic Heatmap<br>• Urgent & Unassigned Alerts | [`Dashboard-Overview.md`](./Dashboard-Overview.md) | **System Health Monitor:** Platform metrics, queue turnaround rates, and real-time alerts. |
| 3 | **User Management** | • All Users Directory & Search<br>• User Profile Inspector<br>• Incident Activity Log History<br>• Role Promotions & Suspensions<br>• Multi-select Bulk Actions | [`User-Management.md`](./User-Management.md) | **User Control & Moderation:** Member directory, incident history, role changes, and bulk moderation. |
| 4 | **Incident Management** | • **Submenu 1:** All Incidents<br>• **Submenu 2:** Verification Queue<br>• **Submenu 3:** My Assigned Cases | [`Incident-Management.md`](./Incident-Management.md) | **Case Investigation:** Incident intake, advocate assignment, evidence check, and shield verification. |
| 5 | **Content Moderation** | • **Submenu 1:** Moderation Queue (All, AI, User Flags)<br>• **Submenu 2:** Keyword Rules Engine (Word filters, AI patterns) | [`Content-Moderation.md`](./Content-Moderation.md) | **Frontline Moderation:** AI & User flag queues, keyword rule engine, context splits, and takedowns. |
| 6 | **Resource Management** | • Legal Aid Counsel & Defense Directory<br>• Emergency Crisis Hotlines<br>• Verified Safehouse Locations<br>• Know-Your-Rights Educational Guides | [`Resource-Management.md`](./Resource-Management.md) | **Support Network:** Verified legal counselors, emergency hotlines, and educational materials. |
| 7 | **News Management** | • Editorial Articles Directory<br>• Rich Article Editor with SEO Markup<br>• AI News Synthesis Engine<br>• Multi-Language Translations & Podcasts | [`News-Management.md`](./News-Management.md) | **Editorial Publishing:** Community news articles, editorial workflow, and multi-lingual publishing. |
| 8 | **Daily Briefing Management** | • Morning & Evening Briefings<br>• 3-Minute AI Executive Summaries<br>• Audio Generation & Scheduling<br>• Podcast RSS Feed Syndication | [`Daily-Briefing-Management.md`](./Daily-Briefing-Management.md) | **Intelligence Briefings:** 3-minute civil rights audio & text briefings and automated RSS feeds. |
| 9 | **News Categories & Tags** | • Category Taxonomy Hierarchy<br>• Topic Tags Classification<br>• Automated Tagging Triggers<br>• Jurisdiction & Geo-Mapping | [`News-Categories-Tags-Management.md`](./News-Categories-Tags-Management.md) | **Taxonomy & Geo-Mapping:** Content categories, topic tags, and legal jurisdiction mappings. |
| 10 | **Source Management** | • Ingestion Sources Directory<br>• Legal Wire APIs & Court Dockets<br>• Credibility & Trust Scoring<br>• Deduplication & Grouping Rules | [`Source-Management.md`](./Source-Management.md) | **Ingestion Pipeline:** External wire feeds, court dockets, source health, and deduplication. |
| 11 | **Notifications & Announcements** | • Regional Emergency Area Broadcasts<br>• Global Platform Announcements<br>• Push Notification Campaigns<br>• Direct User Moderation Warnings | [`Notifications-Announcements.md`](./Notifications-Announcements.md) | **Alert Dispatcher:** Regional emergency broadcasts, push notifications, and direct policy warnings. |
| 12 | **Content Management** | • Versioned Terms of Service (ToS)<br>• Privacy Policy & GDPR Disclosures<br>• Community Guidelines Rulebook<br>• Help Center & FAQ Repository | [`Content-Management.md`](./Content-Management.md) | **Legal & Help Repositories:** Versioned ToS, Privacy Policy GDPR compliance, and FAQ center. |
| 13 | **Settings & Config** | • Platform Identity & Submission Limits<br>• Operator Session Timeout Policies<br>• 5 Curated Accent Palettes (Light/Dark)<br>• Dynamic Feature Flags & Maintenance Mode | [`Settings-Config.md`](./Settings-Config.md) | **Global Configuration:** Platform settings, 5 accent themes, light/dark mode, and maintenance mode. |
| 14 | **DevOps & Integration (in AWS)** | • AWS ECS Fargate Container Clusters<br>• Amazon RDS PostgreSQL (Multi-AZ)<br>• Amazon ElastiCache Redis Cluster<br>• Amazon S3 KMS Evidence Vault<br>• CI/CD GitHub Actions & CloudWatch | [`DevOps-Integration-AWS.md`](./DevOps-Integration-AWS.md) | **Cloud Infrastructure:** AWS container architecture, automated scaling, observability, and deployments. |

---

## Design System & Architecture Guidelines
* **Typography:** `Work Sans` font family with strict hierarchy:
  * Headings and Titles: **Semi-Bold (`600`)**
  * Body, Table Cells, and Metadata: **Regular (`400`)**
* **Table Grid Geometry:** Proportional fixed table layout (`table-layout: fixed`) with 100% width coverage from start to end and right-aligned action buttons.
* **Theming:** Seamless Light Mode and Dark Mode support across all 5 accent palettes (*Signal Blue, Mono Dark, Indigo, Emerald, Warm Gold*).
