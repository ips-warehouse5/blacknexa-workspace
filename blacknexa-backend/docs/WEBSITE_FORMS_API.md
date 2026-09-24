# Website Forms API — Contact Us & Waitlist

**For:** backend team (build) and website team (integrate)
**Consumer:** `blacknexa-website`
**Date:** 2026-09-24

## Overview

The marketing website has two forms that need the backend:

| Website form | Where it appears | Backend endpoint | Backend status | Website status |
| ------------ | ---------------- | ---------------- | -------------- | -------------- |
| **Contact Us** | `/contact` | `POST /api/v1/contact` | ✅ **Built** (`contact.route.ts`) | ✅ Wired. Only `API_BASE_URL` needs to be set. |
| **Secure Your Spot / Join Waitlist** | Homepage hero, homepage waitlist section, `/waitlist` page | `POST /api/v1/waitlist` | ❌ **Not built.** Spec in Part B. | ✅ Wired behind a flag, waiting on the endpoint. |

"Secure Your Spot" (the homepage hero button) and "Join the Global Movement" / "Join Priority Waitlist" are **the same waitlist form** and hit the **same endpoint**.

### Environments

| Environment | Website URL | API base (`API_BASE_URL`) | Status |
| ----------- | ----------- | ------------------------- | ------ |
| Development | `https://blacknexa.project-demo.info` | *dev API URL, e.g. `https://<dev-api-host>/api/v1`* | **Live now.** All current testing happens here. |
| Production  | `https://blacknexa.com` | *prod API URL* | **Not deployed yet.** |

> Backend team: please confirm the dev API base URL so the website's dev deployment can set `API_BASE_URL`.

### How every call flows

```
Browser ──POST /api/contact  ──▶ Next.js route (website) ──POST {API_BASE_URL}/contact  ──▶ Backend
Browser ──POST /api/waitlist ──▶ Next.js route (website) ──POST {API_BASE_URL}/waitlist ──▶ Backend
```

- The browser **never** calls the backend directly. The website server forwards each request, so the backend needs **no CORS entries** for these routes.
- The website reads the standard envelope `{ success, message, result }` (and also the legacy `{ success: false, error }`) through `src/lib/api/client.ts`.
- **Error text rule (both forms):** for a **4xx**, the website shows the backend's `error` (or `message`) **directly to the visitor**, so write it for a person. For **5xx** or a network failure, the visitor sees a generic "Something went wrong on our end — try again."

### Website-side config (both forms)

| Env var | Dev value | Prod value | Notes |
| ------- | --------- | ---------- | ----- |
| `API_BASE_URL` | dev API base incl. `/api/v1` | prod API base incl. `/api/v1` | Server-only. If unset, both forms answer **503** "not configured yet". |
| `NEXT_PUBLIC_SITE_URL` | `https://blacknexa.project-demo.info` | `https://blacknexa.com` | Used to build referral links. Set before `next build`. |
| `WAITLIST_PREVIEW` | optional `1` for demos only | **never set** | Returns a fake position and code while the waitlist endpoint is missing. |

---

# Part A — Contact Us: `POST /api/v1/contact` ✅ exists

Already implemented in `src/routes/contact.route.ts`, `contact.controller.ts`, `contact.service.ts`, `contact.validation.ts`. This section documents the live contract for integration and QA. **No backend work is needed.**

### A.1 Request

`POST {API_BASE_URL}/contact` · public · no auth · `writeLimiter`

Headers: `Content-Type: application/json`, `Accept: application/json`

```json
{
  "name": "Jane Doe",
  "email": "jane@example.com",
  "subject": "partnership",
  "message": "We'd like to talk about a community partnership in Atlanta."
}
```

| Field | Type | Required | Rules |
| ----- | ---- | -------- | ----- |
| `name` | string | **Yes** | Trimmed, 2–255 chars. |
| `email` | string | **Yes** | Trimmed, lowercased, valid email (any TLD), max 255. |
| `subject` | string | No | One of `general` · `partnership` · `press` · `problem` · `legal`. Defaults to `general`. |
| `message` | string | **Yes** | Trimmed, **12–5,000** chars. |

Unknown fields are stripped (`stripUnknown`), so a caller can't set `status`, `handledBy` and so on. IP and user agent are taken from the request, not the body.

