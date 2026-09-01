# Daily Briefing Management Module

## Purpose
The **Daily Briefing Management** module controls the daily legal safety, civil rights, and community intelligence briefings published to BlackNexa mobile and web users.

---

## Core Features & Functionality

### 1. Daily Briefing Pipeline & Schedule
* **Briefing Types:**
  * `Morning Civil Rights Briefing`: Automated synthesis of overnight legislative updates and regional incident alerts.
  * `Evening Community Intelligence`: Summary of verified incidents, ongoing advocacy cases, and safety bulletins.
  * `Emergency Incident Flash Briefing`: Rapid audio/text dispatch during localized emergencies.
* **Publication Scheduler:** Set scheduled release times with automated push notification triggers.

### 2. Briefing Editorial & AI Synthesis
* **AI Briefing Synthesizer:**
  * Pulls top verified incident reports, newly published news articles, and active community warnings.
  * Generates structured 3-minute executive summaries.
* **Human-in-the-Loop Review:**
  * Editorial approval gate before any briefing is broadcast.
  * Markdown editor with bullet points, source citations, and legal disclaimer blocks.
* **Audio Briefing & Podcast Integration:**
  * Automated Text-to-Speech (TTS) voice generation with natural audio pacing.
  * Preview audio wave, adjust speech rate, and publish to the `/api/v1/podcast/feed.json` RSS feed.

### 3. Briefings History & Analytics
* **Briefings Table:**
  * Date & Edition (*e.g., Aug 27 Morning Briefing*)
  * Status (`Published`, `Scheduled`, `Draft`, `Archived`)
  * Media Formats (`Text`, `Audio MP3`, `Podcast RSS`)
  * Listener & Readership Metrics (Total plays, completions, shares)
  * Actions (Edit, Play Audio Preview, Reschedule, Archive)
