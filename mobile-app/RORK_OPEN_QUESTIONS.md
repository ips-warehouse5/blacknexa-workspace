# BlackNexa — Open Questions for Rork

**From:** Mobile app team
**Date:** 2026-08-19
**Backend reviewed:** `blacknexa-backend` @ `http://192.168.1.214:4000`

Every item below was verified against the backend source **and** the running API. File paths
and live responses are cited so each can be checked independently.

Items are ordered by urgency. **Sections 1–3 block work or carry risk; 4–9 are decisions we
need before continuing.**

---

## 1. 🔴 SECURITY — Incident endpoints are completely unauthenticated

`blacknexa-backend/src/routes/geo_legal.route.ts` applies `adminAuthGuard` to **only** one
route (`POST /refresh`, line 74). The incident routes carry a rate limiter and nothing else:

| Line | Route | Guard | Consequence |
|---|---|---|---|
| 50 | `POST /geo-legal/incident/create` | `writeLimiter` only | Anyone can create incidents |
| 57 | `GET /geo-legal/incident/:id` | `readLimiter` only | **Anyone with an ID reads a decrypted civil-rights report** |
| 65 | `DELETE /geo-legal/incident/:id` | `writeLimiter` only | **Anyone with an ID permanently destroys evidence** |

The DELETE is documented in-code as *"GDPR/CCPA right-to-erasure — a genuine hard delete."*
There is no ownership check anywhere — `user_id` is stored but never compared against a caller.

**The incident ID is effectively a bearer token.** It is the only thing between the public
internet and a user's report. IDs are generated as
`inc_<epochMillis>_<5 chars>` using `Math.random()` (`src/utils/id.util.ts:26`), which is not
cryptographically secure. Brute force is impractical under the rate limit, but any single
leak — a log line, a support ticket, a screenshot, a network capture — grants **permanent,
unauthenticated read and delete** on that report.

For a platform whose users document police and institutional misconduct, and whose threat
model explicitly includes device seizure, we consider this the most serious issue we found.

> **Q1. Is this intentional?** If the product is anonymous-first, what prevents someone who
> obtains an ID from deleting another person's evidence?

---

## 2. 🔴 BLOCKING — No endpoint lists incidents, so the community feed cannot exist

The backend exposes exactly three incident endpoints — verified via
`GET /api/v1/routes` (78 routes total) and by grepping every use of the `Incident` model
(`create`, `findByPk` ×2, `destroy` — all single-record):

```
POST   /api/v1/geo-legal/incident/create
GET    /api/v1/geo-legal/incident/:id
DELETE /api/v1/geo-legal/incident/:id
```

There is **no list endpoint** — no `GET /geo-legal/incidents`, no search, no pagination. No
code in the backend can return more than one incident.

Consequently the app's **Feed tab makes zero network calls**. It renders only the user's own
device-local reports. **Two users can never see each other's reports.** This is not something
we can fix client-side.

The data model appears designed for it: `Incident.privacy_level` (`private` / `trusted` /
`public`) exists and is populated, which only makes sense if a list was meant to filter by
visibility.

> **Q2. Is a shared community feed in scope?** If yes, we need a list endpoint plus the
> visibility rules: which `privacy_level` values are publicly readable, does moderation gate
> publication (`POST /platform/moderation/check` exists and is unused), and what ordering and
> pagination should we expect?

---

## 3. 🟠 Users cannot recover their own evidence

Reports are stored **per device installation, not per account**. There is no sign-in
requirement, and the app matches a user's reports by a hardcoded string rather than a user ID.

We have now wired `incident/create`, so reports **are** persisted server-side with PII
scrubbing and server-side sealing (verified live — a summary containing an email and phone
number was stored as `[EMAIL]` and `[PHONE]` with `piiScrubbed: true`, `serverEncrypted: true`).

But the user still cannot get anything back:

- `userId` is sent as `"anonymous"` or a display name — not an authenticated identity
- Nothing can list a user's incidents (see Q2)
- If the phone is lost, seized, or the app is reinstalled, **every report is gone from the
  user's perspective**, even though the data still exists on your server

For a product whose stated purpose is preserving evidence, this is the gap we are most
concerned about.

