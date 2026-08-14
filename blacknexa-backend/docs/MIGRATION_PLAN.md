# BlackNexa Backend — Cloudflare Worker → Node.js / Express / TypeScript

Transformation plan and record of decisions. Source: `rork-blacknexa/functions/`
(Cloudflare Worker + 2 Durable Objects, ~15.1k LOC). Target: `blacknexa-backend/`
(Express 5 + TypeScript + Sequelize/PostgreSQL).

---

## 1. What the old backend is

| Piece | Role |
|---|---|
| `index.ts` (480 LOC) | Worker entry. URL-string routing, CORS `*`, proxies to two DOs, serves SEO/syndication. |
| `news-store.ts` (1562) | `NewsStore` DO, `id="global"`. Owns articles + images + audio + translations in DO-SQLite. Runs the AI generation pipeline. Self-arms a daily alarm at 06:00 UTC. |
| `platform-store.ts` (929) | `PlatformStore` DO, `id="global"`. Tipping ledger, payouts, cache, job queue, moderation, ToS, enterprise engine, persistence snapshots, WebSocket live chat. 60-second maintenance alarm. |
| `_lib/geo-legal/*` (5896) | Jurisdiction DB (19 countries, 3862 LOC of curated data), AI resolver, compliance validator, PII scrubber, AES-256-GCM re-encryption, incident store. |
| `_lib/platform/*` (3319) | SQL-backed modules for the PlatformStore DO. |
| `_lib/*` (2228) | AI gateway calls (Exa search + Gemini synthesis + image + TTS), i18n/translation, local-feed ranking, SEO builders, RSS/JSON-LD/podcast, seed data, daily prompt rotation. |

Everything is function-based: no classes beyond the two DO classes, no
validation layer, no auth, no rate limiting, response shapes hand-built per route.

## 2. Target architecture

```
src/
  config/       env fail-fast (Joi), sequelize instance, CORS allowlist, constants
  models/       23 Sequelize models + associations
  types/        *.interface.ts — model attrs, DTOs, filters, response payloads
  services/     class singletons — all business logic + ORM queries
  controllers/  class singletons — req/res only, try/catch, delegate, respond
  routes/       route definitions + guards + validators, no logic
  middlewares/  auth, rbac, joi validate, rate limits, logUrl, sanitize, error, upload
  validations/  Joi schema registry keyed by name for validate('name')
  data/         static/curated data ported verbatim from the Worker
  jobs/         node-cron replacements for the DO alarms
  utils/        responseData, responseMessage, logger, hash, slug, base64, http
  websocket/    live-chat hub (ws) replacing WebSocketPair
```

Naming: `<entity>.model.ts`, `<entity>.service.ts`, `<entity>.controller.ts`,
`<entity>.route.ts`, `<entity>.interface.ts`. Services and controllers export
lowerCamelCase singleton instances.

## 3. Runtime primitive mapping

| Cloudflare | Node/Express |
|---|---|
| `export default { fetch }` + string matching | Express 5 router tree |
| Durable Object SQLite (`ctx.storage.sql.exec`) | Sequelize + PostgreSQL (parameterised, never interpolated) |
| DO singleton `id="global"` | Single Postgres schema; no partitioning needed |
| `ctx.waitUntil(p)` | `runBackground(p)` — detached promise with logged rejection |
| DO alarms (`setAlarm`/`onAlarm`) | `node-cron`: `0 6 * * *` daily batch, `* * * * *` platform maintenance |
| `WebSocketPair` + `server.accept()` | `ws` server attached to the same HTTP server at `/api/v1/blacknexa/live-chat` |
| `Response.json()` | `res.status().json()` |
| `atob` / `btoa` | `Buffer.from(x, 'base64')` / `.toString('base64')` |
| `crypto.subtle` (PBKDF2 + AES-GCM) | `node:crypto` webcrypto — identical algorithm, identical output format |
| `Fetcher` DO-to-DO calls | direct service calls (no HTTP hop) |
| Worker wall-clock limits driving `limit=4` batch slices | limits kept as defaults so behaviour is unchanged, but no hard ceiling |

