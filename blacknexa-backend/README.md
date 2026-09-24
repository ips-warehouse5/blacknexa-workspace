# BlackNexa Backend

Node.js · Express · TypeScript · Sequelize · PostgreSQL

The News, Geo-Legal, Platform and Enterprise API for BlackNexa. This service
replaces the Cloudflare Worker in `rork-blacknexa/functions/` and serves **every
endpoint at the same URL with the same request and response shape**, so the Expo
and iOS apps need no changes beyond pointing at the new host.

Full transformation record, endpoint inventory and schema map:
[`docs/MIGRATION_PLAN.md`](docs/MIGRATION_PLAN.md).

---

## Quick start

```bash
cp .env.example .env      # then fill in DATABASE_URL and the two JWT secrets
npm install
npm run db:sync           # create the 23 tables
npm run db:seed           # 18 seed articles + 22 curated jurisdictions
npm run dev               # http://localhost:4000
```

A throwaway PostgreSQL for local work:

```bash
docker run -d --name blacknexa-pg \
  -e POSTGRES_USER=blacknexa -e POSTGRES_PASSWORD=blacknexa \
  -e POSTGRES_DB=blacknexa -p 5432:5432 postgres:16-alpine
```

The server **refuses to start** on a missing or malformed environment variable and
prints the offending keys. That is deliberate — see `src/config/env.config.ts`.

### Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | watch mode via nodemon + ts-node |
| `npm run build` | `tsc` then `tsc-alias` (rewrites `@/` to relative paths) |
| `npm start` | run the compiled `dist/server.js` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | unit tests (`node --test` over `src/**/*.test.ts`) — pure modules only, no database or `.env` needed |
| `npm run db:sync` | create/align the schema (`--no-alter` to skip alter) |
| `npm run db:seed` | seed articles, jurisdictions, bootstrap admin |
| `npm run db:seed:admin` | one operator account per role, for the admin console (refuses to run in production) |
| `npm run db:migrate:roles` | migrate operator roles onto the four-role model (idempotent) |
| `npm run db:migrate:profile-faq` | add the profile columns and FAQ tables to an existing database (idempotent) |
| `npm run db:migrate:moderation` | add the incident moderation schema, backfills and seed keyword rules (idempotent; `--no-seed` skips the rules) — see [Incident moderation](#incident-moderation) |
| `npm run db:snapshot` | take a persistence snapshot (`-- --integrity` to check instead) |
| `npm run smoke:moderation` | walk the console's moderation and incident APIs against a running server — see [The console API](#the-console-api) |

---

## Pointing the apps at this service

One variable in `expo/.env` and `Config.EXPO_PUBLIC_RORK_FUNCTIONS_URL` on iOS:

```
EXPO_PUBLIC_RORK_FUNCTIONS_URL=https://api.blacknexa.com
```

No other client change is required. The WebSocket URL is derived from it by the
app (`http` → `ws` + `/api/v1/blacknexa/live-chat`) and is served by the same
process on the same port.

---

## Architecture

```
src/
  config/       env fail-fast validation, Sequelize instance, CORS allowlist, constants
  models/       23 Sequelize models + associations
  types/        *.interface.ts — model attributes, DTOs, filters, response payloads
  services/     class singletons — all business logic and ORM queries
  controllers/  class singletons — req/res only; delegate and respond
  routes/       paths + guards + validators; no logic
  middlewares/  auth, rbac, joi validate, rate limits, logUrl, sanitize, error, upload
  validations/  Joi schema registry, resolved by name via validate('name')
  data/         curated datasets ported from the Worker
  jobs/         node-cron replacements for the Durable Object alarms
  websocket/    live-chat hub (ws)
  utils/        responseData, responseMessage, logger, hash, slug, binary, http, origin
  scripts/      db:sync, db:seed, db:snapshot
```

Files follow `<entity>.model.ts` / `.service.ts` / `.controller.ts` / `.route.ts` /
`.interface.ts`, and services and controllers export lowerCamelCase singletons.

### What replaced what

| Cloudflare | Here |
|---|---|
| Durable Object SQLite | PostgreSQL via Sequelize |
| DO alarms | `node-cron` — daily batch at 06:00 UTC, maintenance every minute |
| `ctx.waitUntil()` | `runBackground()` — detached promise with logged rejection |
| `WebSocketPair` | `ws` server on the same HTTP server |
| DO-to-DO `fetch` | direct service calls |
| `atob` / `btoa` | `Buffer` |
| `crypto.subtle` | `node:crypto` webcrypto — identical algorithm and output format |

---

## Response shapes

Two emitters, both in `src/utils/response.util.ts`:

* **Migrated endpoints** keep the Worker's payloads exactly —
  `{ success: true, data: [...] }`, `{ success: true, article }`,
  `{ success: true, profile }`, and so on. The shipped apps read those specific
  keys and throw without them.
* **New endpoints** (`/api/v1/admin/auth/*`) use the project standard:
  `{ success: 1|0, message, result, pagination?, error? }` via `responseData()`,
  with copy composed by `responseMessage(type, action, module)`.

This split is intentional and is explained in `docs/MIGRATION_PLAN.md` §7:
applying the unified standard to the migrated routes would break every screen in
both apps. Moving a route onto it later is a one-line controller change.

---

## Security

| Concern | Implementation |
|---|---|
| Headers | `helmet` — CSP, HSTS (production), `X-Frame-Options: DENY`, `nosniff`, referrer policy; `x-powered-by` disabled |
| CORS | explicit `CORS_ORIGINS` allowlist; a wildcard is rejected at boot in production. Requests with no `Origin` (native apps, webhooks) are allowed — CORS protects browsers, and those are not browsers |
| Rate limiting | four tiers: `auth` (8/window, keyed by IP+email, successes not counted), `write` (generate/tip/incident/beacon), `read`, and an overall `/api/v1` budget |
| Passwords | bcrypt, 12 rounds, floor of 10 enforced at env validation |
| Tokens | 15-minute access token; refresh token with a rotating `jti` stored on the row, so a replayed refresh token is rejected. `typ` prevents using one as the other |
| Validation | `validate('name')` runs Joi over body/params/query with `stripUnknown: true` — the mass-assignment guard. A caller cannot inject `verified: true` into a creator, `status: "succeeded"` into a tip, or `amountUsd` into a payout |
| SQL injection | Sequelize with bind parameters throughout. The persistence engine is the only place a table name is interpolated; every name is re-checked against a frozen allowlist and every column against an identifier pattern first |
| XSS / prototype pollution | `sanitizeRequest` strips `__proto__`/`constructor`/`prototype` and control characters; output is escaped at the boundary that needs it (`htmlEscape`, `xmlEscape`, `jsonForScriptTag`) |
| Uploads | `upload.middleware.ts` — memory storage, magic-byte verification (declared MIME and extension are never trusted alone), size cap, UUID filenames |
| Private files | `s3.service.ts` — presigned GET/PUT, server-side encryption, never a public directory |
| Error leakage | the error handler logs stacks, SQL and driver messages server-side and returns a generic message; Sequelize and Joi internals never reach the client |
| Secrets | nothing hardcoded; every required variable validated at boot |

### The admin console surface

The console (`../admin-panel`) is served by two route groups:

```
POST /api/v1/admin/auth/login           first factor — returns an MFA challenge, never a session
POST /api/v1/admin/auth/mfa/verify      second factor — the only route that issues tokens
POST /api/v1/admin/auth/mfa/resend
POST /api/v1/admin/auth/refresh
POST /api/v1/admin/auth/logout
GET  /api/v1/admin/auth/me
POST /api/v1/admin/auth/password/forgot
POST /api/v1/admin/auth/password/reset

GET    /api/v1/admin/staff              staff.view
GET    /api/v1/admin/staff/summary      staff.view
POST   /api/v1/admin/staff              staff.create
PATCH  /api/v1/admin/staff/:id          staff.edit
PATCH  /api/v1/admin/staff/:id/status   staff.toggle
POST   /api/v1/admin/staff/:id/reset-password   staff.reset
DELETE /api/v1/admin/staff/:id          staff.delete
```

**Sign-in is two calls, and that is load-bearing.** `login` verifies the password
and returns a challenge id; `mfa/verify` verifies the emailed code and is the
only method that issues tokens. There is no response shape in which a correct
password alone produces a session, so a leaked password is not by itself enough
to sign in.

Enforced by `auth.service.ts`:

| Rule | Value |
|---|---|
| Failed passwords before lockout | 5 |
| Lockout duration | 15 minutes, counted on the row so it survives a restart and applies across instances |
| Code lifetime | 5 minutes |
| Wrong codes before the challenge dies | 5 |
| Resends per sign-in | 3 |

A lockout answers 429 with `Retry-After`, which the console renders as a live
countdown. `Retry-After` is in the CORS `exposedHeaders` list — without that a
browser cannot read it.

Codes are stored as SHA-256, never in the clear, and consumed on use. SHA-256
rather than bcrypt deliberately: these live for minutes and are bounded by the
attempt counter, so a slow hash would buy nothing and would make the verify
endpoint a CPU-exhaustion lever.

Password recovery answers identically whether or not the account exists — saying
"no such account" would turn the endpoint into a way to discover which addresses
are administrators.

### Roles

Four, fixed: `superadmin`, `moderator`, `advocate`, `staff`. This replaced the
earlier five (`super-admin | admin | editor | auditor | moderator`), which had
grown from what individual routes happened to need rather than from how the
organisation works.

`config/rbac.config.ts` is the authoritative permission matrix. The console
mirrors it to decide what to render; this copy is the access control. Prefer
`requirePermission("moderation.decide")` over `checkRole([...])` on new routes —
it states what is being protected rather than who happens to hold it today.

**Existing deployments must run `npm run db:migrate:roles`.** Rows written before
the change carry the old spelling, and because the matrix is keyed by the new
values such an account can sign in and then do nothing, with no error explaining
why. The mapping folds `admin`, `editor` and `auditor` into `superadmin`, which
is a genuine widening — the script reports every account it does that to, by
email, so the list can be reviewed.

### Where authentication is applied

The Worker had none. The apps hold no token for this API — they authenticate
against a separate Rork OAuth host — so guarding a public read like `/news/feed`
would break them on the next request.

`adminAuthGuard` + `checkRole` therefore protect the **destructive and
operational** routes that were previously callable by anyone with the URL:

```
POST /api/v1/news/refresh-daily · prune-duplicates · backfill-images · backfill-translations
POST /api/v1/geo-legal/refresh
POST /api/v1/platform/cache/prune · queue/drain · queue/prune
POST /api/v1/platform/tipping/payout/:id/status
GET  /api/v1/platform/persistence/snapshot · integrity · snapshots
POST /api/v1/platform/persistence/restore
```

Public write routes (`/news/generate`, tipping, incident creation, beacon
triggers) stay open exactly as before but gain Joi validation, moderation and
strict rate limits. `userAuthGuard` is implemented and ready for when the apps
begin issuing backend tokens.

Create the first operator by setting `ADMIN_BOOTSTRAP_EMAIL` and
`ADMIN_BOOTSTRAP_PASSWORD` and starting the server once, then remove them.

---

## Incident moderation

Design: [`../docs/INCIDENT_MODULE_PLAN.md`](../docs/INCIDENT_MODULE_PLAN.md)
(revision 2). In short: a public or trusted report, its evidence and every
comment are stored `pending` and checked **before** anyone else sees them — a
keyword stage in Node, then an AI assessment by the Python engine — and are
either published automatically or held for a human in the Content Moderation
queue. The AI never rejects; only people do. Private reports are never sent.

### Schema

```bash
npm run db:migrate:moderation     # safe to re-run; always run it after db:sync
```

* **Fresh database:** `npm run db:sync`, then `npm run db:migrate:moderation`
  (sync creates the tables; the migration backfills and seeds the keyword rules).
* **Existing database:** run `db:migrate:moderation` *before* booting with
  `DB_SYNC=true` — once the models declare the new columns, a sync without
  `alter` tries to index columns that do not exist yet.
* **Production:** `DB_SYNC` is refused, so the migration is the whole story.

The script adds columns with `ADD COLUMN IF NOT EXISTS` (legacy rows stay
`approved`, so nothing that is visible today disappears), creates the
`moderation_runs`, `moderation_cases`, `keyword_rules`, `audit_events` and
`report_notes` tables with `Model.sync()` (never `alter`), backfills
`published_at` for legacy reports, revokes share links on private reports,
dismisses duplicate open flags before creating the one-open-flag-per-reporter
unique indexes, and seeds six keyword rules by name. It prints a summary of
what it changed.

### The worker

The moderation worker starts with the API on **every** replica (runs are
claimed with `FOR UPDATE SKIP LOCKED`), independent of `ENABLE_CRON`. Set
`MODERATION_WORKER_ENABLED=false` to keep a process out of it. Without an AI
engine configured, reports are held for a human (fail closed); comments with no
keyword hit are approved. Locally you may set `MODERATION_REPORT_AI_FALLBACK=approve`;
production refuses to boot with it.

### Configuration

| Variable | Default | Meaning |
|---|---|---|
| `MODERATION_ENABLED` | `true` | `false` skips the AI stage only — the fallbacks still apply, so it is not a publish-everything switch |
| `MODERATION_WORKER_ENABLED` | `true` | run the worker in this process |
| `MODERATION_WORKER_CONCURRENCY` / `MODERATION_WORKER_POLL_MS` | `4` / `1500` | parallel runs per process; idle poll interval |
| `MODERATION_LEASE_SECONDS` | `120` | claim lease; boot refuses unless `× 1000 ≥ 2 × MODERATION_AI_TIMEOUT_MS + 30000` |
| `MODERATION_AI_TIMEOUT_MS` | `40000` | per-call engine timeout |
| `MODERATION_MAX_ATTEMPTS` | `4` | attempts before the terminal hold (urgent: `min(2, this)`); backoff 15 s, 60 s, 4 min |
| `MODERATION_AUTO_APPROVE_MIN_CONFIDENCE` / `_VIOLATION_MIN_CONFIDENCE` / `_FLAG_AUTOHIDE_MIN_CONFIDENCE` | `0.8` / `0.5` / `0.85` | policy thresholds |
| `MODERATION_REPORT_AI_FALLBACK` | `hold` | `approve` is refused in production |
| `MODERATION_COMMENT_AI_FALLBACK` | `approve` | `approve` or `hold` |
| `MODERATION_UNASSESSED_MEDIA` | `review` | media the AI cannot see waits for a moderator (`review`) or publishes with the text (`publish`) |
| `MODERATION_FLAG_MIN_ACCOUNT_AGE_DAYS` | `7` | only older accounts' flags trigger an AI re-check |
| `MODERATION_MAX_IMAGES` | `10` | photo thumbnails per assessment (needs `STORAGE_DRIVER=s3`) |
| `MODERATION_ALERT_EMAILS` | `""` | extra recipients for urgent/safety alerts (active moderators are always included) |
| `SERVER_ENCRYPTION_SECRET` | `""` | seals report bodies when set; opening tries it first, then the legacy chain, so setting it on a live database is safe |
| `RATE_LIMIT_USER_WRITE_MAX` / `RATE_LIMIT_FLAG_MAX` / `RATE_LIMIT_FLAG_DAILY_MAX` | `120` / `20` / `50` | per-member budgets (not per IP) |

The engine side is configured in `blacknexa-ai-engine` (`AI_MODERATION_MODEL`,
`GEMINI_DATA_TERMS`, …); Node reaches it through `AI_ENGINE_URL` and
`AI_ENGINE_TOKEN`.

### The console API

Two routers serve the admin console's Content Moderation and Incident
Management screens (plan §8.1, §9.1):

```
/api/v1/admin/moderation   cases (queue, summary, detail, files) · approve · reject ·
                           hide a file · re-run AI · ban / unban · keyword rules · stats
/api/v1/admin/incidents    list · summary · assignees · detail · files · verify · dismiss ·
                           reopen · deactivate · reactivate · assign · notes
```

Every endpoint — method, path, permission, query and body schema, the exact
response shapes and the error messages — is written out in
[`docs/ADMIN_MODERATION_API.md`](docs/ADMIN_MODERATION_API.md). The console's
wire types (`admin-panel/src/features/moderation/*.types.ts`,
`features/incidents/incidents.types.ts`) mirror it field for field, and the doc
itself mirrors the interfaces at the top of `moderation_admin.service.ts` and
`incident_admin.service.ts` — change the three together. Both routers run
`adminAuthGuard`, then `requirePermission("moderation.*" | "incidents.*")` per
route (`config/rbac.config.ts`), then Joi; every write also passes the
per-operator `adminWriteLimiter` (keyed by admin id, budget
`RATE_LIMIT_USER_WRITE_MAX`). An operator whose own member account wrote or
flagged the content is refused (D16, 403, audited). The old server-rendered
queue, `/admin/moderation/reports*`, `/flags/:id/resolve` and
`/comments/:id/hide` are gone.

`npm run smoke:moderation` walks both routers against a live server. It needs:

* the seeded operator accounts — `npm run db:seed:admin` (refused in
  production): `superadmin@`, `moderator@`, `advocate@` and `staff@blacknexa.com`;
* the server's log at `$LOG` (default `/tmp/bn-server.log`) — member sign-up
  codes are read from it — and the moderation worker running (it starts with
  the API);
* a raised per-IP budget locally, e.g. `RATE_LIMIT_MAX=2000`: the walk makes a
  few hundred requests from one address and the `apiLimiter` would cut it short.

`API`, `ROOT` and `MOD_WAIT` (seconds per wait for the worker, default 90) are
overridable. Without an AI engine, held reports are approved through the API as
part of the walk, and the one step that needs a particular pipeline outcome
(Re-run AI) reports SKIP rather than FAIL.

### Tests

```bash
npm test
```

Runs every `src/**/*.test.ts` with Node's built-in runner, compiled on the fly
by `ts-node` in transpile-only mode (`npm run typecheck` is what type-checks
the tests). The moderation vocabulary, policy table, keyword matcher and its
golden corpus are pure modules, so the suite needs neither a database nor a
`.env` — and a test must never import a model or `config/env.config.ts`.

---

## Bugs found and fixed during the port

Nine defects in the current production backend surfaced while porting. All are
fixed **server-side only** — no mobile release needed. Details in
`docs/MIGRATION_PLAN.md` §6.

1. **`GET /api/v1/news/audio/:id` was never routed.** The DO implemented the
   handler and rewrote every article's `audioUrl` to point at it, but the Worker's
   router had no such path. Audio always 404'd and the app silently fell back to
   device TTS.
2. **`POST /blacknexa/artists/tip` always 500'd.** The app sends snake_case query
   parameters with an empty body; the Worker called `request.json()` on that empty
   body. Now both spellings and both transports are accepted.
3. **`POST /blacknexa/hardware/beacon-trigger` always 400'd.** Both apps send
   snake_case; the Worker read camelCase. The panic button never logged an event.
4. **`GET /blacknexa/weather` shape mismatch.** Both clients read
   `json.data.currentWeather`; the Worker returned the payload flat.
5. **`POST /blacknexa/publish-verified-story` shape mismatch.** The app requires
   `body.success && body.article`; the Worker returned the bare article.
6. **City-alias and nearby-city expansion was dead code.** Both tables are keyed
   lowercase but were looked up with `.toUpperCase()`, so the Nearby toggle and the
   thin-coverage fallback did nothing. A second bug meant the `nearby` flag could
   never be `true` for a local article.
7. **Stored XSS in the server-rendered article page.** Raw
   `JSON.stringify` inside `<script type="application/ld+json">` let a crafted
   headline — reachable through the public generate endpoint — break out and
   execute.
8. **`dispatch_audit` foreign key would have broken draft dispatch.** The column
   legitimately holds the sentinel `"draft"`; SQLite never enforced the declared
   FK, PostgreSQL would have.
9. **`AdminUser` UUID assignment** (new code) needed `beforeValidate`, not
   `beforeCreate` — Sequelize validates before that hook runs.

---

## Deployment notes

1. **PostgreSQL is now required.** Set `DATABASE_URL` (or the discrete `DB_*`
   set). The server fails fast without it.
2. **Set `PUBLIC_API_ORIGIN`.** Background jobs have no request to derive an
   origin from, so generated image and audio URLs depend on it. Required in
   production by env validation.
3. **Set `TRUST_PROXY`** behind a load balancer, or rate limits become global
   rather than per-client and every ToS agreement records the balancer's IP.
4. **`ENABLE_CRON=true` on exactly one replica.** Otherwise the daily batch runs
   once per replica and spends the gateway budget N times.
5. **`DB_SYNC=false` in production** — enforced by env validation. Use a
   migration. `DB_SYNC_ALTER` is only safe on a first run: Sequelize re-emits
   foreign-key DDL on every alter pass and generates invalid SQL for tables that
   already have constraints.
6. **Carrying existing data across.** The Durable Object's SQLite is not readable
   from outside Cloudflare. Pull
   `GET /api/v1/platform/persistence/snapshot` and `GET /api/v1/news/feed` from the
   live Worker and import via `POST /api/v1/platform/persistence/restore` here —
   the merge is append-only, so it is safe to re-run. Images and audio are not in
   the snapshot; regenerate them with `POST /api/v1/news/backfill-images`.
7. **Without `AI_TOOLKIT_SECRET_KEY`** the service still runs: the feed serves
   stored and seed articles, generation returns a clear 500, translations fall back
   to English, and geo-legal lookups use the 22 curated jurisdictions.
8. **Run `npm run db:migrate:moderation`** on every existing database before
   deploying the incident moderation module, and set `SERVER_ENCRYPTION_SECRET`
   before removing `AI_TOOLKIT_SECRET_KEY` from this service. Existing report
   bodies open only while the secret that sealed them — the toolkit key, or
   failing that the JWT access secret — is still configured.

### Health probes

* `GET /ping` — liveness, no database touch (shape unchanged from the Worker).
* `GET /health` — readiness; queries the article count and reports AI-gateway status.