> **Q3.** Should users be able to recover their reports after losing a device? If yes we will
> require sign-in before reporting and send the authenticated user ID — but we would also need
> a list-by-user endpoint from you.

---

## 4. 🟠 "Verified publishing" is not fit to ship — we have withdrawn it

`POST /blacknexa/publish-verified-story` was reachable from the app's Generate Briefing sheet
whenever a user supplied 3+ source URLs. We have **removed that path** for now. Reasons, all
verified:

1. **Category rejected.** It validates against `ENTERPRISE_CATEGORIES` (7 values), while the
   app uses `ALL_NEWS_CATEGORIES` (8 values). **Exactly one value overlaps**, so it failed for
   7 of 8 categories.
2. **No AI.** `enterprise.service.ts` builds the article by string concatenation and appends
   generic filler text if it falls below a length threshold.
3. **The source URLs are never read** — only stored as links labelled with their hostname.
4. **No image, no audio**, unlike `/news/generate`.
5. It writes to `enterprise_articles`, **a table the app never reads**, so the briefing existed
   only in memory and vanished on restart.

By contrast `POST /news/generate` performs grounded AI generation, discovers and filters 5–7
real sources (`ai_gateway.service.ts:90`, `filterSources` at `:498`), and produces image,
audio and translation. All briefings now route there.

> **Q4 — our highest-value question. Can `POST /news/generate` accept an optional
> `verifiedSources` array?**
>
> Its schema currently declares only `topicPrompt`, `category`, `scope`, `language`, and the
> validation middleware runs `stripUnknown: true, allowUnknown: false`, so extra fields are
> silently dropped. If you can accept caller-supplied sources, we can restore the feature
> properly — real AI grounded on the user's chosen sources — and retire
> `publish-verified-story` from the mobile client entirely. `VerifiedSource[]`, per-article
> storage and `filterSources` already exist in the news pipeline.

---

## 5. 🟡 Four category vocabularies are in circulation

| Vocabulary | Values | Table | Endpoints |
|---|---|---|---|
| `ALL_NEWS_CATEGORIES` | 8 | `articles` | `/news/*` |
| `ENTERPRISE_CATEGORIES` | 7 | `enterprise_articles` | `/blacknexa/*` |
| `ALL_INCIDENT_CATEGORIES` | 7 | `incidents` | `/geo-legal/*` |
| **`"tech"`** | — | — | **used throughout your Postman collection** |

The backend's news categories match our mobile client **exactly**, so that pairing is healthy.
The problems are at the edges:

- Enterprise has **no Education, HBCU or Breaking** category, so 3 of our 8 have no target
- Your Postman collection sends `"category": "tech"` in five requests. We sent its
  `publish-verified-story` payload verbatim to the live API and received
  `{"success":false,"error":"Invalid Blacknexa category."}`
- `ENTERPRISE_CATEGORIES` is commented *"the 5 from the blacknexa.com API spec"* but defines
  **seven**

> **Q5.** Which vocabulary is canonical per surface? Should Education, HBCU and Breaking be
> added to the enterprise list? And is `"tech"` from an older spec we should disregard?

---

## 6. 🟡 `enterprise_articles` is written to but never read

The app's only enterprise write was `publish-verified-story` (now withdrawn). Nothing in the
mobile client reads `GET /blacknexa/feed`, `/categories` or `/stats`.

> **Q6.** Is the enterprise surface intended for a different client (a web app, or third-party
> integrators)? Should the mobile app read from it at all? Verified stories published before
> today went into a table nothing displays.

---

## 7. 🟡 `dispatch` does not update the incident it dispatches

`geoLegalService.dispatch` writes `DispatchAudit` rows but never sets
`Incident.dispatch_status` or `dispatch_audit_id`. Verified live: after a successful dispatch
the incident still reads `dispatchStatus: "created"`, `dispatchAuditId: null`, while six audit
rows exist and join correctly via `incident_id`.

Data is retrievable, so this is not urgent — but those two columns are currently dead.

> **Q7.** Should `dispatch` populate them, or are they intended for a different mechanism?