`fetch`, `AbortController`, `crypto.subtle` are all native on Node 24, so the AI
gateway modules port nearly verbatim.

## 4. Schema map — DO SQLite → PostgreSQL

23 tables. `A` = ported from NewsStore, `B` = PlatformStore, `C` = new.

| Table | Model file | PK | Notes |
|---|---|---|---|
| `articles` | `article.model.ts` | `id` TEXT | A. `content_hash` column kept; the one-time migration is now a real migration path. |
| `article_images` | `article_image.model.ts` | `article_id` | A. base64 → `BYTEA`. |
| `article_audio` | `article_audio.model.ts` | `article_id` | A. base64 → `BYTEA`. |
| `article_translations` | `article_translation.model.ts` | `(article_id, language)` | A. |
| `jurisdiction_cache` | `jurisdiction_cache.model.ts` | `country_code` | A. `profile_json` → `JSONB`. |
| `legal_translations` | `legal_translation.model.ts` | `(country_code, language)` | A. `JSONB`. |
| `incidents` | `incident.model.ts` | `id` TEXT | A. **not paranoid** — GDPR erasure must hard-delete. |
| `evidence_packages` | `evidence_package.model.ts` | `id` TEXT | A. cascade from incident. |
| `dispatch_audit` | `dispatch_audit.model.ts` | `id` TEXT | A. |
| `platform_cache` | `platform_cache.model.ts` | `key` | B. TTL cache. |
| `creators` | `creator.model.ts` | `id` TEXT | B. |
| `tips` | `tip.model.ts` | `id` TEXT | B. |
| `ledger` | `ledger_entry.model.ts` | `id` TEXT | B. append-only. |
| `payouts` | `payout.model.ts` | `id` TEXT | B. |
| `idempotency_replay` | `idempotency_replay.model.ts` | `key` | B. `JSONB` response. |
| `job_queue` | `job_queue.model.ts` | `id` TEXT | B. |
| `moderation_log` | `moderation_log.model.ts` | `id` TEXT | B. |
| `tos_agreements` | `tos_agreement.model.ts` | `id` TEXT | B. |
| `enterprise_articles` | `enterprise_article.model.ts` | `id` SERIAL | B. **integer autoincrement is contract** — the app builds `ent-${id}`. |
| `artist_tips` | `artist_tip.model.ts` | `id` SERIAL | B. |
| `hardware_triggers` | `hardware_trigger.model.ts` | `event_id` SERIAL | B. |
| `persistence_snapshots` | `persistence_snapshot.model.ts` | `id` TEXT | B. `JSONB`. |
| `admin_users` | `admin_user.model.ts` | `id` UUID | C. new — backs the JWT/RBAC ops surface. |

### Deviation: UUID primary keys

The spec asks for UUID PKs everywhere. Applied to the new `admin_users` table
(`uuidv4()` via `beforeCreate`). **Not** applied to the 22 ported tables, because
their primary keys are part of the public wire contract and are round-tripped by
the clients:

* `creator_${userId}` is derived **client-side** in `TippingDashboard.tsx` and
  sent back in `GET /platform/tipping/creator/:id/balance`.
* `bn-gen-…`, `tip_…`, `payout_…`, `inc_…`, `audit_…` appear in responses and in
  subsequent request paths.
* `enterprise_articles.id` is an integer the Expo client formats as `ent-${id}`.

Swapping these to UUIDs would break the mobile app, which is the stated hard
constraint. ID generation keeps the exact `prefix_timestamp_random` format.

### Deviation: soft deletes

`paranoid: true` is applied to `articles`, `creators`, `enterprise_articles`, and
`admin_users`. It is deliberately **off** for:

* `incidents` / `evidence_packages` / `dispatch_audit` — `DELETE /geo-legal/incident/:id`
  is advertised to the user as GDPR/CCPA right-to-erasure. A soft delete would be
  a compliance lie. Hard delete retained.
* `platform_cache`, `job_queue`, `idempotency_replay`, `persistence_snapshots` —
  churn tables whose prune paths must actually reclaim rows.
* `tips` / `ledger` — financial records; the ledger is append-only by design and
  is never deleted.