Subject labels (shown in the website dropdown and the admin console):

| Value | Label |
| ----- | ----- |
| `general` | General enquiry |
| `partnership` | Partnership |
| `press` | Press |
| `problem` | Report a problem |
| `legal` | Legal |

### A.2 Success: `201 Created`

```json
{
  "success": 1,
  "message": "Thanks — your message has been received.",
  "result": {
    "id": "5d1f0a7e-3c2b-4b8e-9f10-6a7c2e9d4b21",
    "submittedAt": "2026-09-24T10:15:00.000Z"
  }
}
```

The website only checks for a 2xx and then shows its thank-you state. It doesn't pass `id` on to the visitor.

### A.3 Errors

| Status | When | Body (as sent today) |
| ------ | ---- | -------------------- |
| `400` | Validation failed | `{ "success": false, "error": "<messages joined with '; '>" }`, e.g. `"Please tell us your name."`, `"We need an email address to reply to."`, `"That email address does not look right."`, `"Please include a message."`, `"A little more detail helps us route this."`, `"Please keep the message under 5,000 characters."` |
| `429` | Rate limit (`RATE_LIMIT_WRITE_MAX`, default **30 per 15 min** per IP) | `{ "success": false, "error": "Too many requests. Please slow down and try again shortly." }` |
| `5xx` | Server fault | Standard error middleware. The website shows its generic message. |

### A.4 Website integration (already done)

| File | Role |
| ---- | ---- |
| `src/components/forms/contact-form.tsx` | Form UI + client validation (same limits as above) |
| `src/app/api/contact/route.ts` | Proxy: re-validates, then forwards |
| `src/lib/api/contact.ts` | `submitContactInquiry()` → `POST /contact` |
| `src/data/contact.ts` | Subjects + min/max, kept in sync with the backend |

**To go live:** set `API_BASE_URL` on the website deployment. Nothing else is needed.

### A.5 QA checklist

| # | Scenario | Expected |
|---|----------|----------|
| 1 | Valid submission | 201. The website shows its thank-you. A row appears in the admin console at `GET /api/v1/admin/contact`. |
| 2 | Message of 11 chars | 400, "A little more detail helps us route this." (the website form blocks this first) |
| 3 | Subject `"hack"` sent directly to the API | 400 (the website proxy falls back to `general` before forwarding) |
| 4 | 31 posts in 15 min from one IP | 429 |
| 5 | `API_BASE_URL` unset on the website | 503 "The contact form is not configured yet." |

---

# Part B — Waitlist: `POST /api/v1/waitlist` ❌ needs building

## B.1 Why this exists

The client wants a viral pre-launch funnel:

1. A visitor joins the waitlist with their email.
2. They immediately see their **priority queue position** (e.g. `#4,102`).
3. They get a **personal referral link** (`https://blacknexa.com/waitlist?ref=CODE`).
4. When people join through that link, the referrer **moves up the queue**.

The website side is done. It needs **one public endpoint** from the backend, plus two optional ones listed in B.6.

### Call flow

```
Browser ──POST /api/waitlist──▶ Next.js route (website) ──POST {API_BASE_URL}/waitlist──▶ Backend
```

- The browser never calls the backend directly. The website's server-side route forwards the request, so **no CORS entry is needed**. This is the same pattern as `POST /api/v1/contact`.
- The website reads `result` from the standard envelope and ignores everything else.
- `API_BASE_URL` is, for example, `https://api.blacknexa.org/api/v1`. The full URL is therefore `POST /api/v1/waitlist`.

---

## B.2 Required endpoint: `POST /api/v1/waitlist`

Public, with no auth. It follows the same pattern as `contact.route.ts`.

```ts
// src/routes/waitlist.route.ts
router.post(
  "/",
  writeLimiter,
  validate("waitlist.join"),
  asyncHandler((req, res) => waitlistController.join(req, res)),
);
```

Mount it at `/api/v1/waitlist` in `src/routes/index.ts`.

### B.2.1 Request

**Headers**

| Header         | Value              |
| -------------- | ------------------ |
| `Content-Type` | `application/json` |
| `Accept`       | `application/json` |

**Body**

