# Backend Changes — Client Content Update (24 Sep 2026)

**For:** backend developer
**Goal:** update the backend so the mobile app shows the client's new content **without a new app release**.
**Source:** client emails forwarded by Sanjay on 24 Sep 2026 ("BlackNexa TestFlight Changes" and "Blacknexa TestFlight update UI").

**Status:**

| Task | What | Status |
|---|---|---|
| 1 | Update the live FAQ row on staging and prod | ⏳ **Backend team to run** (see Task 1) |
| 2 | New answer in the seed file | ✅ Code done: `src/data/faq_seed.data.ts` |
| 3 | News share page trademark/© line | ✅ Code done: `src/services/seo.service.ts:467` (needs deploy) |
| n/a | Answer sync script for existing databases | ✅ Code done: `src/scripts/sync_faq_answers.ts`, `npm run db:sync:faq-answers` |

---

## 1. Request

The client wants a new answer for the Help & FAQ question **"What exactly is BlackNexa?"** (General tab, START HERE). The answer is stored in the backend `faqs` table and served to the mobile app by `GET /api/v1/help/faq`.

### Final decisions (confirmed)

- **Company name:** News Moves Markets Forex LLC (used in Task 3)
- **Trademark owner wording:** every user-facing "trademark of BlackNexa" / "© BlackNexa" line must name News Moves Markets Forex LLC (matches the mobile app)
- **Trademark serials:** 50068604 (Class 009) and 99385360 (Class 042 / 045)
- **FAQ copy:** the client's **long version** ("What the App Does", four bullets). See §5.
- **FAQ surfaces:** **app and website**. The row stays shared (`surfaces: ["website", "app"]`).

---

## 2. How FAQ content reaches the mobile app

```
Admin console (Content → FAQs)
  └─ PATCH /api/v1/admin/faqs/:id          (permission: faq.manage)
       └─ faqService.update()
            ├─ updates the `faqs` row
            └─ invalidate() → deletes platform_cache keys faq:public:app / faq:public:website

Mobile app (Help & FAQ screen)
  └─ GET /api/v1/help/faq                  (public; no surface param = "app")
       └─ faqService.publicPayload("app")
            ├─ platform_cache hit  → returns cached payload (TTL 600 s)
            └─ cache miss          → reads published rows where surfaces ∋ "app"
```

| Fact | Reference |
|---|---|
| Public route `GET /help/faq`, mounted at `/api/v1` | `src/routes/faq.route.ts:30-35`, `src/routes/index.ts:271, 285` |
| No `surface` param defaults to `app` (what the mobile app sends) | `src/validations/faq.validation.ts:49-56` |
| Response envelope is `{ …, result: { categories, items } }` | `src/controllers/faq.controller.ts:36-44` |
| Only `status = "published"` rows, filtered by `surfaces` | `src/services/faq.service.ts:61-80` |
| Payload cached in Postgres `platform_cache`, TTL **600 s** | `src/services/faq.service.ts:41-43, 57-59, 98` |
| Every admin create, update or delete clears the cache | `src/services/faq.service.ts:103-110, 224, 249, 259` |
| `answer` is `TEXT`, validated 3–8000 chars, trimmed | `src/models/faq.model.ts:128-131`, `src/validations/faq.validation.ts:43` |
| Current row: `category general`, `surfaces ["website","app"]`, `startHere true` | `src/data/faq_seed.data.ts:66-73` |

**Mobile side needs nothing.** The app always fetches this endpoint when the Help screen opens. It keeps the result in memory for up to 30 minutes (`mobile-app/app/profile/help.tsx:23`), and a restart always fetches fresh content. The app's offline fallback (`mobile-app/lib/api/help.ts`) does not contain this question.

---

## 3. ⚠️ Read before starting

1. **Editing the seed file alone does nothing on an existing database.** `db:seed:faqs` (`src/scripts/seed_faqs.ts:60-77`) and `db:migrate:profile-faq` (`src/scripts/migrate_profile_and_faq.ts:131-150`) match rows by **question text** and **skip rows that already exist**. You must update the live row (Task 1).
2. **Never run `npm run db:seed:faqs -- --reset` on staging or prod.** It hard-deletes **every** FAQ row (`seed_faqs.ts:42-47`) and loses all admin edits.
3. **Do not change the question text** `What exactly is BlackNexa?`. The seed scripts use it as the match key, so a changed question would be inserted again as a duplicate on the next seed run.
4. **Avoid raw SQL `UPDATE`.** It bypasses `invalidate()`, so the old answer is served for up to 10 more minutes. If you must, also run
   `DELETE FROM platform_cache WHERE key LIKE 'faq:public:%';`
   (column `key`, per `src/models/platform_cache.model.ts`).

---

## 4. Tasks

### Task 1: Update the live FAQ row *(required; do it on every environment)*

**Row:** `question = 'What exactly is BlackNexa?'`
**Change:** `answer` → the §5 text (already in `src/data/faq_seed.data.ts`)
**Leave unchanged:** `question`, `category_id` (`general`), `status` (`published`), `surfaces` (`["website","app"]`), `start_here` (`true`), `sort_order`

**Option A: sync script (recommended)**

Deploy this branch, then run on each environment (staging first, then prod) with that environment's `.env` / `DATABASE_URL`:

```bash
npm run db:sync:faq-answers -- "What exactly is BlackNexa?"
```

- The script copies the answer from the seed file onto the existing row **only**. Status, surfaces, category and order stay as they are.
- It goes through `faqService.update()`, so the public FAQ cache is cleared at once.
- It is safe to run twice. A second run logs `already current` and changes nothing.
- Expected log: `[db:sync:faq-answers] updated: What exactly is BlackNexa?` and then `complete — 1/1 updated`.

**Option B: admin console**