## 5. Endpoint inventory (61 routes)

Every path, method, request shape and response shape is preserved. `✚` marks a
route where the response gained additive fields to fix an existing client break
(section 6). `NEW` marks routes that did not exist.

### News (`/api/v1/news`)
| Method | Path | Handler |
|---|---|---|
| GET | `/feed?category=&scope=&search=&limit=` | `news.controller.feed` |
| GET | `/local?lat=&lng=&city=&region=&country=&countryCode=&nearby=&limit=` | `news.controller.localFeed` |
| GET | `/briefings` | `news.controller.briefings` |
| GET | `/article/:slug` | `news.controller.article` |
| GET | `/image/:articleId` | `media.controller.image` |
| GET | `/audio/:articleId` | `media.controller.audio` — **NEW**, see §6.1 |
| GET | `/translate/:slug?lang=` | `translation.controller.translate` |
| POST | `/generate` | `news.controller.generate` |
| POST | `/refresh-daily?force=1` | `news.controller.refreshDaily` — admin-guarded |
| POST | `/prune-duplicates` | `news.controller.pruneDuplicates` — admin-guarded |
| POST | `/backfill-images?limit=` | `news.controller.backfillImages` — admin-guarded |
| POST | `/backfill-translations?limit=` | `news.controller.backfillTranslations` — admin-guarded |

### Geo-Legal (`/api/v1/geo-legal`)
`GET /regions`, `GET /lookup`, `POST /validate`, `POST /dispatch`,
`POST /incident/create`, `GET /incident/:id`, `DELETE /incident/:id`,
`POST /refresh` (admin-guarded).

### Platform (`/api/v1/platform`)
`GET /ping`; news: `GET /news/feed|/news/categories|/news/locales`;
tipping: `POST /tipping/creator/register`, `GET /tipping/creator/:id`,
`GET /tipping/creators`, `POST /tipping/send`, `GET /tipping/tip/:id`,
`GET /tipping/creator/:id/tips|/balance|/ledger|/payouts`,
`GET /tipping/sender/:userId/tips`, `POST /tipping/webhook/stripe`,
`GET /tipping/fees`, `POST /tipping/payout/request`, `GET /tipping/payout/:id`,
`POST /tipping/payout/:id/status` (admin-guarded);
ops: `GET /cache/stats`, `POST /cache/prune`, `GET /queue/stats`,
`POST /queue/drain`, `POST /queue/prune` (admin-guarded);
compliance: `POST /moderation/check`, `POST /tos/agree`, `GET /tos/check`,
`GET /tos/text`, `GET /compliance/disclaimer`, `GET /compliance/status`;
persistence: `GET /persistence/snapshot`, `POST /persistence/restore`,
`GET /persistence/integrity`, `GET /persistence/snapshots` (admin-guarded).

### Enterprise (`/api/v1/blacknexa`)
`GET /categories`, `POST /generate-story`, `POST /publish-verified-story` ✚,
`GET /feed`, `POST /artists/tip` ✚, `POST /hardware/beacon-trigger` ✚,
`GET /weather` ✚, `GET /stats`, `GET /live-chat` (WebSocket upgrade).

### Root / SEO
`GET /ping`, `GET /robots.txt`, `GET /blacknexanews2026indexnowkey.txt`,
`GET /rss.xml`, `GET /sitemap.xml`, `GET /sitemap-news.xml`,
`GET /sitemap-index.xml`, `GET /news/:slug` (server-rendered HTML),
`GET /api/v1/news/:slug/schema.json`, `GET /api/v1/podcast/feed.json`.

### New (additive, admin only)
`POST /api/v1/admin/auth/login`, `POST /api/v1/admin/auth/refresh`,
`POST /api/v1/admin/auth/logout`, `GET /api/v1/admin/auth/me`.

## 6. Contract deltas — bugs found in the current backend

These are cases where the Worker and the shipped clients already disagree. Each
is fixed **server-side only**, additively, so no mobile change is needed.