```json
{
  "email": "jane@example.com",
  "phone": "+1 555 010 0199",
  "referredBy": "K7X2QM"
}
```

| Field        | Type   | Required | Rules                                                                                                                                                                  |
| ------------ | ------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `email`      | string | **Yes**  | Trim and lowercase before storing. Must be a valid email address. Max 254 chars. **Unique** (see B.2.4).                                                                 |
| `phone`      | string | No       | Free-form, because formatting characters (`+`, spaces, `()`, `-`) are allowed. After stripping non-digits it must be **7–13 digits**. Omitted when the visitor leaves it blank. |
| `referredBy` | string | No       | Referral code of the member whose link brought this visitor. Pattern `^[A-Za-z0-9_-]{3,32}$`. Omitted when there is no `?ref=` in the URL.                            |

**Joi schema (`validations/waitlist.validation.ts`)**

```ts
join: Joi.object({
  email: Joi.string().trim().lowercase().email().max(254).required(),
  phone: Joi.string().trim().max(20)
    .custom((v, h) => {
      const d = v.replace(/\D/g, "");
      return d.length >= 7 && d.length <= 13 ? v : h.error("any.invalid");
    })
    .optional(),
  referredBy: Joi.string().trim().pattern(/^[A-Za-z0-9_-]{3,32}$/).optional(),
}),
```

> **Important:** a `referredBy` that is well-formed but **doesn't match any member** must **not** fail the request. Ignore it and store the signup with no referrer. A broken or shared-around link should never stop someone from joining.

### B.2.2 Server-side metadata (not from the body)

As with contact, read these off the request and never trust the body for them:

| Column       | Source                                                                     |
| ------------ | -------------------------------------------------------------------------- |
| `ip_address` | `req.ip`                                                                   |
| `user_agent` | `req.get("user-agent")`, truncated to 512 chars                            |

> Note: because the website proxies the call, `req.ip` will be the website server's IP unless the website forwards `X-Forwarded-For` and `trust proxy` is set. The website can add that header on request; say if you want it.

### B.2.3 Success response: `201 Created` (new signup)

```json
{
  "success": 1,
  "message": "You're on the list.",
  "result": {
    "id": "0b6f5c1e-8a53-4c1e-9d0c-2f4a7e1b9c33",
    "position": 4102,
    "referralCode": "K7X2QM"
  }
}
```

| `result` field | Type            | Meaning                                                                                              |
| -------------- | --------------- | ---------------------------------------------------------------------------------------------------- |
| `id`           | string (UUID)   | Waitlist entry id.                                                                                   |
| `position`     | integer ≥ 1     | The member's **current** place in the queue, after referral credit (see B.4). 1 = front of the line. |
| `referralCode` | string          | This member's **own** code. Must match `^[A-Za-z0-9_-]{3,32}$`. The website builds `<site URL>/waitlist?ref=<referralCode>` from it. Return the code only, not a URL. |

> The website **only** shows the queue badge and referral link when `position` is a number and `referralCode` is a string. If either is missing, the visitor just sees "You're on the list." Both are required for the funnel to work.

### B.2.4 Email already on the list: `200 OK` (idempotent)

Do **not** return an error for a duplicate email. People re-submit, and an error here looks like a failure. Return the **existing** entry's current receipt, with the same shape as above:

```json
{
  "success": 1,
  "message": "You're already on the list.",
  "result": {
    "id": "0b6f5c1e-8a53-4c1e-9d0c-2f4a7e1b9c33",
    "position": 3877,
    "referralCode": "K7X2QM"
  }
}
```

Rules for a repeat submission:
- **Do not** change `referred_by` on the existing entry. The first referrer keeps the credit.
- **Do not** credit a referral again.
- You may fill in `phone` if it was empty before and one is now supplied.

### B.2.5 Error responses

The website shows the `error` (or `message`) text of any **4xx** directly to the visitor, so write it for a person. For **5xx** it shows a generic "Something went wrong" message, so internal details never reach users.

