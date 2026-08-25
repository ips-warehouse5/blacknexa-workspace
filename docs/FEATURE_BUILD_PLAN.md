# BlackNexa — Feature Build Plan
### Working software for auth, onboarding, profile and the report module

**Companion to** [`DESIGN_IMPLEMENTATION_PLAN.md`](./DESIGN_IMPLEMENTATION_PLAN.md). That document says what every screen looks like and how it behaves. **This one says what has to exist for those screens to actually work** — data, contracts, rules, delivery channels, and the pieces the design never draws.

**Feature source of truth:** the design (`BlackNexa Screens.dc.html`, sections SYSTEM / A / B / C / D). Where the design is silent, this document states a derived rule and marks it `DERIVED` so it can be reviewed rather than absorbed silently.
**Written:** 2026-08-22

---

## 1. Two things that change the shape of the work

### 1.1 "Anonymous" means published without your name — not filed without an account

This is the most consequential sentence in the design, and it is easy to read the wrong way. C9 states it plainly: *"Anyone in the community feed, without your name or photo. **Moderators can still see who filed it.**"* A9 and C6 say the same thing from the other side.

So anonymity is a **display property of a report**, not an authentication mode. Every report has a real owner. That has direct consequences:

- **Reports now require authentication.** Today `geo_legal.route.ts` deliberately leaves the write routes open, with the comment *"a reporter documenting an incident must not be blocked by a sign-in wall."* The design overrides that: the feed sits behind auth, reports have owners, drafts are per-user, D2 exists, and the Vault lists "my reports". Attach `userAuthGuard` to the report write routes.
- That is a **deliberate product change** from the current backend's stated intent. If the ability to file with no account matters to you, say so now — it is a different data model (claim-later tokens), not a flag.
- `user_id` must never appear in any API response. Anonymity is enforced in the projection layer, and the owner is resolved from the token, never from the body.

### 1.2 Without a moderator, half of the design is dead UI

The design leans hard on a review process it never draws. `Submitted → Under review → Verified` appears in the C9 receipt stepper, the D2 timeline, the D1 `VERIFIED` badge, the D3 trust sheet (*"Verified by a moderator"*), the B1 feed badge, the B2 "Verified only" filter, and the first of A11's four notification types. D2 gates dispatch on it: *"Because this report is verified, you can dispatch it…"*

**Nothing in sections A–D shows who does the verifying.** Build the app exactly as drawn and every report sits at `submitted` forever: the stepper never advances, the timeline has one node, the verified filter returns nothing, and one of the four promised notifications never fires.

A moderator surface is therefore **in scope for "the report module works"**, even though it is not in the design. §9 specifies the minimum.

---

## 2. Definition of done

Each module is done when this walkthrough passes on a **physical iPhone and a physical Android device**, against a deployed backend — not on a simulator against localhost.

### Auth & onboarding
1. Fresh install → splash → three intro slides → location priming → decline → Welcome.
2. Continue with email → set password → agree to both documents (each unlocking only after its own scroll) → **receive a real code by email** → auto-submit on the sixth digit → set profile → notification priming → coach marks → feed, authenticated.
3. Force-quit, reopen: still signed in, no splash flash, no re-consent.
4. Access token expires mid-session: the next request refreshes silently and succeeds. Two parallel 401s produce one refresh.
5. Sign out → sign in with Apple → same account resolved by verified email.
6. Wrong password and unknown email produce byte-identical responses.
7. Reset password on device A → device B's next request 401s and lands on Log in; device A stays signed in.
8. Face ID unlocks a stored session on iOS; biometric prompt on Android.

### Profile
9. Change display name, avatar mode, anonymity default, default visibility, default precision, notification switch, language → all persist server-side, survive reinstall, and **change the behaviour of the next report and the next comment**.
10. Vault PIN set on Android (not just iOS) and never written to unencrypted storage.
11. Delete account → reports erased per §7.7, tokens revoked, app returns to Welcome.

### Report — file
12. File a report with four attachments of mixed type (photo, video ~25 MB, audio, PDF) from the camera and the library, over cellular.
13. Progress is per-file and real. Kill the app mid-upload → reopen → the draft and its local files are intact.
14. Airplane mode mid-upload → a failed row with retry → re-enable → retry succeeds without re-picking.
15. Filing yields a case reference, and the receipt lists every file as sealed with a server timestamp.
16. The report appears in the feed, in the Vault, and at `/r/BNX-####`.