### 6.1 `GET /api/v1/news/audio/:articleId` is unreachable
`NewsStore` implements `/audio/:id` and rewrites every article's `audioUrl` to
`{origin}/api/v1/news/audio/{id}`, but `index.ts` has no route for that prefix —
only `/image/`. So the app receives an audio URL that 404s
(`app/news/[id].tsx:253` checks for exactly this path) and silently falls back to
device TTS. **Fix:** route registered.

### 6.2 `POST /api/v1/blacknexa/artists/tip`
`ArtistTippingSheet.tsx:65` sends **query params, snake_case, empty body**
(`artist_id`, `supporter_user_id`, `tip_amount_usd`, `message`). The Worker does
`await request.json()` on an empty body → throws → 500. Client also requires
`json.success`, which the Worker never sends (it returns the bare record).
**Fix:** accept snake_case query **and** camelCase JSON body; response is
`{ success: true, record: {...}, ...record }`.

### 6.3 `POST /api/v1/blacknexa/hardware/beacon-trigger`
Expo (`SafetyBeaconButton.tsx:44`) and iOS (`SafetyBeaconButton.swift:216`) both
send snake_case (`user_id`, `device_mac_address`, `trigger_type`,
`gps_coordinates`); the Worker reads camelCase → 400 "userId, deviceMacAddress,
and triggerType are required". Clients also require `json.success`.
**Fix:** accept both casings; response keeps `status` + `secureVaultSync` +
`record` and adds `success: true`.

### 6.4 `GET /api/v1/blacknexa/weather`
Both clients read `{ success, data: { currentWeather } }`; the Worker returns the
bare `{ coordinates, currentWeather }`.
**Fix:** `{ success: true, data: { coordinates, currentWeather }, coordinates, currentWeather }`
— satisfies the clients and anything reading the flat enterprise shape.

### 6.5 `POST /api/v1/blacknexa/publish-verified-story`
`NewsProvider.tsx:163` requires `res.ok && body.success && body.article`; the
Worker returns the bare `ArticleResponse`.
**Fix:** `{ success: true, article: {...}, ...articleFields }`.

### 6.6 `pruneDuplicateArticles` / `cachePruneExpired` return values
DO-SQLite exposes `changes` from a `DELETE`; Sequelize returns an affected-row
count directly. Counts are computed equivalently, so the JSON is unchanged.

### 6.7 City-alias and nearby-city expansion was dead code
`_lib/local.ts` looked all three lookup tables up with `norm(city).toUpperCase()`,
but only `US_STATE_NAMES` is keyed uppercase — `CITY_ALIASES` and `NEARBY_CITIES`
are keyed lowercase (`"atlanta"`). Both lookups therefore always returned
`undefined`, which meant:

* the app's **Nearby toggle did nothing**, and
* the automatic thin-coverage fallback never expanded to neighbouring cities.

A second bug sat behind it: `isNearby` was computed as
`scoreArticleForLocation(a, homeTokens) === 0`, but that function adds `+0.5` to
every `scope: "local"` article. So `homeScore` was never zero for a local story,
and the `nearby` flag could never be `true` — for exactly the articles the feature
exists to surface.

**Fix:** each table is looked up with the casing it is keyed by, and
classification now uses a new `tokenScore()` (pure token matching) while ranking
keeps the scope bonus. Verified: an Atlanta reader now gets home tokens
`atlanta, ga, united states, georgia, atl, decatur, college park` and nearby
tokens `decatur, college park, marietta, sandy springs, east point`, with a
Marietta-only story correctly tagged `nearby: true`.

Response *shape* is unchanged — `nearby`, `expandedNearby` and the per-article
`nearby` flag were already in the payload and already handled by the client. Only
their values become correct.

### 6.8 Stored XSS in the server-rendered article page
`buildArticleHtml` embedded `JSON.stringify(jsonLd)` directly inside
`<script type="application/ld+json">`. An HTML parser ends a script element at the
first literal `</script`, regardless of JSON string quoting, so an article whose
headline contained `</script><script>…` broke out of the block and executed.

This was reachable: `POST /api/v1/news/generate` is public and unauthenticated,
headlines are produced by a model prompted with user-supplied `topicPrompt`, and
`GET /news/:slug` then serves the result to every visitor and crawler.