| Status | When                                  | Body                                                                                      |
| ------ | ------------------------------------- | ----------------------------------------------------------------------------------------- |
| `400`  | Validation failed (bad email or phone) | `{ "success": false, "error": "Enter a valid email address." }`. This is what `validate()` already emits via `legacyError`. |
| `429`  | `writeLimiter` tripped                | `{ "success": false, "error": "Too many requests. Please slow down and try again shortly." }`. This is the existing limiter output, so nothing new is needed. |
| `500`  | Anything unexpected                   | Standard error middleware output. Never include stack traces or SQL.                      |

`validate()` joins Joi's messages, and the defaults read like `'email' must be a valid email`. Because visitors see this text, set custom messages on the schema with `.messages({...})`. Suggested strings:
- Missing or invalid email → `"Enter a valid email address."`
- Bad phone → `"That phone number doesn't look right — please check it."`

---

## B.3 Data model: `waitlist_entries`

Sequelize model `src/models/waitlist_entry.model.ts`, following `contact_inquiry.model.ts` conventions (UUID PK, `nowIso()` text timestamps).

| Column           | Type         | Null | Notes                                                                                             |
| ---------------- | ------------ | ---- | ------------------------------------------------------------------------------------------------- |
| `id`             | UUID         | No   | PK, `uuidv4()`.                                                                                   |
| `seq`            | BIGSERIAL    | No   | Join order. Unique, auto-increment. Used for queue maths.                                         |
| `email`          | VARCHAR(254) | No   | Lowercased. **UNIQUE index.**                                                                     |
| `phone`          | VARCHAR(20)  | Yes  | As entered.                                                                                       |
| `referral_code`  | VARCHAR(32)  | No   | This member's code. **UNIQUE index.**                                                             |
| `referred_by_id` | UUID         | Yes  | FK → `waitlist_entries.id`, the member who referred them. Null if none.                           |
| `referral_count` | INTEGER      | No   | Default 0. Number of **new** signups credited to this member. Denormalised for fast ranking.       |
| `source`         | VARCHAR(32)  | No   | Default `"website"`. Future: `"app"`, `"campaign"`.                                               |
| `ip_address`     | VARCHAR(64)  | Yes  |                                                                                                   |
| `user_agent`     | VARCHAR(512) | Yes  |                                                                                                   |
| `joined_at`      | TEXT (ISO)   | No   | `nowIso()` on create. Contract field.                                                             |
| `notified_at`    | TEXT (ISO)   | Yes  | Set when the "we're live" email or SMS goes out (launch job, later).                              |
| `created_on` / `updated_on` / `deleted_on` | ORM | | Standard audit and soft-delete via `SOFT_DELETE_OPTIONS`.                                  |

**Indexes:** `UNIQUE(email)`, `UNIQUE(referral_code)`, `INDEX(referred_by_id)`, `INDEX(referral_count, seq)`.

### Referral code generation
- 6 characters from an unambiguous uppercase alphabet: `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no `0/O/1/I`).
- Generate it, then insert. On a unique-constraint violation, retry with a new code (up to 5 times).
- Codes are permanent and never change once issued.

---

## B.4 Queue position logic

Each member has a **score**. A lower score is closer to the front.

```
score = seq − (referral_count × REFERRAL_BOOST)
position = 1 + (number of active entries with a lower score,
                or the same score and a lower seq)
```

- `REFERRAL_BOOST` = **how many places one successful referral moves you up**. Make it an env var, `WAITLIST_REFERRAL_BOOST`, **default `25`**. The client may want to tune it.
- `position` is **computed at read time**, never stored, because it changes whenever anyone refers someone.
- Soft-deleted entries are excluded.
- Clamp the result to at least 1.

Example SQL:

```sql
SELECT 1 + COUNT(*) AS position
FROM waitlist_entries w
WHERE w.deleted_on IS NULL
  AND ( (w.seq - w.referral_count * :boost) < (:mySeq - :myCount * :boost)
     OR ((w.seq - w.referral_count * :boost) = (:mySeq - :myCount * :boost) AND w.seq < :mySeq) );