### Report — read & act
17. Feed filters, sorts and searches with live counts that match the returned rows. Pull-to-refresh, paginate to the end, cold-open offline shows the cached feed.
18. 1a card renders both variants correctly — with a lead image and without.
19. Stand with, corroborate, comment, reply to a reply (joins the same thread), like, flag → all persist and survive a refresh.
20. Share → the link opens in a browser with a correct preview card, revealing no name and no exact location.
21. Evidence lightbox opens, video plays, the drag-up panel shows captured / sealed / integrity.
22. A moderator verifies the report → the owner receives a push → B3 shows the row → the D2 timeline gains a node → the D1 badge appears → the report matches the "Verified only" filter.

### Non-negotiable
23. No screen shows a spinner with no timeout, no error state with no recovery, and no toast where the design specifies in-place confirmation.
24. Every list has a defined empty, loading and error state.

---

## 3. Where the design stops

| Area | Designed? | Action |
|---|---|---|
| Onboarding & auth (A1–A15) | Yes, complete | Build as drawn |
| Feed (B1–B7) | Yes, complete | Build as drawn, card = option 1a |
| Report wizard (C1–C11) | Yes, complete | Build as drawn |
| Report detail (D1–D12) | Yes, complete | Build as drawn |
| **Profile & settings** | **No** | `DERIVED` — §7. A9, A11, C4 and C6 each set a default that has to live somewhere |
| **Moderator surface** | **No** | `DERIVED` — §9. Without it, §1.2 |
| **Vault** | **No** | `DERIVED` — D2 says deleting "removes it from the feed and from your Vault", so the Vault must at least list my reports and drafts |
| **Edit report** | **No** | D2 has an `Edit report` button and no destination. §6.9 proposes the policy |
| **Dispatch** | Entry point only | D2's `Start a dispatch` button. The existing `DispatchCard` + `/geo-legal/dispatch` cover the mechanics — re-skin, don't rebuild |
| **Nav treatments** | Referenced, missing | The board promises "section J". Absent. `TabBar.dc.html` is locked as drawn |
| Account deletion | No | Required by app-store policy and by GDPR. §7.7 |

The four `DERIVED` areas are where I need review most, because I am inventing behaviour rather than reading it.

---

## 4. Platform dependencies

Nothing below is optional. Each row is a thing that must be provisioned or a module silently cannot work.

| Service | Needed for | Status today | Action |
|---|---|---|---|
| PostgreSQL 15+ | Everything | Configured | — |
| `pg_trgm` extension | B6 "Did you mean" | Not enabled | Migration: `CREATE EXTENSION` |
| Full-text search | B5 matched-field search | Not present | `tsvector` column + GIN index |
| PostGIS **or** lat/lng + geohash | C4 precision, B2 "Near me", D1 map | Neither | Prefer PostGIS; §6.6 has the fallback |
| **Object storage (S3/R2)** | All evidence | `STORAGE_DRIVER` defaults to `db` | **Becomes mandatory.** Evidence cannot live in Postgres at 25 MB a file |
| **SMTP / email provider** | A8 verify, A13/A14 reset, D9 flag outcome | **Does not exist in `env.config.ts`** | **Hard blocker for auth.** Sign-up cannot complete without it |
| **Push (Expo Push)** | A11's four notification types, B3 | Does not exist | **Hard blocker for notifications** |
| Universal / app links | D10 share links opening in-app | Not configured | `apple-app-site-association` + `assetlinks.json` on the site origin |
| A real API base URL in the app | Everything | App points at `EXPO_PUBLIC_RORK_FUNCTIONS_URL` | Add `EXPO_PUBLIC_API_URL` |

### 4.1 Environment additions

`env.config.ts` fails fast on a Joi schema — extend it in the same style so a missing value aborts the boot rather than surfacing as a 500 during sign-up.

```
MAX_UPLOAD_BYTES            10 MB → 64 MB      C5 shows a 24.8 MB video
STORAGE_DRIVER              db → s3 (required when reports are enabled)

SMTP_HOST / _PORT / _USER / _PASSWORD / _SECURE
MAIL_FROM                   "BlackNexa <no-reply@blacknexa.org>"
MAIL_REPLY_TO
OTP_TTL_SECONDS             900          A13 copy promises fifteen minutes
OTP_MAX_ATTEMPTS            5
OTP_RESEND_COOLDOWN_SECONDS 30           A8 counts down from 0:24

EXPO_ACCESS_TOKEN           push delivery
PUSH_ENABLED                boolean

APPLE_BUNDLE_ID / APPLE_TEAM_ID / APPLE_SERVICE_ID / APPLE_KEY_ID / APPLE_PRIVATE_KEY
GOOGLE_IOS_CLIENT_ID / GOOGLE_ANDROID_CLIENT_ID / GOOGLE_WEB_CLIENT_ID

REPORT_EVIDENCE_RETENTION_DAYS  30       D2: "destroyed after 30 days"
MODERATION_URGENT_SLA_MINUTES   60       C6: "within the hour"
```

