# News Categories & Tags Management Module

## Purpose
The **News Categories & Tags Management** module manages the content taxonomy, topic classification hierarchy, legal jurisdiction mapping, and tagging engine across all articles, briefings, and incident correlations.

---

## Core Features & Functionality

### 1. Categories Hierarchy & Taxonomy
* **Primary System Categories:**
  * `Civil Rights & Liberties`: First Amendment, free assembly, equal rights cases.
  * `Police Conduct & Accountability`: Stop-and-search policies, body-cam transparency, misconduct filings.
  * `Housing & Tenant Rights`: Eviction protections, discriminatory housing practices, tenant unions.
  * `Workplace Discrimination`: Labor rights, wrongful termination, fair wage disputes.
  * `Digital Privacy & Surveillance`: Facial recognition laws, data protection, doxxing legal remedies.
  * `Immigration & Border Rights`: Asylum protections, sanctuary policies, legal aid access.
* **Category Configuration:**
  * Category Name, URL Slug, Icon / Badge color token, Description, and Display Order.
  * Active / Inactive status toggle.

### 2. Tags & Topic Classification Engine
* **Tag Directory Table:**
  * Tag Name (e.g. `#StopAndSearch`, `#Section60`, `#HousingAdvocacy`, `#BailFund`).
  * Linked Articles Count & Linked Incidents Count.
  * Trending Status indicator (Hot / Normal).
  * Auto-Tagging Keywords: Comma-separated trigger words used by AI to automatically tag ingested articles.
* **Tag Management Actions:**
  * Create New Tag, Merge Duplicate Tags, Edit Auto-Rules, Delete Unused Tags.

### 3. Jurisdiction & Geo-Classification Mapping
* Map categories and tags to specific geographical boundaries and legal frameworks (*e.g., UK PACE Act vs US State Laws vs Canada Charter of Rights*).