```

### Referral crediting (on a **new** signup with a valid `referredBy`)

Do all of this in **one transaction**:

1. Look up the referrer by `referral_code = referredBy`. If none is found, skip crediting.
2. **Block self-referral:** if the referrer's email equals the new email, skip crediting.
3. Insert the new entry with `referred_by_id = referrer.id`.
4. `UPDATE waitlist_entries SET referral_count = referral_count + 1 WHERE id = referrer.id`.
5. Compute the **new member's** position and return it.

**Abuse guard (recommended):** limit how many referrals one referrer can be credited from the same IP in 24h, for example 3. Signups past that still join; they just don't add to `referral_count`.

---

## B.5 Website switch-on checklist

Once the endpoint is deployed:

1. Backend: deploy `POST /api/v1/waitlist` as specced above.
2. Website: in `src/lib/api/waitlist.ts`, set `WAITLIST_ENDPOINT_READY = true`.
3. Website: make sure `API_BASE_URL` is set in the deployed env.
4. Website: make sure `WAITLIST_PREVIEW` is **not** set in production. It returns fake numbers and exists only for demos.

Until step 2, the website form answers "Waitlist signups are not open yet." (503).

---

## B.6 Optional or next-phase endpoints

These aren't needed to go live, but the funnel benefits from them.

### B.6.1 `GET /api/v1/waitlist/status?code=K7X2QM` (public, `readLimiter`)

Lets a returning member check their live position from their own link.

**Query:** `code` (required, same pattern as `referralCode`).

**200**
```json
{
  "success": 1,
  "message": "OK",
  "result": { "position": 3120, "referralCount": 7, "referralCode": "K7X2QM" }
}
```

**404:** unknown code → `{ "success": 0, "message": "Not found", "result": null, "error": "We couldn't find that referral code." }`

> Never return the email or phone from this public endpoint.

### B.6.2 Admin: `GET /api/v1/admin/waitlist` (behind `adminAuthGuard`, permission `waitlist.view`)

For the admin panel, following the `adminContactRouter` pattern.

**Query:** `page` (default 1), `limit` (default 20, max 100), `search` (email contains), `sort` = `position | joined_at | referral_count`.

**200**
```json
{
  "success": 1,
  "message": "OK",
  "result": [
    {
      "id": "0b6f5c1e-…",
      "email": "jane@example.com",
      "phone": "+1 555 010 0199",
      "referralCode": "K7X2QM",
      "referredByCode": "AB12CD",
      "referralCount": 7,
      "position": 3120,
      "source": "website",
      "joinedAt": "2026-09-24T10:15:00.000Z",
      "notifiedAt": null
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 4102, "totalPages": 206, "hasNext": true, "hasPrevious": false }
}
```

`GET /api/v1/admin/waitlist/summary` → `{ total, joinedToday, joinedThisWeek, totalReferrals, topReferrers: [{ referralCode, email, referralCount }] }` (top 10).

`GET /api/v1/admin/waitlist/export` → CSV of all entries, for the launch email and SMS blast. Permission `waitlist.export`.

---

## B.7 Test cases (acceptance)

| # | Scenario | Expected |
|---|----------|----------|
| 1 | New email, no ref | 201; `position` = current count; unique 6-char `referralCode` |
| 2 | Same email again | 200; same `id` and `referralCode`; no new row |
| 3 | Same email in different case or with spaces (`" Jane@Example.com "`) | Treated as the same member (200) |
| 4 | New email with a valid `referredBy` | 201; referrer's `referral_count` +1; referrer's position improves by up to `REFERRAL_BOOST` |
| 5 | Unknown `referredBy` | 201; no error; `referred_by_id` null |
| 6 | Self-referral (own code) | 201 or 200; no credit |
| 7 | Repeat email with a different `referredBy` | 200; original referrer unchanged; no extra credit |
| 8 | Invalid email | 400 with a readable `error` |
| 9 | Phone with 5 digits | 400 with a readable `error` |
| 10 | Burst of requests | 429 from `writeLimiter` |
| 11 | Two concurrent signups on the same ref | `referral_count` +2 exactly (row lock or atomic increment) |

---

# Part C — Quick reference (both forms)

```
POST /api/v1/contact          ✅ live
  Body: { name, email, subject?, message }
  201:  { success: 1, message, result: { id, submittedAt } }
  400:  { success: false, error }        429: rate limited

POST /api/v1/waitlist         ❌ to build
  Body: { email, phone?, referredBy? }
  201 (new) / 200 (existing):
        { success: 1, message, result: { id, position, referralCode } }
  400:  { success: false, error }        429: rate limited
```