Mirror the existing conditional-requirement pattern: `STORAGE_DRIVER=s3` already demands the three S3 values; add "reports enabled demands SMTP" the same way.

### 4.2 Social sign-in — drop the Rork dependency

A5 offers Apple and Google. Today those run through an external Rork OAuth host (`EXPO_PUBLIC_RORK_AUTH_URL`), which means a third party holds the identity and our backend never sees it — incompatible with a report having an owner in *our* database.

`DERIVED` **Do it natively.** `expo-apple-authentication` and `expo-auth-session` on the client; the server verifies the identity token against Apple's and Google's JWKS, then resolves or creates an `app_users` row keyed on the verified email. Apple's private-relay addresses must be accepted, and Apple only returns the name on first authorisation — persist it then or lose it.

---

## 5. Data model

Grouped by concern. Types elided where obvious; `id` is UUID unless noted.

### Identity
| Table | Purpose | Key columns |
|---|---|---|
| `app_users` | The account | `email` unique, `email_verified_at`, `password_hash` nullable (social-only accounts), `display_name`, `avatar_mode` (`photo`\|`initials`\|`anonymous`), `avatar_key`, `initials`, `role` (`member`\|`advocate`\|`moderator`), `status` (`active`\|`suspended`\|`deleted`), `deleted_at` |
| `user_prefs` | One row per user | `anonymous_by_default`, `default_visibility`, `default_precision`, `notifications_enabled`, `language`, `hide_urgent` — always false, see §8.3 |
| `user_sessions` | One row **per device** | `refresh_jti`, `device_label`, `platform`, `push_token`, `last_seen_at`, `revoked_at`. Replaces `admin_users.refresh_token_id`'s single-session shape |
| `user_identities` | Social links | `provider` (`apple`\|`google`), `provider_subject` unique per provider |
| `email_otps` | A8, A14 | `purpose` (`verify_email`\|`reset_password`), `code_hash`, `expires_at`, `attempts`, `consumed_at` |
| `password_history` | A14's "not a password you have used here before" | `password_hash`, `created_on`. Keep the last 5 |
| `user_consents` | A7 | `document` (`tos`\|`privacy`), `version`, `agreed_at`, `ip_hash`, `user_agent` |

### Reports
| Table | Purpose |
|---|---|
| `reports` | The filed report. Full column list in the design plan §4.3 |
| `report_drafts` | Server-side mirror of the local draft: `step`, `payload_json`, `updated_at` |
| `report_evidence` | One row per file: `kind`, `mime`, `bytes`, `duration_ms`, `storage_key`, `thumb_key`, `sha256`, `captured_at`, `sealed_at`, `upload_state`, `sort_order` |
| `report_status_events` | Append-only. `status`, `actor_kind` (`system`\|`moderator`\|`owner`), `actor_id`, `note`, `at`. **This table is the D2 timeline and the source of every status notification** |
| `report_share_links` | `token`, `created_by`, `revoked_at` |

### Social
| Table | Notes |
|---|---|
| `report_supports` | Unique `(report_id, user_id)`. Stand with |
| `report_corroborations` | Unique pair, plus an optional `note` and optional own evidence — the last one unlocks "very strong", §6.7 |
| `report_comments` | `parent_id` null or a **root** comment only (§6.8), `anonymous`, `body`, `like_count`, `status` (`visible`\|`hidden`\|`removed`) |
| `comment_likes` | Unique pair |
| `report_flags` | `flag_ref` `FLG-####`, targets a report **or** a comment, `reason`, `note`, `status`, `resolution` |
| `report_hides` | D9's "hide this report from my feed" |
| `report_views` | Rolled up per report per day. Never one row per view |

### Delivery
| Table | Notes |
|---|---|
| `notifications` | `type` (the four from A11), `payload_json`, `read_at`, `pushed_at` |
| `outbound_emails` | Send log for support and deliverability debugging. No message bodies |