Related: what is the **retention policy** for incidents and evidence packages, and who can read
them? We are now sending real user data.

---

## 8. 🟡 App identifiers and analytics

**Android package is invalid.** Your EAS dashboard registers the Android Package as
`app.rork.499r3rz679a2j9vr4ap98`. Android requires every component of an Application ID to
start with a letter; `499r3rz679a2j9vr4ap98` starts with a digit. The build fails with:

```
AssertionError: Invalid format of Android package name. Only alphanumeric characters,
'.' and '_' are allowed, and each '.' must be followed by a letter.
```

We are using `app.rork.p499r3rz679a2j9vr4ap98` for Android locally, leaving iOS unchanged.

> **Q8a.** What is your real Android package? Has Android ever been built?
>
> **Q8b.** `EXPO_PUBLIC_RORK_APP_KEY` is the same string as the iOS bundle identifier, which
> suggests your auth service is keyed to it. Can we move to `com.blacknexa.app` for branding,
> and would you register it and whitelist `blacknexa://auth/callback` as a redirect URI?
>
> **Q8c.** Is `EXPO_PUBLIC_TEAM_ID` set in your build environment? Your toolkit SDK injects
> `RorkAnalyticsProvider` into our root layout at build time and sends screen views —
> including route params — to PostHog via `toolkit.rork.com`. It is disabled in Expo Go but
> **activates in development and production builds** when `EXPO_PUBLIC_PROJECT_ID` and
> `EXPO_PUBLIC_TEAM_ID` are both present. For this user base we need to know whether telemetry
> is active so it can be disclosed in the privacy policy.

---

## 9. 🟢 Postman collection — 11 defects

Useful to us, but not currently runnable as shipped.

| # | Request | Defect |
|---|---|---|
| 1 | Enterprise → Publish Verified Story | `category: "tech"` — verified failing live |
| 2 | Enterprise → Generate AI Story | `category: "tech"` |
| 3 | News → Generate Article Prompt | `category: "tech"` not in `ALL_NEWS_CATEGORIES` |
| 4 | Incident → Validate **and** Create | `category: "cybercrime"` not in `ALL_INCIDENT_CATEGORIES` (valid: profiling, housing, workplace, policing, education, medical, harassment) |
| 5 | Incident → Refresh Jurisdiction | Uses **GET**; the route is `router.post("/refresh")` |
| 6 | Admin → Logout | URL is `/admin/admin/auth/logout` — segment duplicated |
| 7 | Platform → Get Terms of Service | **Empty URL** |
| 8 | Platform → User Agreement (`tos/check`) | GET with a **body**; the backend requires `?userId=` as a **required query param** |
| 9 | Platform → Payout Request | No `Idempotency-Key` header, though `ROUTE_MANIFEST` marks it required |
| 10 | Environment | `local` and `staging` are **both empty** |
| 11 | Enterprise → Feed | Query keys have trailing spaces: `"location "`, `"category "` |

> **Q9.** Who maintains the collection? We are happy to submit corrections once Q5 is settled.

**One thing the collection confirmed positively:** our geo-legal validation payload is
correct and complete — the app sends `subdivisionCode`, `occurredAt`, `userIsParticipant`,
`obtainedExplicitConsent` and `inPublicSpace`, all of which your schema accepts.

---

## Summary

| Priority | Item | We need |
|---|---|---|
| 🔴 | Unauthenticated incident read/delete | Confirmation this is intended, or a fix |
| 🔴 | No incident list endpoint | Scope decision + endpoint |
| 🟠 | Evidence unrecoverable to users | Scope decision on authenticated reporting |
| 🟠 | `verifiedSources` on `/news/generate` | Yes/no — unblocks a withdrawn feature |
| 🟡 | Category vocabularies | Which is canonical per surface |
| 🟡 | `enterprise_articles` unread | Intended consumer |
| 🟡 | `dispatch_status` never set | Intended, or a gap |
| 🟡 | Android package, bundle ID, analytics | Answers to Q8a–c |
| 🟢 | Postman collection | Ownership |

**Nothing here blocks iOS development today.** Items 1–3 are product and security decisions
that affect what we build next; item 4 is the one that would let us restore a feature
immediately.
