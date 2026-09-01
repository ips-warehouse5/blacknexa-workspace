# News Management Module

## Purpose
The **News Management** module powers the BlackNexa community newsfeed, legal policy briefings, editorial coverage, AI article synthesis, multi-language translations, and syndicated podcast media.

---

## Submenu Structure & Module Suite

```
News Management (Suite)
├── 1. All News Articles (Editorial & Ingested Articles Directory)
├── 2. Daily Briefing Management (Audio / Text 3-Minute Briefings)
├── 3. News Categories & Tags (Taxonomy, Topics, Jurisdiction Map)
└── 4. Source Management (RSS, Wire APIs, Feeds Ingestion Pipeline)
```

---

## Core Features & Functionality

### 1. News Articles Directory
* **Search & Filters:** Search by Headline, Slug, Author, Category (*Civil Rights, Legal Reforms, Community Safety, Legislation*), and Publication Status.
* **Status Badges:** `Published`, `Draft`, `Scheduled`, `Archived`.
* **Metrics:** Read count, community shares, audio listen rate.

### 2. Editorial Tools & Content Creation
* **Article Editor:**
  * Rich-text editor with markdown formatting, quote highlights, and embedded evidence references.
  * SEO metadata inputs (Meta title, description, schema.json markup, slug generator).
  * Cover image uploader and automated aspect ratio generator.
* **AI Article Generator:**
  * Synthesize community incident trends and legislative updates into objective briefing drafts.
* **Multi-Language Translations:**
  * Manage automated and human-reviewed translations for international jurisdictions (*English, Spanish, French, Arabic, etc.*).
* **Audio & Podcast Generator:**
  * Automated Text-to-Speech (TTS) audio briefings and podcast RSS feed generation (`/api/v1/podcast/feed.json`).