1. Log in to the admin console for the environment.
2. Go to **Content → FAQs** and search `What exactly is BlackNexa`.
3. Replace the **Answer** field with the §5 text, pasted as-is (the textarea keeps line breaks), and save. Leave both surfaces ticked.

### Task 2: Update the seed file *(✅ done)*

**File:** `src/data/faq_seed.data.ts` (the "What exactly is BlackNexa?" entry). The `answer` now holds the §5 text: six paragraphs joined with `\n\n`, 1,818 characters. `question`, `categoryId`, `surfaces` and `startHere` are unchanged. New or reset databases get the new answer from here. Existing databases need Task 1.

### Task 3: News share page trademark line *(✅ done; needs deploy)*

**File:** `src/services/seo.service.ts:467`, in `buildArticleHtml()` (line 316). This is the public HTML page shown when a news article link is shared from the app.

Before:
> BlackNexa™ is a trademark of BlackNexa, application pending with the United States Patent and Trademark Office (USPTO). … © {year} BlackNexa™. All rights reserved. …

The client's ownership statement is *"BlackNexa™ is a trademark of News Moves Markets Forex LLC"*, and the mobile app's news article footer already uses this wording. The share page now reads:
> BlackNexa™ is a trademark of News Moves Markets Forex LLC, application pending with the United States Patent and Trademark Office (USPTO). All content, concepts, methodology, and intellectual property herein are the exclusive protected property of News Moves Markets Forex LLC — including … © {year} News Moves Markets Forex LLC. All rights reserved. …

Three replacements were made in that one line:
1. `trademark of BlackNexa,` → `trademark of News Moves Markets Forex LLC,`
2. `exclusive protected property of BlackNexa&trade;` → `exclusive protected property of News Moves Markets Forex LLC`
3. `&copy; ${…} BlackNexa&trade;.` → `&copy; ${…} News Moves Markets Forex LLC.`

The year expression and the rest of the paragraph are unchanged. `npm run typecheck` passes.

Out of scope: the `Trademark pending with the USPTO` lines in file-header comments (`src/types/*.ts`, `src/data/*.ts`). They are not user-facing.

---

## 5. Approved copy

The client's long version. The app shows the answer as **plain text**: `\n` line breaks work, **bold and Markdown do not**. The client's bold labels are therefore written as plain text followed by a colon, and bullets use `•`. The answer is 1,818 characters, well within the 8,000-character limit.

```
BlackNexa™ is a groundbreaking, God-centered ecosystem that combines a global social network with a social justice platform, designed to protect, connect, and empower Black, brown, and underserved communities. In plain terms, it is a mobile application that acts as both a digital shield for your personal safety and a wholesome digital home for your community.

What the App Does:

• The Godly Community Feed & Social Network: This is the heart of the app's social side. Spanning across local towns, U.S. cities, and international borders worldwide, it is a safe, peaceful space where people can connect, discuss business, share everyday life, and address social or political issues—all conducted in a godly manner with mutual respect, keeping God's commandments, and loving our neighbor as ourselves.

• The Injustice Pocket Recorder & Systemic Protection: If you ever face systemic racism, racial profiling, or unfair public encounters, this tool puts power directly back into the hands of the people. With a single tap, it records video while automatically locking in unalterable GPS coordinates, timestamps, and metadata. By capturing undeniable, objective evidence of systemic injustice on the spot, it prevents these incidents from being swept under the rug, deters misconduct through transparent accountability, and ensures accountability is enforced.

• Encrypted Evidence Vault & Automated Routing: Your captured recordings are securely backed up and structured so they can be automatically routed to the appropriate oversight bodies, human rights regulatory agencies, and legal advocates who have the authority to act on what you report.

• AI Fact-Check News Engine: A smart news engine that cuts straight through media spin and systemic bias to give you clear, fact-driven information on important topics.
```

---

## 6. Verification: confirm the mobile app shows the change

Run these on **staging** first, then on **prod**.

**1. API returns the new answer (app surface):**
```bash
curl -s "https://<API_HOST>/api/v1/help/faq" \
  | jq -r '.result.items[] | select(.question=="What exactly is BlackNexa?") | .answer'
```
Expected: the §5 text, with line breaks. The call has no `surface` param, the same as the mobile app.

**2. Website surface** (the row is shared, so the website gets the same answer). The website FAQ runs line breaks together into one paragraph until the website team adds `whitespace-pre-line` in `blacknexa-website/src/components/sections/faq-accordion.tsx:33`:
```bash
curl -s "https://<API_HOST>/api/v1/help/faq?surface=website" \
  | jq -r '.result.items[] | select(.question=="What exactly is BlackNexa?") | .answer'
```

**3. In the app (TestFlight build pointing at that environment):**
- **Fully close and reopen the app.** The Help screen caches the FAQ in memory for 30 minutes.
- Profile → Help & FAQ → **General** → open **"What exactly is BlackNexa?"**
- Check: the new text appears, paragraphs and `•` bullets are on separate lines, the screen scrolls to the "Still stuck?" card, and search finds words from the new answer (e.g. "Pocket Recorder").

**4. Nothing else changed:** the other General questions ("Does BlackNexa provide legal advice?", "Which countries does it work in?", "How is the news verified?") are still present and in the same order.

---

## 7. Definition of done

- [x] Copy and surfaces decided (long version, app and website)
- [x] Task 2 seed file updated
- [x] Task 3 share page updated
- [ ] Branch reviewed, merged and deployed to **staging**
- [ ] Task 1 (`db:sync:faq-answers`) run on **staging**; §6 checks 1–4 pass
- [ ] Deployed to **prod**; Task 1 run on **prod**; §6 checks 1–4 pass
- [ ] A shared news link shows the new trademark line
- [ ] No `--reset` run on any shared database