### Counters
`support_count`, `comment_count`, `corroboration_count` and `view_count` live denormalised on `reports` because B1 and the sort orders read them on every page. Maintain them in the same transaction as the row they count, and add a nightly reconciliation job — drifted counters are the classic bug here and the feed sort makes them visible.

---

## 6. Business rules

The design states most of these in copy. Where it doesn't, the rule is marked `DERIVED`.

### 6.1 Report status machine

```
        ┌──── file() ────┐
draft ──┤                ├──> submitted ──> under_review ──┬──> verified
        └── discard() ───┘         │                       └──> dismissed
                                   └── (urgent) priority queue, 60-min SLA
```

- The only statuses that exist are the four A11 names plus `draft`. Do not invent `needs_info` without a design for it.
- `submitted → under_review` on first moderator open, or automatically after a configurable delay so the stepper is never stuck for a queue that is simply busy.
- `verified` and `dismissed` are terminal for the review cycle. An owner edit re-opens it (§6.9).
- **Every transition writes a `report_status_events` row and emits a `status_change` notification.** No exceptions — that is the contract D2 and B3 both depend on.
- `urgent` does not change the machine, only the queue order and the SLA clock.

### 6.2 Draft lifecycle

Local-first, because C1–C7 show "Draft saved · 9:41 PM" in the header and that must be honest offline.

- Every field change writes locally, debounced 400 ms. The header timestamp reflects the **local** write.
- A background sync pushes to `/reports/drafts`. A step transition never waits on the network.
- One active draft per user is enough for C10's flow, but the Vault should list several — allow N, surface the most recent.
- Local file URIs are held until upload succeeds, because C10 promises a draft keeps "the two files you attached".
- Discard (C11) deletes the local draft, the server draft, and any uploaded-but-uncommitted objects.

### 6.3 Evidence lifecycle

```
picked ──> presigned ──> uploading ──> uploaded ──> sealed
                             │                        ▲
                             └──> failed ──(retry)────┘
```

- `presign` creates the row and returns a URL. `commit` is where **sealing** happens: the server reads the object's SHA-256, compares it to the client's declared value, and **refuses the file on mismatch**. Only then is `sealed_at` stamped.
- That single timestamp is what C5, C9, D3, D11 and D12 all render. There is no client-side seal time.
- `captured_at` comes from the picker's asset metadata where available. D12 shows `Device: Not recorded`, so device is genuinely optional — do not fabricate it.
- Thumbnails are generated server-side on commit. The 1a lead image and the D1 grid both need one, and a 25 MB video must not be downloaded to draw a card.
- EXIF is stripped before the object is durable, and the strip is recorded as `metadata_scrubbed` — `pii_scrubber.service.ts` already exists for this.

### 6.4 Filing is a transaction

C8's copy is a functional requirement: *"There is no way to close this screen — nothing is half-filed."*

- `POST /reports` accepts a draft id and succeeds **only if every attached evidence row is `sealed`**. Any other state → 409 with the offending rows named, and the client returns to the C8 failed state with retry.
- Status, case reference, first status event and the owner notification are one database transaction.
- Idempotent on a client-supplied `Idempotency-Key` — a retry after a timeout must not file twice. The tipping module already uses this header; follow it.

### 6.5 Anonymity