**Fix:** `jsonForScriptTag()` escapes `<`, `>`, `&`, `U+2028` and `U+2029` as
`\uXXXX`. The payload stays valid JSON — a crawler decodes the escapes back to the
original characters — while leaving nothing an HTML parser can act on. Confirmed
with a breakout payload before and after.

### 6.9 `dispatch_audit.incident_id` cannot carry a foreign key
`POST /geo-legal/dispatch` writes the sentinel `"draft"` when called without an
`incidentId`, which the app does when dispatching straight from a validated draft.
The Worker declared a `FOREIGN KEY … REFERENCES incidents(id)` on that column, but
DO-SQLite does not enforce foreign keys unless `PRAGMA foreign_keys=ON` is set, so
it never fired. PostgreSQL enforces them, and every draft dispatch would have
failed with a constraint violation.

**Fix:** the association is declared `constraints: false` — a documented soft
reference. Erasure still removes these rows, because `deleteIncident` deletes them
explicitly by `incident_id` inside the transaction rather than relying on a
database cascade. Verified: a draft dispatch returns 18 audit entries and succeeds.

## 6a. Verification performed

Checked against a live PostgreSQL 16 instance, in addition to a clean `tsc`
build and 40/40 offline assertions:

| Area | Result |
|---|---|
| Schema | all 23 tables created; `deleted_on` present only on `articles`, `creators`, `enterprise_articles`, `admin_users` |
| Seed | 18 articles, 22 curated jurisdictions, bcrypt-hashed (`$2a$12$`, 60 char) bootstrap admin |
| Feed contracts | `/news/feed`, `/briefings`, `/local`, `/article/:slug`, search — key-for-key identical to what `NewsProvider.tsx` reads |
| Media | image endpoint returns byte-identical PNG with `immutable` caching; feed rewrites `imageUrl` to the self-served endpoint |
| Geo-legal | US profile resolves 4 frameworks / 13 agencies / 14 press contacts; validate, draft dispatch, incident create/read/erase |
| Encryption at rest | plaintext email **not** recoverable from `incidents.sealed_payload`; PII scrubbed to `[EMAIL]`/`[PHONE]`; server layer peels off on read; tampered ciphertext refuses to decrypt |
| GDPR erasure | incident + evidence + audit rows all gone; no soft-delete column exists to hide them |
| Money path | 8% fee split, USD-cent normalisation (1000 EUR → 1080), append-only ledger with correct running balance (920 → 1914), idempotency replay creating exactly 1 row, Stripe webhook settling a tip, payout gross/fee/net (920/25/895), second payout correctly refused |
| Persistence engine | snapshot → integrity (0 orphans) → restore of the same snapshot inserted **0** and skipped 22, totals unchanged |
| Queue | 4 jobs enqueued, drained, all `completed` |
| Security headers | CSP, HSTS config, `X-Frame-Options: DENY`, `nosniff`, `strict-origin-when-cross-origin`, no `x-powered-by` |
| CORS | disallowed origin receives no `Access-Control-Allow-Origin`; allowlisted origin does |
| Auth | identical message for wrong password and unknown email (no enumeration); refresh token rejected as access token; refresh rotation invalidates the previous token |
| RBAC | auditor gets 403 on prune/restore/admin-create, 200 on integrity |
| Rate limiting | auth route throttles at attempt 8 |
| Error leakage | a real `relation does not exist` failure returns `"A database error occurred."` with the table name, SQL and stack only in the server log |
| WebSocket | clean message relayed to peers and not echoed to sender; blocked message returns a private `moderation-rejected` and is never relayed; non-chat upgrade path refused |
| AI-disabled degradation | generate → 500 with a safe message; daily batch → `failed: 30` without throwing; enterprise story → 634-char local narrative meeting the 600-char guardrail |

Not verified on this machine: `SIGTERM` graceful shutdown. Windows
`Stop-Process` is a hard terminate rather than a signal, so the handler could not
be exercised; the code path is registered for `SIGTERM` and `SIGINT` and is
straightforward, but it is untested and should be confirmed on the Linux target.

## 7. Response-standard conflict, and how it is resolved

