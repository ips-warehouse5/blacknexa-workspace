# Content Moderation Module

## Purpose
The **Content Moderation** module serves as the frontline defense against harassment, hate speech, threats, doxxing, and platform policy violations across all user posts and discussion comments.

---

## Submenu Structure & Views

### 1. Moderation Queue (`#queue`)
* **Dynamic Source Filtering Tabs:**
  * `All Flag Reports`
  * `AI Flag Reports` (Automated policy violation triggers)
  * `User Flag Reports` (Community member reports)
  * Specific Policy Buckets: `Direct Threat & Violence`, `Harassment & Bullying`, `Hate Speech & Discrimination`, `Private Details / Doxxing`, `Misleading Content`, `Spam`.
* **Smart Column Visibility:**
  * `Flag By` column is dynamically shown on the `All` tab and automatically hidden when filtered to specific AI or User tabs.
* **Custom Dropdown Sorting:** Newest First, Oldest First.
* **Single-Line Truncation:** Long titles truncate cleanly with `...` while keeping `URGENT` badges visible and full text viewable via custom dark floating tooltips.

### 2. Keyword Rules (`#keywordRulesPage`)
* **Policy Filtering Engine:** Configuration of automated word filters, threat phrasing, and regex pattern rules used by the AI engine to detect and flag high-risk content automatically.
* **Rule Categories:**
  * *System Policy Rules (Admin Defined)*: Threat language, harassment phrases, slurs, doxxing patterns.
  * *AI Discovered Rules (Machine Learning Detected)*: Emerging retaliatory phrasing surfaced by AI.
* **Management Controls:**
  * Add Keyword Rule Modal.
  * Delete / Disable Rule Modal with confirmation.

---

## Moderation Details View (`#details`)
* **Rapid Review Header Navigation:**
  * Quick **Previous (`←`)** and **Next (`→`)** pill buttons with item counter (*e.g., `1 of 12`*) to review large queues continuously without returning to the table.
* **Incident vs Comment Context Split:**
  * For **Incidents:** Displays full original incident title, description, and attached evidence files.
  * For **Comments:** Shows the flagged comment alongside a read-only preview card of the parent incident for complete context.
* **AI Flags Table:** Shows detected violation category and exact keyword/pattern triggers.
* **User Reports Log:** Lists reporting users, chosen reason, and submission timestamps.

---

## Action Workflows & Modals
* **Approve & Publish / Keep Comment:** Clears flags and verifies content.
* **Reject & Take Down / Remove Comment:** Requires predefined reason selection + author notice.
* **Issue Warning:** Sends a formal policy warning directly to the user's account.
* **Ban User:** Permanently terminates account access for severe violations.