| Surface | `anonymous = true` | `anonymous = false` |
|---|---|---|
| Feed card footer | "Anonymous · 142 standing with…" | Display name |
| D1 author row | Generated avatar tile, no name | Avatar + name |
| D2 (owner) | Owner always sees their own | Same |
| Moderator view | Real identity, always | Real identity |
| API payload | No `user_id`, no `display_name` | `display_name` only |
| Comments | Per-comment (D4's composer switch), independent of the report's setting | Same |

Anonymity is per-artefact and immutable after publication. A report filed anonymously cannot be de-anonymised later, and vice versa — otherwise the author row changes under readers who already saw it.

### 6.6 Location precision

| Choice | Stored | Served to a viewer | Map on C4/D1 |
|---|---|---|---|
| Exact | exact coords, sealed | rounded to ~100 m | pin |
| Approximate | exact sealed + public point rounded to ~500 m | the rounded point + a label | soft radius, no pin |
| Hidden | exact sealed only | area label only, no coordinates | blurred + lock |

The exact value is sealed at rest and released only to the owner and moderators. **Round on write, not on read** — a rounding bug in a read path leaks a home address, and a rounded value that was never stored cannot leak.

Without PostGIS: store `lat`/`lng` numeric plus a truncated `geohash` for "Near me", and do radius filtering with a bounding box then a Haversine refinement. Correct, and one less operational dependency.

### 6.7 Evidence strength `DERIVED`

The design shows the outcome (D1 "Strong", D3's four-step scale) and one justification sentence, but no formula. Proposed, calibrated so the design's own example lands on **Strong**:

```
files          0 → 0    1 → 1    2–3 → 2    4+ → 3
proximity      >24h or unknown → 0    ≤24h → 1    ≤60min → 2
media kinds    1 → 0    ≥2 → 1
corroborations 0 → 0    1–4 → 1    5+ → 2
≥2 distinct capture devices  → +1
                                              max 9

thin 0–2   ·   fair 3–5   ·   strong 6–9
very strong = strong AND ≥1 corroborator who attached their own evidence
```

D3's example — four files, two devices, captured within nine minutes, corroborated by twelve people — scores 3+2+1+2+1 = 9 → **Strong**, matching the artboard. The top band is reserved for an independent second source, which that example lacks. **Compute server-side only**; scoring it on the client (as `constants/credibility.ts` does today) lets D1's badge and D3's scale disagree and lets either be spoofed.

### 6.8 Comments

- Two levels. `parent_id` is null or points at a root comment; a third level is a 422, because D4 says a reply to a reply joins the same thread.
- Sort `top` = like count then recency; `new` = recency.
- **No public profiles.** D4 says author names are deliberately not links, so there is no "get user by id" endpoint for anyone but yourself. Do not add one for convenience.
- `moderation.service.ts` screens the body on create; a fail returns a specific message, not a silent drop.

### 6.9 Editing after submission `DERIVED`

D2 has an `Edit report` button and the design has no edit screens. Sealed evidence cannot change without voiding every integrity claim on D3, D11 and D12.

Proposed: **title and body only**, evidence is append-only, and no field that a reader has already relied on can change silently.
- Editing a `verified` report returns it to `under_review` and clears the badge, with an `edited` event on the trust timeline.
- Location precision may be narrowed (more private) but never widened.
- Visibility may be narrowed; widening private → public requires a fresh review.
- Deleting evidence is not possible. D2's Delete is the escape hatch, and it deletes the whole report.

Reuse the wizard in `mode="edit"` with a restricted field set rather than building new screens.

### 6.10 Deletion & retention

D2 states it: *"Deleting removes it from the feed and from your Vault. Sealed files are destroyed after 30 days."*

- Delete → the report leaves every read path immediately, and objects are scheduled for destruction at +30 days.
- The 30-day window is deliberate: it covers an accidental deletion and a moderation dispute. Say so in the UI copy, which the design already does.
- Existing `DELETE /geo-legal/incident/:id` is a genuine hard delete because its response promises erasure. Keep that semantic for **account** deletion; report deletion uses the 30-day path the design describes. Two different promises, two different mechanisms — do not merge them.

### 6.11 Rate limits

The tiers exist (`readLimiter`, `writeLimiter`, `authLimiter` at 8/window). Additions:
- `auth/login`, `password/forgot`, `resend-code`: per-IP **and** per-email-hash, so one address cannot be targeted from many IPs.
- `resend-code` must also respect the per-OTP cooldown, or A8's countdown is decorative.
- `POST /reports`: low, and idempotency-keyed.
- `evidence/presign`: bounded per report, or presign becomes free storage.
- Support, corroborate, like: per-user per-target, naturally bounded by uniqueness but still worth a limiter to stop toggle-spam.

---

## 7. Profile & settings `DERIVED`

Not designed. But A9, A11, C4, C6 and D4 each establish a default that has to live somewhere, and D2 references a Vault. The module's contents are therefore determined even though its screens are not.

### 7.1 What it must hold

| Setting | Established by | Effect |
|---|---|---|
| Display name | A9 | Author row when not anonymous |
| Avatar mode — photo / initials / anonymous | A9 | Author row, feed footer |
| Stay anonymous by default | A9 | Pre-fills C6 and D4's composer switch |
| Default visibility | A9 (recommends Trusted Circle) | Pre-fills C6 |
| Default location precision | C4 (`YOUR DEFAULT`, not pre-ticked) | Labels C4's choice |
| Notifications | A11 | **One switch, not four.** A11 is explicit |
| Language | existing `preferredLanguage` | News translation |
| Vault PIN | existing | Evidence sealing — see §10.1 |
| Biometric unlock | A10's Face ID | Session unlock |

### 7.2 Screens to build from the system

Design them from the SYSTEM artboard's primitives, then get a review pass — do not improvise a new visual language:
- **Profile** — header (avatar, display name, member since), "My reports" count linking to the Vault, then grouped settings rows.
- **Edit identity** — avatar mode, display name, and the same live author-row preview A9 uses. Reuse A9's component; it already exists by then.
- **Defaults** — visibility, precision, anonymity, using C6's and C4's own card and segment components.
- **Notifications** — one switch, plus A11's four descriptive rows shown read-only so the copy stays honest about what arrives.
- **Security** — biometric unlock, vault PIN, active sessions with revoke (this is where A15's "every other device" becomes visible and manageable).
- **Legal** — Terms, Privacy, consent record with version and date. `app/legal/*` exists; re-skin.
- **Account** — export data, sign out, delete account.

### 7.3 Sessions list

`user_sessions` makes this nearly free, and it is the natural home for A15's promise. Show device label, platform, last seen, and a revoke action. "Sign out everywhere" is the same call the reset path uses.

### 7.4 Two fixes that belong here

- `app/(tabs)/profile.tsx` edits the display name and the vault PIN via **`Alert.prompt`, which is iOS-only** — both features are silently dead on Android. Real screens replace them.
- Sign out currently clears the consent flags and routes to onboarding. It does not revoke a token or clear a session. Replace with a real `POST /auth/logout`.

### 7.5 Vault

Minimum, because D2's copy references it: my filed reports grouped by status, my drafts with a resume action, and my private reports. It is a filtered view of `/reports?mine=true` plus the local draft store — not a new subsystem.

### 7.6 Consent record

A7 collects two agreements against a version. Store each acceptance with document, version, timestamp and a hashed IP. When `LEGAL_VERSION` increments, prompt for re-acceptance on next launch — the existing `ConsentGate` had this instinct; keep the mechanism, move the UI into A7's design.

### 7.7 Account deletion

Required by both app stores and by GDPR, and not in the design.
- In-app, reachable in ≤3 taps from Profile, with a typed confirmation.
- Deletes the account, sessions, prefs, drafts, comments and flags.
- Reports the user filed: **owner's choice at delete time** — erase them, or keep them as anonymous community record with the identity link severed. That is a product decision; the second option preserves the community value the app exists for, so default to offering it. Erasure must be genuine either way.

---

## 8. Notifications

A11 promises four types and no more. That promise is the spec.

### 8.1 The four types

| Type | Trigger | Suppressible |
|---|---|---|
| `status_change` | any `report_status_events` insert on a report you own | yes |
| `corroboration_or_reply` | a corroboration, or a comment on a report you filed or commented on | yes |
| `dispatch_ready` | a dispatch completes — **sent once, when every recipient has it**, per A11 | yes |
| `urgent_safety` | a moderator broadcasts to an area | **no** |

A11: *"Rare, and for your area only. These cannot be turned off."* Enforce the exemption in the dispatcher, server-side. A client-side check is not an enforcement.

Also from A11: *"No digests, no marketing, no engagement nudges."* No "someone viewed your report", no re-engagement, no streaks. Treat any future request for one as a change to the promise, not a feature.

### 8.2 Delivery

Expo Push for both platforms — one token type, one sender, and it works with the existing Expo build pipeline. Register the token on A11 acceptance and on every launch (tokens rotate), store it on `user_sessions` so revoking a session also stops its pushes.

Every push carries a deep link to its destination: a status change opens D2, a reply opens D4 anchored on the comment. A notification that opens the feed and makes the reader hunt is a failed notification.

### 8.3 In-app

B3 reads the `notifications` table, not the push history — pushes are lossy and B3 must be complete. Unread is `read_at IS NULL`, which drives the header dot on B1. `read-all` is one call, per B3's "Mark all read".

---

## 9. Moderator surface `DERIVED`

Per §1.2, this is what makes the report module function. Keep it minimal and internal.

**Reuse what exists:** `admin_users`, `admin_auth`, `adminAuthGuard`, `checkRole`. Add `moderator` to the recognised roles.

### API
```
GET   /api/v1/admin/reports?status=&urgent=&flagged=&cursor=   queue, urgent first
GET   /api/v1/admin/reports/:id                                full detail, identity visible
POST  /api/v1/admin/reports/:id/status   { status, note }       drives §6.1
GET   /api/v1/admin/reports/:id/evidence/:eid/url              presigned read
GET   /api/v1/admin/flags?status=                              flag queue
POST  /api/v1/admin/flags/:id/resolve    { resolution, note }
POST  /api/v1/admin/comments/:id/hide
POST  /api/v1/admin/broadcast            { area, message }     urgent_safety
GET   /api/v1/admin/moderation/stats                           SLA against the 60-min target
```

### UI
A thin server-rendered internal page is enough for v1 — queue, detail, four buttons, flag list. The backend already server-renders `/news/:slug` through `seo.controller.ts`, so the pattern exists. **Do not build a full admin SPA for this phase**; build the API properly and the smallest usable surface on top.

### Rules
- Every action writes an audit row with the moderator id. A verification with no attributable actor is worthless in a dispute.
- A moderator cannot moderate their own report.
- Urgent reports sort first and the SLA clock starts at `submitted`.

---

## 10. Security items found in the current code

Not design gaps — existing defects that this work should not carry forward.

### 10.1 The vault PIN is stored in plaintext
`SettingsProvider` persists `vaultPin: string` into **AsyncStorage**, which is unencrypted. The UI copy claims *"Neither BlackNexa nor any server can decrypt without this PIN."* With the PIN sitting beside the data, that claim is false.
**Fix:** never persist the PIN. Derive the key, hold it in memory for the session, and gate re-entry with biometrics. If it must persist, `expo-secure-store` only, and revise the copy to match what is actually true.

### 10.2 Report write routes are unauthenticated
Correct for today's anonymous-filing model, wrong for the design's owned-report model (§1.1). Attach `userAuthGuard`.

### 10.3 `MAX_UPLOAD_BYTES` is 10 MB
C5 shows a 24.8 MB video. Raise it, and enforce a per-report total as well as a per-file cap.

### 10.4 Status bar and appearance mismatch
`app.json` is `userInterfaceStyle: "automatic"` while `_layout.tsx` renders `<StatusBar style="light" />`. On the new white header those glyphs are invisible. Lock to light, render dark glyphs.

### 10.5 Sign out does not sign out
§7.4. It clears consent flags and navigates.

---

## 11. Sharing & the public web surface

D10 shows a link preview card for `blacknexa.org/r/BNX-4471`, which requires a real public page with Open Graph tags.

- `GET /r/:caseRef` server-renders the report: title, body, evidence thumbnails, comments, and the verified badge — *"the same public page you are reading"*.
- It must reveal **no author name, no exact location, and no indication of who shared it**, exactly as D10's "what a recipient sees" card promises. That card is a contract with the user.
- Private and Trusted-Circle reports 404 here rather than 403 — a 403 confirms the report exists.
- Universal links so the app opens it directly when installed.
- `seo.controller.ts` and `seo.service.ts` already do this for articles. Extend, don't duplicate.

---

## 12. API conventions

Match what exists so the surface stays coherent.

- **Envelope:** `{ success: true, ...data }` / `{ success: false, message }` via `legacyJson` / `legacyError`.
- **Auth:** `Authorization: Bearer <access>`. `userAuthGuard` for member routes, `adminAuthGuard` + `checkRole` for moderator routes, `optionalAuth` where a response is richer for a known caller (the public share page).
- **Pagination:** opaque cursor, `{ items, nextCursor }`. Never offset for the feed.
- **Idempotency:** `Idempotency-Key` on `POST /reports` and on evidence commit, following the tipping module.
- **Validation:** Joi via `validate("reports.create")`, registered in `validations/index.ts`.
- **Errors:** one human-readable sentence, no stack, no field echo for anything sensitive. Auth errors are deliberately uninformative (§2, items 6–7).
- **Versioning:** everything under `/api/v1`. Deprecated geo-legal incident paths stay mounted for one release and are marked in `ROUTE_MANIFEST`.

---

## 13. Phasing with demoable milestones

Revised from the design plan to include the functional work. Each phase ends in something you can show a stakeholder.

| Phase | Build | Demo at the end | Size |
|---|---|---|---|
| **0 · Foundations** | Tokens, fonts, UI primitives, safe-area + keyboard infra, tab bar, API client with refresh mutex, `EXPO_PUBLIC_API_URL`. Backend: env additions, migrations scaffold, extensions, S3 wired, mailer, push sender | A styled shell that boots against the real backend; a test email and a test push both arrive | 8–10 d |
| **1 · Auth** | A1–A15, native Apple/Google, sessions, OTP, consents, `/auth/*`, `/users/me` | Install → sign up with a real emailed code → sign out → sign in → reset password and watch device B drop | 12–16 d |
| **2 · Profile** | §7 screens, prefs, sessions list, Vault v1, account deletion | Change a default and watch the next report inherit it; revoke a session from device A and see device B log out | 6–8 d |
| **3 · Wizard** | C1–C11, reports migration, drafts, filing transaction, presigned evidence with seal-on-arrival, thumbnails, case refs | File a real report with a 25 MB video over cellular, kill the app mid-upload, resume, get a receipt | 14–18 d |
| **4 · Moderation** | §9 API + thin internal page, status machine, notification dispatcher | Verify a report from the internal page and watch the push land, the timeline advance and the badge appear on the phone | 5–7 d |
| **5 · Feed** | B1–B7, feed + facets + search + suggestions, 1a card both variants, notification centre | Filter, sort, search, paginate, go offline and still see the feed | 9–12 d |
| **6 · Detail** | D1–D12, projections, trust payload, support/corroborate, comments, flags, share links + the public page, lightbox, evidence strength | Full read-and-act loop, and a shared link previewing correctly in a messaging app | 13–17 d |
| **7 · Hardening** | Device matrix, a11y, offline, reduced motion, overlay QA on all 51 artboards, §10 fixes verified, load test on the feed | The definition-of-done walkthrough, start to finish, on both devices | 8–11 d |

**Total ≈ 75–99 developer-days**, one backend plus one to two mobile developers, excluding design QA and the design pass needed for the four `DERIVED` areas.

Moderation deliberately precedes the feed and the detail view: without it, phases 5 and 6 cannot be demonstrated or tested against anything but hand-edited database rows.

---

## 14. Test & acceptance

| Layer | Coverage |
|---|---|
| Unit — backend | Evidence-strength scoring against D3's worked example, status-machine transitions (including illegal ones), projection functions per §6.5 and §6.6, OTP lifecycle, case-reference sequence |
| Unit — mobile | Wizard validation and scroll-to-first-error, draft reducer, upload state machine, 1a variant selection |
| Integration | Full filing transaction including the partial-evidence 409, refresh-token rotation and replay rejection, reset revoking other sessions, facet counts matching returned rows |
| **Security** | The §2 items 6 and 7 assertions as executable tests: identical login responses, identical forgot-password responses, no `user_id` in any payload, anonymous report leaks no identity, hidden location returns no coordinates, private report 404s on the public page |
| E2E | Maestro or Detox over the §2 walkthrough |
| Device matrix | iPhone SE (375×667), iPhone 15 (390×844), iPhone 15 Pro Max (430×932), a mid-range Android with a punch-hole camera, and one Android 15 device for edge-to-edge |
| Load | Feed at 100k reports: facet queries and keyset pagination both under 200 ms |

The security block is not optional and not a phase-7 item — those assertions are the difference between a privacy-first app and an app that says it is one.

---

## 15. Local runbook

What a developer needs to get the whole stack up, which does not exist today.

```
# backend
cp .env.example .env          # extend .env.example with §4.1
docker compose up -d          # postgres + minio, to be added
npm run db:migrate            # migrations, replacing DB_SYNC
npm run db:seed               # admin + moderator + 3 users + ~30 reports across 9 categories
npm run dev

# mobile
cp .env.example .env          # EXPO_PUBLIC_API_URL
bun install
bun start
```

Three things to add that are missing and will otherwise cost every developer a day:
- **`docker-compose.yml`** with Postgres (+ extensions) and MinIO, so S3 works locally without an AWS account.
- **A real migration runner.** `DB_SYNC` is already banned in production by the env validator, so migrations are the only path — but none exist yet.
- **A seed that produces a usable feed.** Reports across all nine categories, mixed evidence, some verified, some urgent, some anonymous, some with no lead image so the 1a text-first variant is exercised on every run.

---

## 16. What I need from you

1. **Review the four `DERIVED` areas** — profile (§7), moderation (§9), edit policy (§6.9), evidence-strength formula (§6.7). These are the places I am inventing product behaviour.
2. **Confirm §1.1** — reports require an account. If filing without one matters, it changes the data model.
3. **Provision or name the providers** — SMTP, S3/R2, and the push setup. Auth cannot be demonstrated without email.
4. **Section J**, if it exists.
5. **Account-deletion policy** (§7.7) — erase the user's reports, or keep them as severed anonymous record.