The spec mandates every endpoint return
`{ success: 1|0, message, result, pagination?, error? }` via `responseData()`.
The mobile app reads `{ success: true, data: [...] }`, `{ success: true, article }`,
`{ success: true, profile }`, `{ success: true, balance }`, and so on — with
boolean `success` and per-endpoint payload keys.

Applying `responseData()` to the migrated routes would break every screen in
both apps, which contradicts the stated hard requirement ("each endpoint and its
request body and response should be the same"). Resolution:

* `responseData()` and `responseMessage()` are implemented exactly as specified
  in `src/utils/response.util.ts` and used for **all new** endpoints (`/admin/*`)
  and as the single error-emission path shape for those routes.
* The 61 migrated routes keep byte-compatible legacy payloads, emitted through
  `legacyJson()` / `legacyError()` helpers in the same util, so the response
  surface is still centralised in one file rather than scattered per controller.

When the mobile app is next revised, flipping a route to `responseData()` is a
one-line change in its controller.

## 8. Security implementation

| Requirement | Implementation |
|---|---|
| Helmet + HSTS/CSP/frame/no-sniff | `helmet()` with explicit CSP; `app.disable('x-powered-by')` |
| Rate limiting | global limiter on `/api/v1`; strict limiter on auth; write limiter on `generate`/`tip`/`incident`/`beacon`; loose limiter on public reads |
| CORS | explicit origin allowlist from `CORS_ORIGINS`; `*` only when `NODE_ENV !== 'production'`; `Idempotency-Key` / `X-Tos-Version` kept in allowed headers |
| bcrypt | 12 rounds, admin passwords only |
| JWT | 15m access token, 7d rotating refresh token, separate secrets |
| Joi validation | `validate('schemaName')` on body/params/query with `stripUnknown: true`, `convert: true` |
| SQL injection | Sequelize only; the two dynamic-table loops in the persistence engine validate table names against a hard-coded allowlist before interpolation |
| XSS / prototype pollution | `sanitizeRequest` strips `__proto__`/`constructor`/`prototype` keys and control chars |
| Upload safety | `upload.middleware.ts` — memory storage, magic-byte + extension + MIME triple check, size cap, `uuidv4()` filenames |
| Private files | `s3.service.ts` — presigned GET/PUT, never public static |
| Error leakage | central error handler: 500s log `stack` server-side, return a generic message in production; Sequelize/Joi internals never forwarded |
| Secrets | zero hardcoded values; `env.config.ts` validates on boot and exits non-zero on a missing/invalid var |

**Auth placement.** The old backend has no auth at all, and the mobile app holds
no backend token (it uses Rork OAuth against a different host). Guarding a public
read like `/news/feed` would break the app immediately. So `adminAuthGuard` +
`checkRole` are applied only to destructive/operational routes:
`news/refresh-daily`, `news/prune-duplicates`, `news/backfill-*`,
`geo-legal/refresh`, `platform/cache/prune`, `platform/queue/{drain,prune}`,
`platform/tipping/payout/:id/status`, `platform/persistence/*`. Public write
routes stay open exactly as today but gain Joi validation, moderation, and
strict rate limits. `userAuthGuard` is implemented and ready for when the mobile
app starts issuing backend tokens.

## 9. Behavioural parity notes

* **Feed dedup.** `allRows()` de-duplicates by id, slug, normalised headline and
  FNV-1a content hash, then rewrites image/audio URLs. Ported exactly, including
  the hash function, so `contentHash` values match existing rows.
* **Image/audio URL rewriting.** `rewriteImageUrl` / `rewriteAudioUrl` keep the
  same precedence: stored bytes → self-served endpoint; otherwise the curated
  Pexels fallback keyed by the same FNV hash so a given article keeps the same
  fallback photo it has today. Legacy Unsplash/Picsum URLs are still upgraded.
* **Generation.** `POST /news/generate` keeps the fast path (Exa 8 results /
  800 chars → Gemini flash-lite `FAST_RULE` → immediate 201) with image, audio
  and 18-language pre-translation detached to the background, and keeps the
  24-hour duplicate short-circuit that returns `{ cached: true }`.
* **Daily batch.** Same 30-prompt deterministic rotation by day index, same
  parallel generation, same `publishedToday` skip, same IndexNow + sitemap pings
  on new slugs.
* **Translation.** Cache hit → instant; miss → English source returned with
  `background: true` and a detached full pre-translation. Identical.
* **Tipping.** Idempotency replay table, USD-cent normalisation with the same
  static rate table, 8% fee, min $1 / max $500, append-only ledger with running
  balance, $0.25 flat payout fee, full-balance withdrawal, failed-payout
  reversal. Ported 1:1 into `tipping.service.ts`, with tip + ledger writes now in
  a real transaction (DO-SQLite gave this implicitly; Postgres needs it stated).
* **Queue.** Same claim-then-process, `attempts < max_attempts` retry with 30s
  backoff, `pruneOldJobs(7)`. Claiming now uses `UPDATE … WHERE status='pending'
  RETURNING` so concurrent workers cannot double-claim.
* **Persistence engine.** Append-only merge semantics preserved exactly
  (`INSERT … ON CONFLICT DO NOTHING`, existing rows always win), same checksum
  (djb2 over table names/counts/first+last row) so checksums stay comparable
  across the migration.
* **Moderation.** Same word lists, same l33t normalisation, SHA-256 hashing,
  cache-then-filter-then-log pipeline, and the same live-chat rejection notice.
* **Encryption.** PBKDF2-SHA256 100k iterations → AES-256-GCM, 16-byte salt,
  12-byte IV, same JSON envelope, same `AES-256-GCM-PBKDF2` label. Payloads
  sealed by the Worker decrypt unchanged provided the same secret is supplied.

## 10. Ported verbatim (data + pure functions)

`_lib/types.ts`, `_lib/seed.ts` (18 seed articles), `_lib/daily-prompts.ts`
(64 prompts), `_lib/local.ts` (state/alias/nearby tables + ranking),
`_lib/i18n.ts` (19 languages + both translators), `_lib/generate.ts` (Exa +
Gemini + image + TTS + 8 curated Pexels pools), `_lib/seo.ts`,
`_lib/syndication.ts`, `_lib/geo-legal/jurisdictions.ts` (19 curated
jurisdictions), `geo-legal/global-regions.ts`, `geo-legal/types.ts`,
`geo-legal/resolver.ts`, `geo-legal/validator.ts`, `geo-legal/pii-scrubber.ts`,
`platform/types.ts`, `platform/fact-verify.ts`. Only `atob`/`btoa` →
`Buffer` and import paths changed.

Rewritten because they were `SqlStorage`-bound: `platform/cache.ts`,
`platform/tipping.ts`, `platform/queue.ts`, `platform/moderation.ts`,
`platform/tos.ts`, `platform/enterprise.ts`, `platform/persistence.ts`,
`geo-legal/store.ts`, and both DO classes.

## 11. Deployment differences to be aware of

1. **PostgreSQL is now required.** `DATABASE_URL` (or discrete `DB_*` vars) must
   be set; the server fails fast without it.
2. **Public origin.** The Worker derived the image/audio origin from the request
   URL and hardcoded `https://blacknexa-backend.rork.app` in two background
   paths. Now `PUBLIC_API_ORIGIN` (falls back to the request origin), so
   generated URLs are correct behind a proxy. Set it in production.
3. **Existing data.** The DO's SQLite is not readable from outside Cloudflare.
   To carry current articles over, call the Worker's
   `GET /api/v1/platform/persistence/snapshot` and `GET /api/v1/news/feed?limit=0`
   and import via `POST /api/v1/platform/persistence/restore` on the new server
   (append-only merge, so it is safe to re-run). Images/audio are not in the
   snapshot; they regenerate via `POST /api/v1/news/backfill-images`.
4. **Cron.** `ENABLE_CRON=false` on every replica except one, otherwise the daily
   batch runs N times.
5. **Trust proxy.** `TRUST_PROXY` must be set behind a load balancer for
   `req.ip`-based rate limiting and for the ToS agreement IP record
   (`CF-Connecting-IP` → `X-Forwarded-For`).
