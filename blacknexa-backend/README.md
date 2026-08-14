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
| `npm run db:sync` | create/align the schema (`--no-alter` to skip alter) |
| `npm run db:seed` | seed articles, jurisdictions, bootstrap admin |
| `npm run db:snapshot` | take a persistence snapshot (`-- --integrity` to check instead) |

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

### Health probes

* `GET /ping` — liveness, no database touch (shape unchanged from the Worker).
* `GET /health` — readiness; queries the article count and reports AI-gateway status.
