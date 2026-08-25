# BlackNexa — Design Implementation Plan
### Auth flow + full Report module (design sections A · B · C · D)

**Source of truth:** `BlackNexa Screens.dc.html` (Claude Design project `35599e91-ed55-453f-b8e5-6048577c16b3`), plus the imported `StatusBar.dc.html` / `TabBar.dc.html` components.
**Scope reviewed:** A1–A15 (onboarding & account), B1–B7 (home feed), C1–C11 (report wizard), D1–D12 (report detail). 51 artboards.
**Repos:** `mobile-app` (Expo 54 / RN 0.81 / expo-router 6), `blacknexa-backend` (Express + Sequelize + Postgres).
**Written:** 2026-08-22

**Companion document:** [`FEATURE_BUILD_PLAN.md`](./FEATURE_BUILD_PLAN.md) — data model, API contract, business rules, notification and email delivery, the moderator surface, the profile module, and the phasing that produces working software. This document is the UI spec; that one is the functional spec. Read both.

---

## 0. Executive summary

The design is a **complete visual and behavioural reset**, not a refresh. Three facts drive the whole plan:

1. **The theme inverts.** The design is a light surface system on Signal Blue `#0A7CFF` with Spectral + Work Sans. The app today is a dark surface system on gold `#E8B15C` with system fonts. Every screen in scope is re-skinned, and the existing dark-gold look survives only as the optional `gold` theme the design still ships.
2. **Auth does not exist yet.** The app has consent checkboxes (`app/onboarding.tsx`) and Rork OAuth for Google/Apple. The design specifies 15 screens including email sign-up, a 4-step wizard, email OTP verification, password reset, and two permission-priming screens. The **backend has no end-user auth at all** — only `admin_users`. `userAuthGuard` exists and is unused.
3. **The report module has the right bones in the wrong shape.** `POST /api/v1/geo-legal/incident/create` stores a sealed payload, evidence, and a dispatch audit — the privacy and sealing primitives are real and worth keeping. But it has no title, no occurred-vs-filed distinction, no location precision, no status timeline, no case reference, no social layer (support / corroborate / comment / flag), no feed, no search, and evidence arrives as base64 in a JSON body. The mobile side is worse: `app/report.tsx` is one 1087-line scrolling form and the feed reads `mocks/incidents.ts`, never the API.

**Recommended sequencing:** foundations → auth → wizard → feed → detail → hardening. Auth must land first because everything in C and D is scoped to a real user id and the anonymity model depends on it.

### Decisions — locked 22 Aug 2026

| # | Question | Decision | Decided by |
|---|---|---|---|
| 1 | Feed card treatment: 1a editorial / 1b evidence strip / 1c dense | **1a — editorial, lead image, title first.** Final. See §3.3 for the full spec and the no-image variant this forces. | Client |
| 2 | Default theme | **`signal` light — white ground, Signal Blue `#0A7CFF`**, exactly as drawn. See §1.5 for the dark-mode consequence. | Client |
| 3 | Audio in C2 | **No transcription, ever.** Recording attaches an audio file to the report, and audio is also a first-class attachment type on C5. | Client |
| 4 | Wizard chrome: 1d segment bar / 1e named rail / 1f quiet | **1d**, as C1–C7 are drawn. Costs 100px of vertical space per step and buys legible position. | Assumed |
| 5 | C4 says the location default is "labelled but never pre-ticked"; C6 shows Public **selected** | **Visibility is pre-filled from the A9 profile default** — the user made that choice deliberately and it is the same field. **Precision is not pre-ticked**, only labelled `YOUR DEFAULT`, as drawn. The two behave differently on purpose. | Assumed |
| 6 | Category set grows 7 → 9 (**Digital**, **Other** are new) | Extend the enum to 9. `digital` maps to digital-rights and privacy agencies; `other` falls back to the category-agnostic civil-rights set so dispatch never returns an empty list. | Assumed |
| 7 | "Two nav treatments are shown in section J" — section J is not in the file | **Lock `TabBar.dc.html` as drawn**: 5 tabs, centre `+` at 50×50 r17 accent, `marginTop -7`, accent shadow. Revisit if section J arrives. | Assumed |
| 8 | Profile leaves the tab bar | Confirmed. 5 tabs + centre `+`; Profile becomes the header avatar on B1 and the screen moves to `app/profile.tsx`. Deletes both `app/(tabs)/report.tsx` and `app/(tabs)/profile.tsx`. | Assumed |

---

## 1. Design system foundations

Everything below is lifted verbatim from the design's `:root` block and the SYSTEM artboard. Implement it as tokens so no screen ever hardcodes a hex or a radius.

### 1.1 Colour tokens (default `signal` theme, light)

```
bg      #FFFFFF   deep    #0E1116
s0 #FFFFFF  s1 #F1F5FA  s2 #FFFFFF  s3 #F5F7FA
s4 #EAF2FE  s5 #EEF2F7  s6 #E6ECF4  s7 #D6DEE8  ph #DFE5EC
t0 #0E1116  t1 #2C3542  t2 #55606E  t3 #7A8593  t4 #98A2AE  t5 #B3BCC7
line    #D5DCE4
acc     #0A7CFF   onAcc  #FFFFFF
ok      #1A8F4C   warn   #B26A00   bad  #D23B33   bad2 #C2352E
corro   #6D5BC4
c1 #C4603A Policing    c2 #7E5BB8 Profiling   c3 #2E6FB8 Housing
c4 #5E7F3A Workplace   c5 #A85C86 Education   c6 #2F8A82 Medical
c7 #3D63A8 Digital     c8 #B5734A Harassment  c9 #7A8593 Other
map #EBEFF3  map2 #E6EBF0  road #D8DEE6  road2 #E2E7ED
```

Alternate themes in the design: `indigo`, `emerald`, `mono`, `gold` (dark). **v1 ships `signal` light only** (decision 2). Build the token layer theme-capable so the others are a token swap, but wire none of them into the UI yet.

**Three guardrails the design states explicitly — enforce them in review:**
- One accent colour, and **one primary action per screen**. (A5 Welcome deliberately has *no* accent button: none of its four routes is the app's recommendation.)
- Green / amber / red carry **status meaning only**, never decoration.
- Category colour appears **only as a 6–7px dot**, never as a fill.

### 1.2 Type scale

| Role | Family | Size / line | Notes |
|---|---|---|---|
| Display | Spectral 600 | 28–46 / 1.08–1.16, `-0.02em` | Screen headlines, report titles |
| Title | Spectral 600 | 19–21 / 1.22–1.26 | Card titles, sheet titles |
| Body | Work Sans 400 | 14 / 1.55 | Report body is 15 / 1.62 on D1 |
| Label | Work Sans 600 | 13 | |
| Meta | Work Sans 500 | 12 | |
| Eyebrow | Work Sans 600 | 10.5, `0.16em` | Uppercase section headers |

**12px is the UI floor.** Anything below it in the artboards (10.5px eyebrows, 11.5px meta) is decorative or secondary and must not be the only carrier of information.

Fonts are not in the app today. Add `@expo-google-fonts/spectral` (400/500/600/700 + italic 400) and `@expo-google-fonts/work-sans` (400/500/600/700), load via `expo-font` `useFonts`, and hold the splash until loaded. On Android, `fontWeight` does not synthesise — map each weight to its own family name in the typography helper.

### 1.3 Component primitives (`components/ui/`)

| Primitive | Spec from design |
|---|---|
| `Button` primary | h 50–52, r 14, `acc` bg, Work Sans 600 15–15.5 |
| `Button` secondary | h 46, r 13, `s6` bg, 600 14 |
| `Button` quiet | h 46, r 13, 1px `rgba(t0,.16)` border, `t2` text |
| `Button` destructive | h 50, r 14, `bad` bg (C11) or `rgba(bad,.12)` + `bad2` text (D2) |
| `Chip` filter | h 34, r 17, pad 0 13, selected = `acc`/`onAcc`, idle = `s5`/`t1`; count at `opacity .6` when selected, `t4` when idle |
| `Chip` segment | h 36–38, r 12, selected `acc`, idle `s5` |
| `StatusPill` | h 24, r 7, pad 0 9, 600 11, bg = status at 13–16% alpha, text = status |
| `Card` | `s3` bg, r 16–18, pad 14–16, **no border**; hairlines `rgba(t0,.07)` only *inside* a card |
| `Switch` | 44×26, r 13, knob 20 inset 3; on = `acc`, off = `s7` with `t3` knob |
| `CategoryDot` | 7px standalone, 6px inside a chip |
| `Sheet` | r 24 24 0 0, grabber 38×4 r 2, backdrop `rgba(deep,.60–.66)` |
| `Dialog` | inset 26px, r 20, pad 22, centred, backdrop `.76` (C11) |
| `ProgressSegments` | h 3, r 2, gap 4 (wizard) / 5 (sign-up), filled `acc`, empty `rgba(t0,.10–.12)` |
| `OtpInput` | 6 cells, flex 1, h 58–60, r 13, `s3`; focused cell `s2` + 1.5px `acc` border + 2px caret |
| `Skeleton` | `s5`/`s6` bars, r 5–6, opacity ladder 1 → .8 → .65 → .4 by depth (D6) |
| `EmptyState` / `ErrorState` | 58px r 19 icon tile, Spectral 21 headline, body 13.5 / 1.6, one recovery action per cause |

### 1.4 Layout constants

- Screen horizontal padding: **16** (feed), **18** (wizard, detail header), **20** (detail body, auth forms, sheets), **24** (auth hero screens).
- Sticky footer: `paddingTop 10–14`, `paddingBottom Math.max(insets.bottom, 12)`. The artboards' flat `30px` bottom padding is `12 + 18` on a 390×844 iPhone frame — never hardcode it.
- Sheet heights in the artboards (610 filters, 640 flag, 700 trust) must become **fractions of screen height** with a max, or they overflow on an iPhone SE and float on a Pro Max.

### 1.5 Dark mode — the consequence of decision 2

The design has **no dark variant of `signal`**. Its only dark palette is `gold`, and even that is supplied at token level only — none of the 51 artboards is drawn in it. So:

- **Lock the app to light**: `"userInterfaceStyle": "light"` in `app.json`, and `<StatusBar style="dark" />` at the root. Today `app.json` says `"automatic"` and `app/_layout.tsx` renders `<StatusBar style="light" />`, which is why the current build shows light status-bar glyphs. Both must change or the status bar will be invisible on a white header.
- **Do not let dark mode half-apply.** With `automatic`, any native surface the app does not paint (keyboard accessory, share sheet, `Alert`, the Android nav bar) flips to dark while the app stays light. Locking it is what keeps the design honest.
- A real dark theme is a later release and needs a design pass over all 51 screens, not a token swap — the artboards make contrast decisions (`.07` hairlines, `.72` scrims, tinted status pills at 13–16%) that do not survive inversion mechanically.

---

## 2. Section A — Onboarding & account (A1–A15)

### 2.1 What exists today

| Piece | State |
|---|---|
| `app/onboarding.tsx` | Consent-only screen: two checkboxes + Continue. Dark/gold. Not in the design. |
| `providers/AuthProvider.tsx` | Rork OAuth PKCE for Google/Apple only. Tokens in `expo-secure-store`. No email path, no register, no reset. |
| `ConsentGate` in `app/_layout.tsx` | Routes to `/onboarding` until `consentTos && consentPrivacy && consentVersion >= LEGAL_VERSION`. |
| Backend | **Nothing.** Only `admin_users` + `/api/v1/admin/auth/*`. `userAuthGuard` built and unattached. |

### 2.2 Screen-by-screen

| # | Screen | Verdict | Implementation notes |
|---|---|---|---|
| A1 | Splash | **New** | Logo tile 68px r 21, gradient `s6→s2`, 1px `rgba(acc,.34)` border. Brand Spectral 600/36. Tagline 10.5 tracking `.22em`. Progress bar 118×2.5 appears **only after a delay** — mount it behind a 600ms timer so a warm launch never flashes a loader. Respect `isReduceMotionEnabled` (static bar, no `bnBar` sweep). |
| A2–A3 | Intro carousel, 3 slides | **New** | Full-bleed art + 4-stop scrim to `bg` at 82–88%. `Skip` top-right. Eyebrow (`DOCUMENT`/`PRESERVE`/`CONNECT`) in `acc`. Display Spectral 38/1.1. Dots **stretch** (26×4 active, 8×4 idle) — not fill. Slides 2–3 add two icon proof-rows. CTA becomes `Get started` on the last slide. Use a paged `FlatList`, not a gesture lib. |
| A4 | Location priming | **New** | Shown **before** the OS prompt. Three benefit cards. `Allow location` primary + `Not now` quiet + "You can file a report without it." On denial: cards stay, headline swaps to "Location is off — that's fine." |
| A5 | Welcome | **New** | Brand band image 330px + scrim. **Four equal-weight buttons, no accent** — Apple (`t0` fill), Google (`s5` + real 4-colour mark), Email (`s5`), Log in (quiet border). Legal line at the bottom. The 150px top padding must become `insets.top + band ratio`. |
| A6 | Sign-up · Account | **New** | Step 1/4. Email + password. Strength meter = 4 segments (warn/warn/empty/empty = "Fair — two more to go"). Four requirement rows: **grey circle until met, then green tick — never red while typing.** `Continue` is **always enabled**; tapping it early scrolls to the first problem and prints the rule under that field. |
| A7 | Sign-up · Terms | **New** | Step 2/4. Terms/Privacy segmented tabs, horizontal section chips, scrollable doc pane with a **3px scroll-progress rail**. Each checkbox unlocks **only after its own document is scrolled to the end** (second row at `opacity .5` until then) and states its consequence beneath the label. |
| A8 | Sign-up · Verify | **New** | Step 3/4. 6 OTP cells, paste + autofill, **auto-submits on the sixth digit**. Resend countdown `0:24`. Wrong code → row shake + clear. |
| A9 | Sign-up · Profile | **New** | Step 4/4. Avatar mode chips Photo / **Initials** / Anonymous. Display name. "Stay anonymous" switch **dims the identity block and live-previews the author row**. Default visibility: Public / **Trusted Circle (RECOMMENDED)** / Private, each stating its consequence. CTA is `Finish`. |
| A10 | Log in | **New** | Error banner: **"That email and password don't match."** — identical for a wrong password and an unknown email, so the screen never confirms whether an account exists. `Use Face ID` quiet button below the primary. |
| A11 | Notification priming | **New** | Names exactly **four** notification types with a status-coloured dot each, and states that urgent safety notices **cannot be turned off**. "No digests, no marketing, no engagement nudges." In Settings this is **one switch, not four**. |
| A12 | Coach marks | **New** | 4 steps over the **real** Home feed at `opacity .5` + `rgba(deep,.78)` scrim. Accent-ringed 74px cut-out over the centre `+`. Step dots, `Skip tour` always reachable. |
| A13 | Reset request | **New** | "If an account exists for this address, a code is on its way. We don't say whether one does." Response must be **identical** either way, including timing. |
| A14 | Reset code + new password | **New** | **One screen, not two.** 6 OTP cells + new password + strength + 3 requirement rows (incl. "Not a password you have used here before"). Resend countdown. |
| A15 | Reset done | **New** | States the side effect plainly: "You're logged in on this device. **Every other device has been signed out.**" |

Retire `app/onboarding.tsx`. Consent moves into A7 and is recorded server-side.

### 2.3 Backend — new user-auth surface

The JWT machinery in `src/services/auth.service.ts` (access/refresh split, `typ` discriminator, `jti` rotation, timing-equalised login) is the right pattern. **Do not fork it — generalise it.**

**Type change required.** `AccessTokenPayload.role` is typed `AdminRole`. Widen it:

```ts
export type UserRole = "member" | "advocate" | "moderator";
export type ActorRole = AdminRole | UserRole;
// AccessTokenPayload.role: ActorRole
```
`checkRole(allowed: AdminRole[])` stays admin-only; add `checkUserRole` for the moderator paths.

**Session model change required.** `admin_users.refresh_token_id` is a single column — one session per account. A15 promises *"this device stays, every other device is signed out"*, which is impossible with one column. Add:

```
user_sessions(id, user_id, refresh_jti, device_label, platform,
              push_token, last_seen_at, created_on, revoked_at)
```

New models: `app_users`, `user_sessions`, `email_otps` (purpose = `verify_email` | `reset_password`, code hash, expires_at, attempts, consumed_at), `user_consents` (doc, version, agreed_at, ip_hash), `password_history` (for A14's "not a password you have used here before").

New files: `models/app_user.model.ts`, `models/user_session.model.ts`, `models/email_otp.model.ts`, `services/user_auth.service.ts`, `services/mailer.service.ts`, `controllers/user_auth.controller.ts`, `routes/auth.route.ts`, `validations/user_auth.validation.ts`.

| Method | Path | Serves |
|---|---|---|
| POST | `/api/v1/auth/register` | A6 → creates unverified user, sends OTP |
| POST | `/api/v1/auth/verify-email` | A8 |
| POST | `/api/v1/auth/resend-code` | A8, A14 (rate-limited, countdown-backed) |
| POST | `/api/v1/auth/login` | A10 |
| POST | `/api/v1/auth/oauth/apple` · `/google` | A5 |
| POST | `/api/v1/auth/refresh` | silent refresh |
| POST | `/api/v1/auth/logout` · `/logout-all` | Settings, A15 |
| POST | `/api/v1/auth/password/forgot` | A13 |
| POST | `/api/v1/auth/password/reset` | A14 → revokes all sessions **except the caller's** |
| GET | `/api/v1/auth/me` | boot |
| PATCH | `/api/v1/users/me` | A9 + Settings (display name, avatar mode, anonymity default, default visibility, default precision) |
| POST | `/api/v1/users/me/consents` | A7 |
| POST | `/api/v1/users/me/devices` | A11 push token |

**Security acceptance criteria (test these explicitly):**
- `login` returns byte-identical bodies and statistically indistinguishable timing for unknown-email vs wrong-password.
- `password/forgot` returns `200` with the same body whether or not the address is registered.
- `password/reset` leaves exactly one live session — the caller's.
- OTP: 6 digits, 15-minute TTL (A13 states this in copy), max 5 attempts, single-use, hashed at rest.
- `email` is never echoed in an error message.

### 2.4 Mobile auth plumbing

Replace `AuthProvider` with one that talks to *our* backend and keeps Rork OAuth only as a social provider bridge:

- `access_token` in memory + `expo-secure-store`; `refresh_token` in `expo-secure-store` only.
- A single `api` client with a refresh-on-401 mutex (one in-flight refresh, queued retries) — the existing `pendingExchangeRef` dedup pattern in `AuthProvider` is the right idea, generalise it.
- Face ID (A10) via `expo-local-authentication` gating a stored refresh token. **Add the dependency** — it is not in `package.json` today.
- Route groups: `app/(auth)/*` and `app/(app)/*`, with the root `index.tsx` acting as the splash + gate. Replace `ConsentGate` with an `AuthGate` that also checks `emailVerified` and `profileComplete`.

---

## 3. Section B — Home feed (B1–B7)

### 3.1 What exists today

`app/(tabs)/index.tsx` (374 lines) renders `MOCK_INCIDENTS` merged with AsyncStorage-persisted local reports via `IncidentsProvider`. **No API call is made for the feed at all.** Search is an inline `TextInput` in the header; filters are a single chip row with no counts; there is no sort, no filter sheet, no notification centre, no search screen.

### 3.2 Screen-by-screen

| # | Screen | Verdict | Notes |
|---|---|---|---|
| B1 | Feed | **Rebuild** | Header: 34px avatar tile / brand Spectral 18 / search + bell with an 8px accent dot. **Filter bar is pinned under the header and never scrolls away**: `Filters` chip with a 16px count badge (fixed left), category rail (scrolls, `mask-image` fade on the right edge so it reads as more-to-come), `Newest ⌄` sort chip (fixed right). Below: `17 reports · Policing · Newest first` + `Clear all`. Card = treatment **1a**, specified in full in §3.3 — note that the B1 artboard is drawn with 1b, so **the artboard is not the reference for the card**; option 1a is. |
| B2 | Filters sheet | **New** | Draggable half sheet. Category chips, When (Today/7/30/All), Where (`Near me · Atlanta, GA` + Change), `Verified only` and `Urgent only` switches. **Every option carries a live count** ("9 of 17") so nothing leads to an empty result by surprise. CTA prints the outcome: `Show 17 reports`. |
| B3 | Notification centre | **New** | One title, one description line, one timestamp. Unread on `s4`, read on `s1`. **No icons, no counts, no badges.** Day groupings. `Mark all read`. |
| B4 | Search focused | **New** | Search field + `Cancel`. `RECENT` rows individually removable (× per row) + `Clear`. `BROWSE BY CATEGORY` chips as a way in when nobody knows what to type. |
| B5 | Search results | **New** | Each row states **which field matched**: `MATCHED IN TITLE` / `DESCRIPTION` / `AREA` / `CATEGORY`, with the term highlighted at `rgba(acc,.25)`. |
| B6 | Zero result | **New** | Names the likely typo (`Did you mean utica ave?`), says filters are involved (`2 filters on`), and gives **one recovery per cause**: `Search "utica ave" everywhere` + `Clear both filters`. |
| B7 | Sort sheet | **New** | Three options — Newest first / Most supported / Most corroborated — active one ticked **and** tinted `rgba(acc,.08)`, each with the sentence saying what it actually orders by. |

### 3.3 Feed card — treatment 1a

**Read the artboards in this order for B1:** option `1a` is the card; artboard `B1` is the header, the pinned filter bar and the result line. B1 draws its cards in 1b, so ignore the card geometry there.

#### The with-image card (as drawn in 1a)

```
Card              s3 bg · r 18 · overflow hidden
├─ Lead band      h 190 · relative
│    image        first photo, else first video poster frame
│    ↖ badges     flex, gap 6 — solid-over-photo variants:
│                 URGENT   h23 · pad 0 9 · r7 · rgba(bad,.90) · onAcc · 700 10.5 · +.04em
│                 VERIFIED h23 · pad 0 9 · r7 · rgba(ok,.90)  · onAcc · 700 10.5
│    ↘ files      "+3 files" · h24 · pad 0 9 · r7 · rgba(deep,.72) · 600 11
├─ Body           pad 15
│    meta         [dot 7 · category 500 12 t2] · "·" t5 · "area · 2h" 400 12 t4
│    title        Spectral 600 21/1.24 · −.008em · mt 9
│    excerpt      Work Sans 400 13.5/1.52 t2 · mt 7 · 2 lines, tail-clipped
│    footer       mt 14 · space-between
│      left       "Anonymous · 142 standing with · 31 comments" 400 12.5 t4
│      right      Stand with · h32 · pad 0 13 · r16 · s6 · 600 12.5 · heart 14
```

Six consequences of 1a over 1b, each one a real behavioural change:

1. **No author row.** The avatar tile and author line at the top of a 1b card are gone; authorship moves into the footer meta sentence. The feed therefore needs no avatar images at all — one less asset path, one less loading state.
2. **Status badges get a second variant.** Over a photo, a 16%-alpha tint is invisible, so 1a uses a near-solid fill. Keep both variants in `StatusPill`: `tint` (used on D1, D2, and the no-image card) and `onMedia` (used on the lead band). Same token, different alpha — not a new colour.
3. **Evidence count moves onto the image** as `+3 files`, replacing 1b's `4 files` footer item. Note 1a's label counts *additional* files beyond the lead; 1b's counted all of them. Off-by-one is the likely bug here — `+{total - 1} files`, hidden when `total <= 1`.
4. **No corroboration count on the card.** 1b and 1c both show it; 1a's footer sentence is author, support, comments only. The design's own "try next" note even suggests dropping it from the card entirely. Corroboration surfaces on D1 and nowhere earlier — accept this, it is a deliberate simplification.
5. **`Stand with` is a labelled chip, not a bare count** — the count already sits in the footer sentence. Idle `s6`/`t1`; active fills `acc`/`onAcc` and reads `Standing with`. It stays the one tappable thing in the footer.
6. **Cards get taller.** ~335px with an image versus 1b's ~300px, so roughly 1.7 cards per viewport instead of 2.2. Raise the prefetch threshold and page size accordingly, and expect scroll-position restoration to matter more.

#### The no-image card — the one thing 1a forces us to invent

The design flags this itself: *"Strongest when there is a good photo; weakest when there is none, which is often."* No artboard draws it. Three options were considered — fall back to the 1b layout (mixed rhythm, two card identities in one feed), generate a category-tinted placeholder band (fabricates a visual where there is no evidence), or drop the band. **Decision: drop the band.**

```
Card              s3 bg · r 18 · pad 15
├─ meta row       [dot 7 · category] · "·" · area · time
│                 then tinted status pills inline: URGENT, VERIFIED
├─ title          Spectral 600 21/1.24 · mt 9      ← same as 1a
├─ excerpt        400 13.5/1.52 t2 · mt 7 · 3 lines (one more than the image card)
└─ footer         mt 14 · identical to 1a
```

Rationale: it keeps one component with a `hasLeadImage` branch, preserves 1a's exact typography so the feed still reads as one system, and never invents imagery for a report that has none. Status badges relocate from the band into the meta row in their **tinted** variant — which is precisely why both pill variants exist. Height ≈ 190px.

**What counts as a lead image:** the first `photo`, else the first `video`'s poster frame (with a play affordance and duration over it). An audio-only or document-only report has no lead image and takes the text-first card — worth saying out loud, because a report with four PDFs still shows `+3 files` nowhere and must not look broken.

Two fixed heights (≈335 / ≈190) mean `getItemLayout` stays viable on `FlatList`, which variable-height 1b would not have allowed. Take that win: it is the difference between smooth and janky scroll restoration on a long feed.

#### API consequence

The feed projection must return, per report, enough to pick a variant **without a second request**: `leadMedia: { kind, thumbUrl, posterUrl?, durationMs? } | null` and `mediaCount`. Deciding the variant client-side from a media array means the card cannot render until media resolves — which produces exactly the layout shift the fixed heights were meant to prevent.

### 3.4 Backend — feed, search, notifications

```
GET  /api/v1/reports?category=&when=&near=&radius=&verifiedOnly=&urgentOnly=&sort=&cursor=&limit=
GET  /api/v1/reports/facets?<same filters>     → counts per category / when / verified / urgent
GET  /api/v1/reports/search?q=&<filters>       → { matchedIn, snippet, suggestion }
GET  /api/v1/notifications?cursor=
POST /api/v1/notifications/read-all
```

- **`/facets` is not optional.** B1's chip counts and B2's "9 of 17" both need counts computed under the *other* active filters. Return them in one call alongside the page, or as a sibling endpoint the client fetches in parallel.
- `sort=newest|supported|corroborated`, cursor-paginated (keyset on `(sort_key, id)` — do not offset-paginate a feed).
- Search: Postgres `tsvector` over title + description + area label, plus a category-name match, returning `matchedIn` as the highest-priority matching field. `suggestion` via `pg_trgm` similarity against a term dictionary — this is what powers B6's "Did you mean".
- Notifications: exactly the four types A11 promises (`status_change`, `corroboration_or_reply`, `dispatch_ready`, `urgent_safety`). `urgent_safety` **ignores preferences** — enforce that in the dispatcher, not the client.
- Feed projection must strip author identity for anonymous reports and must never return `user_id`.

---

## 4. Section C — Report wizard (C1–C11)

### 4.1 What exists today

`app/report.tsx` — one 1087-line screen with everything on a single scroll: category chips, title, summary, area, photo picker, privacy level, plus compliance/security/credibility cards. It writes through `IncidentsProvider.createIncident` to **AsyncStorage**, and separately can call `GeoLegalProvider.createIncident` → `POST /api/v1/geo-legal/incident/create`. There is no draft, no step model, no date/time, no location precision, no per-file upload state, no review, no receipt.

`app/(tabs)/report.tsx` also exists as a tab — the design makes this a **full-screen modal from the centre `+`**, so the tab is deleted.

### 4.2 Screen-by-screen

Global chrome (variant **1d**): `×` / `New report` + `Draft saved · 9:41 PM` / `?` help. Then `Step N of 7 · Name` and 7 progress segments. Footer: `Back` (88px quiet) + `Next` (flex accent), separated by a hairline.

**Two behavioural rules the design states and the current form violates:**
- `Next` is **never disabled**. Tapping it with something missing scrolls to the first problem and prints the rule in words under that field.
- Nothing is half-filed. `×` opens C10, not a dismissal.

| # | Step | Notes |
|---|---|---|
| C1 | Category | 9 rows, **nothing pre-selected**. Dot is the only colour; each row carries a one-liner so nobody guesses what a word covers. Adds **Digital** and **Other** to the current 7. |
| C2 | Details | Title, 70-char cap with a `44/70` counter and the hint "One line. It is what people see first." Body textarea 230px. **`Record audio instead`** — attaches an audio file to the report, explicitly *not* transcribed and with no live waveform in the text field. Collapsible "Not sure where to start?" with four prompts. |
| C3 | Date & time | `It's happening now` switch (collapses everything below to one line). Quick chips Today / Yesterday / This week. Date row, Time row. `I'm not sure of the time` → swaps Time for Morning / Afternoon / Evening / Night. **Future dates unselectable.** A card always restates **Occurred** vs **Filed** plus "A gap between the two is normal and is never held against a report." |
| C4 | Location | `Use my location` / `Type an address`, with "We ask you here first. The system prompt only appears after you tap." Precision: Exact / **Approximate** / Hidden. Map preview **changes variant with the choice** — pin, soft radius with no pin, blurred with a lock — and is captioned "This is what other people will see." Your default is **labelled but not pre-ticked**. |
| C5 | Evidence (optional) | Six 76px entry tiles: Photo, Video, Audio, Library, Screenshots, Files. `ATTACHED · 4`. Each row resolves from an upload progress bar (`Uploading 62%`) to `Captured 7:22 PM · Sealed 9:41 PM` with a green shield tick. |
| C6 | Flags | `Mark as urgent` — the card prints its consequence **in both states** ("On: a moderator sees it within the hour…  Off: …usually a day"). Visibility 3 cards. `File anonymously` switch. `HOW OTHERS WILL SEE IT` **live mini feed card**. |
| C7 | Review | Six labelled blocks, each with an `Edit` that jumps to its step **and returns here**. Collapsible "What happens when you file". Truth attestation checkbox. CTA becomes `File report`. |
| C8 | Submitting | **Never optimistic.** Three real rows — `Sealing 4 files` (done) / `Uploading 62%` (spinner, percentage on the row actually working) / `Filing the report` (pending). "There is no way to close this screen — nothing is half-filed." Block the Android back button and disable the swipe gesture. |
| C9 | Receipt | `CASE REFERENCE` **BNX-4471** + Copy. `WHAT WAS SEALED` per-file with `Sealed 4:12 PM`. `WHO CAN SEE IT` in plain words including "Moderators can still see who filed it." `WHERE IT IS NOW` 3-node stepper. And the sentence people most need: **"Nothing has been sent to any outside organisation."** `View report` / `Done`. |
| C10 | Save or discard | Sheet from `×`. Names the step ("You're on step 4 of 7") and what a draft keeps. Draft preview card. Three actions in order of likelihood: `Save draft` (accent) / `Keep writing` / `Discard` (last, red, never the default). |
| C11 | Discard confirm | A **centred dialog, not a sheet**, so it doesn't look like the step it interrupts. `Discard it` (red) then `Keep the draft` — the safe choice is the wider target. |

### 4.3 Backend — modify the existing report module

Keep the module's identity (`incidents` → reports) and its two genuine safety properties: **dispatch is never automatic** (`humanConfirmed` gate + `AUDIT_RECORDED` status) and **erasure is a real hard delete**. Change the shape around them.

**Schema migration.** Extend `incidents` (rename to `reports`, keep a view or alias for one release):

```
+ case_ref            unique, BNX-####  (sequence-backed)
+ title               varchar(70)
+ body_sealed         text            -- existing sealed_payload semantics
+ occurred_at         timestamptz
+ occurred_precision  enum(exact, time_unknown, day_part) + day_part enum
+ filed_at            timestamptz
+ location_precision  enum(exact, approximate, hidden)
+ location_label      varchar         -- "Brownsville, Brooklyn"
+ location_public     geography(Point) -- rounded to the precision, safe to serve
+ location_exact_sealed text          -- exact coords, sealed; owner + moderators only
+ visibility          enum(public, trusted, private)
+ anonymous           boolean
+ urgent              boolean
+ status              enum(draft, submitted, under_review, verified, dismissed)
+ evidence_strength   enum(thin, fair, strong, very_strong)
+ support_count, comment_count, corroboration_count, view_count  int
~ category            widen to 9 values
```

New tables:
```
report_drafts(id, user_id, step, payload_json, updated_at)
report_status_events(id, report_id, status, actor_kind, actor_id, note, at)
report_evidence(id, report_id, kind, mime, bytes, duration_ms, storage_key,
                sha256, captured_at, sealed_at, thumb_key, metadata_scrubbed,
                upload_state)
report_supports(report_id, user_id, at)                 -- unique pair
report_corroborations(report_id, user_id, note, at)     -- unique pair
report_comments(id, report_id, parent_id, user_id, anonymous, body,
                like_count, status, created_on)
comment_likes(comment_id, user_id)
report_flags(id, flag_ref FLG-####, report_id|comment_id, reporter_id,
             reason, note, status, created_on)
report_views(report_id, day, count)                     -- rolled up, not per-view
report_share_links(id, report_id, token, created_by, created_on)
```

**Evidence upload must change transport.** Today evidence is base64 inside the JSON body of `incident/create`. C5 shows a 24.8 MB video with per-file progress — base64-in-JSON cannot do that (33% inflation, no progress, no resume, and it hits `express.json` limits). Replace with:

```
POST /api/v1/reports/:id/evidence/presign        → { evidenceId, uploadUrl, headers }
PUT  <uploadUrl>                                  (direct to S3, client reports progress)
POST /api/v1/reports/:id/evidence/:eid/commit    → { sha256, capturedAt, durationMs }
GET  /api/v1/reports/:id/evidence/:eid/url       → short-lived presigned read
```

`s3.service.ts` and the hardened `upload.middleware.ts` already exist and are unused — this is what they were built for. **"Sealed" is the server's hash-on-arrival**: on `commit`, the server verifies the object's SHA-256 against the client-declared value, stamps `sealed_at`, and refuses the file on mismatch. That timestamp is what C5, C9, D3, D11 and D12 all display.

**Endpoints:**
```
POST   /api/v1/reports/drafts            create / upsert (autosave, powers "Draft saved · 9:41 PM")
GET    /api/v1/reports/drafts
DELETE /api/v1/reports/drafts/:id
POST   /api/v1/reports                   file a draft → { caseRef, sealed[], status }
GET    /api/v1/reports/:idOrRef          viewer | owner projection
PATCH  /api/v1/reports/:id               owner edit
DELETE /api/v1/reports/:id               erasure (existing semantics, keep the copy)
```

Keep `/api/v1/geo-legal/incident/*` mounted as deprecated aliases for one release so the shipped app does not break mid-migration. Add them to `ROUTE_MANIFEST` marked deprecated.

**Case reference.** `BNX-####` from a Postgres sequence, zero-padded, never derived from the row id. Same for `FLG-####`.

**Draft strategy.** Local-first: the wizard writes to a local store on every field change (debounced 400ms) and syncs to `/reports/drafts` opportunistically. The header's "Draft saved · 9:41 PM" reflects the **local** save so it is honest offline; a subtle sync indicator can reflect the server. Never block a step transition on a network call.

---

## 5. Section D — Report detail (D1–D12)

### 5.1 What exists today

`app/incident/[id].tsx` (695 lines) reads from the local `IncidentsProvider` and composes `CredibilityCard`, `CustodyCard`, `SecurityCard`, `AdvocacyCard`, `DispatchCard`, `DisclaimerModal`. The information architecture is different from the design and the trust story is spread across four cards.

The design's rule: **"There is exactly one trust card on the page and it holds three plain signals; every hash, cipher and percentage lives one sheet down."** That is a consolidation, not a re-skin — `CredibilityCard` + `CustodyCard` + `SecurityCard` collapse into one card on D1 plus the D3 sheet.

### 5.2 Screen-by-screen

| # | Screen | Notes |
|---|---|---|
| D1 | Detail · viewer | **The header carries the title, never the category** — back / truncated title (max 230px, ellipsis) / share, on a hairline. Body order: badge row (URGENT / VERIFIED / category dot / PUBLIC) → Spectral 29 title → author row → `HAPPENED` + `FILED` pair between hairlines → body 15/1.62 → `EVIDENCE · 4 FILES` as a 4-up square grid with per-file timestamps, a green shield on sealed items, `+1` overflow tile → 172px map with `Approximate · Brownsville, Brooklyn` chip → support card (`142 standing with`, `Corroborated by 12 people · 23 comments`, `Corroborate` button) → 3 preview comments + `See all 23 comments` → **the one trust card** (`Protected & verified`, collapsible, three plain lines incl. `Evidence strength: Strong`) → `ORGANISATIONS THAT HANDLE THIS` (2 cards) → reference + `Flag this report`. **Sticky bottom bar:** `Stand with · 142` (accent, flex) + comment icon + share icon, both 50×50 `s5`. |
| D2 | Detail · owner | **A separate screen, not a variant.** No `Stand with`, no `Flag`. Status timeline high up (Submitted → Under review → Verified, with timestamps and "by a moderator"). `WHO HAS SEEN THIS` (community views / moderators / **outside organisations: None**). `Send this somewhere` dispatch card — gated on verified. `Edit report` / `Delete`, with "Deleting removes it from the feed and from your Vault. Sealed files are destroyed after 30 days." |
| D3 | Trust sheet | **The only place technical language is allowed**, and even here every section hides its specs behind `Show the technical detail`. Verified banner, per-file `Unchanged`, `WHERE IT HAS BEEN` provenance timeline (captured → sealed → checked), `EVIDENCE STRENGTH` 4-step scale with the active step tinted, and a plain-English justification sentence. |
| D4 | Comments | `Top` / `Newest`. **Two levels only** — a reply to a reply joins the same thread. Reply indent 45px + 14px with a 2px left rule. Per-comment: like count, `Reply`, `Report` (right-aligned). `Load 18 more comments`. Composer: `Comment as **Anonymous**` + switch inheriting the profile default and **showing the name it will publish**, then input + send. **Author names are deliberately not links — there is no public profile.** |
| D5 | Comments empty | Sort chips are **gone, not disabled** — nothing to sort. Composer stays; it is the one action. |
| D6 | Comments loading | Skeletons **mirror the thread geometry, indent included**, and fade with depth. The header count is already known, so it renders as real text. |
| D7 | Comments error | **Scoped to the list** — "The report itself loaded fine. This isn't you." The half-written comment survives and the send button stays live. |
| D8 | Flag report | Six reasons, single choice, **nothing preselected**. Optional note. "A moderator reads every flag. The person who filed the report is not told who flagged it." The same sheet with three reasons serves a flagged comment. |
| D9 | Flag sent | Names the reason back, gives `FLG-2209`, and states what the author is told: **`Nothing about you`**. `Hide this report from my feed` is **offered, not assumed**. |
| D10 | Share sheet | Link preview card (image + Spectral title + `blacknexa.org/r/BNX-4471 · Verified report`). The **`What a recipient sees`** card is the point of the screen: "They do not see your name, the exact location, or that you shared it." Copy-link **confirms in place** (`✓ Copied` chip), not by toast. Email / Message / More. |
| D11 | Evidence lightbox | `2 of 4` above, filmstrip below, scrub bar for video, and a **collapsed drag-up panel** — "the facts are one gesture away, never covering the frame." |
| D12 | Lightbox facts | Panel expanded: Captured / Sealed / **Integrity: Unchanged since** / Size / **Device: Not recorded**, then `Show the tech`. |

### 5.3 Backend — detail, social, moderation

```
GET  /api/v1/reports/:idOrRef                → projection by viewer role
GET  /api/v1/reports/:id/trust               → D3 payload
GET  /api/v1/reports/:id/organisations        → geo-legal agencies filtered by category
POST /api/v1/reports/:id/support             → toggle, returns new count
POST /api/v1/reports/:id/corroborate
GET  /api/v1/reports/:id/comments?sort=top|new&cursor=
POST /api/v1/reports/:id/comments            { body, parentId?, anonymous }
PATCH/DELETE /api/v1/comments/:id            author only
POST /api/v1/comments/:id/like               → toggle
POST /api/v1/reports/:id/flags               → { flagRef }
POST /api/v1/comments/:id/flags
POST /api/v1/reports/:id/share-link          → { url, token }
GET  /r/:caseRef                             → SSR OG page for D10's link preview
POST /api/v1/reports/:id/hide                → D9 "hide from my feed"
```

**Projection rules (enforce server-side, never client-side):**

| Field | Viewer | Owner | Moderator |
|---|---|---|---|
| author identity when `anonymous` | hidden | own | visible |
| `location_exact` | never | yes | yes |
| `user_id` | never returned | never returned | internal only |
| evidence bytes | presigned, short TTL | same | same |
| flag reporter identity | never | **never** | visible |
| view counts | no | yes (D2) | yes |

**Evidence strength.** `constants/credibility.ts` already scores this client-side. Move it server-side (`services/evidence_strength.service.ts`) so D1's badge and D3's scale cannot disagree and cannot be spoofed. Inputs the design implies: file count, distinct capture devices, capture-time proximity to the reported time, corroboration count.

**Moderation.** Extend `services/moderation.service.ts` with the status machine (`submitted → under_review → verified|dismissed`), an **urgent lane with a 1-hour SLA** (C6's promise), and a flag queue. Each transition writes `report_status_events` and fires a `status_change` notification — that is what D2's timeline and B3's rows read from.

**Two-level comment enforcement.** `parent_id` must be null or point at a root comment. Reject a third level at the API, since D4 says a reply to a reply joins the same thread.

---

## 6. Mobile UX, edge cases, and device handling

The artboards are drawn at a fixed **390×844** with a flat 46px status bar and flat 30px footers. Shipping those numbers literally is the single most likely way to fail on real devices. Rules:

### 6.1 Safe areas
- `useSafeAreaInsets()` everywhere; never a magic 46 or 30.
- Sticky footers: `paddingBottom: Math.max(insets.bottom, 12)`. Sticky headers: `paddingTop: insets.top`.
- Expo 54 is **edge-to-edge by default on Android** — the app must paint under the system bars and pad for them. Set the Android navigation bar to `s0` via `expo-navigation-bar` so the design's `.97` translucent footers don't sit on a black strip.
- A5's `padding: 150px 26px 0` and A12's `bottom: 24/126` are absolute positions relative to an 844px frame. Convert to `insets.top + offset` and `insets.bottom + offset`.

### 6.2 Keyboard
- `KeyboardAvoidingView` is not sufficient for the composer + sticky-footer patterns here. Adopt **`react-native-keyboard-controller`** (`KeyboardAwareScrollView`, `KeyboardStickyView`) — it gives synchronised, interpolated behaviour on both platforms.
- **D4 / D5 / D7 composer** must stick to the keyboard, keep the anonymity row visible, and grow to a max of ~5 lines before scrolling internally.
- **C2** (title + 230px textarea) must keep the focused field and its counter above the keyboard; `keyboardShouldPersistTaps="handled"` so tapping a prompt row doesn't require dismissing first.
- **A8 / A14 OTP**: keep the cell row and the resend countdown above the keyboard. On A14 the code row, password field, strength meter and requirement rows all matter — use a keyboard-aware scroll with `extraKeyboardSpace`.
- Android: `android.softwareKeyboardLayoutMode: "resize"` in `app.json`.
- Every `TextInput` gets `returnKeyType` + `onSubmitEditing` chaining to the next field, and `blurOnSubmit={false}` mid-chain.

### 6.3 Small and large devices
- **iPhone SE (375×667)** is the binding constraint. C2 (940px artboard), C6 (880), C7 (890), D1 (1680) are already taller than one screen — they must be scroll containers with sticky headers/footers, not fixed layouts.
- Sheet heights become `Math.min(height * ratio, cap)` with a `maxHeight: height - insets.top - 24`.
- The wizard's 100px of chrome (variant 1d) plus a 52px footer leaves ~460px of content on an SE. Verify every step still shows its primary control without scrolling; if C1's nine rows don't fit, that is expected — it is a list.
- Tablet is out of scope (`supportsTablet: false`), but do not hardcode `Dimensions.get('window')` at module scope — it breaks on fold/rotate.

### 6.4 Font scaling and accessibility
- `maxFontSizeMultiplier: 1.4` on fixed-height chrome (24px status pills, 34px chips, 30/32px pill buttons); leave body copy unclamped.
- **Touch targets:** the design's 32–34px chips and 24px pills are below the 44px minimum. Add `hitSlop` to reach 44 without changing the visual. The 20px flag radio buttons (D8) need the whole row as the target — it already is.
- **Contrast:** `t4 #98A2AE` on `#FFFFFF` is ≈2.5:1 and `t5 #B3BCC7` is ≈1.8:1. Both fail WCAG AA for text. They are used for meta and placeholders in the design — acceptable for genuinely secondary text, but **no unique information may live only at `t4`/`t5`**. Flag `MATCHED IN TITLE` (B5, `t5`) as needing `t3` or a bolder weight.
- Screen-reader labels for every icon-only button (D1's three-button bottom bar, B1's bell, the `×` in each wizard step). Announce step changes in the wizard via `AccessibilityInfo.announceForAccessibility`.
- Honour `isReduceMotionEnabled` for A1's sweeping bar, C8's spinners, and the A8 error shake.

### 6.5 Platform behaviour
- **iOS:** OTP `textContentType="oneTimeCode"`; password `textContentType="newPassword"` + `passwordRules`. Sheets should use the native-feeling detent behaviour. Respect the back-swipe except where the design forbids it (C8, and the wizard where `×` → C10 is the only exit).
- **Android:** intercept the hardware back button per screen — in the wizard it goes to the previous step, on step 1 it opens C10, and on C8 it is swallowed. Ripple feedback on `Pressable` via `android_ripple`. Confirm the Google button on A5 renders the real 4-colour mark, not a monochrome fallback.
- **Haptics:** `selectionAsync` on chip/segment/radio choice, `impactAsync(Medium)` on opening the wizard, `notificationAsync(Success)` on C9/A15/D9, `notificationAsync(Error)` on the A8 wrong-code shake. Guard every call with `Platform.OS !== "web"` (the existing code already does this — keep it).

### 6.6 Offline and failure
- Drafts are local-first and survive a cold kill (C10's promise that a draft "keeps everything you have written and the two files you attached" includes the files — hold local file URIs until upload succeeds).
- Evidence uploads: per-file retry with backoff, resumable where the storage driver allows, and a visible failed state on the C5 row with a retry affordance.
- C8 is a real state machine: `sealing → uploading → filing → done|failed`. On failure it must offer retry without re-picking files, and must never leave a half-filed report — file the report only after every evidence `commit` succeeds.
- Feed and detail cache with TanStack Query `persistQueryClient` so a cold open offline shows the last feed rather than a spinner.
- D7's rule generalises: **scope error states to the thing that failed.** A comments failure must not blank the report.

### 6.7 Pixel-perfect verification method
1. Export each of the 51 artboards as a 390×844 (or native-height) PNG from the design project.
2. Add a debug-only `<DesignOverlay screen="C4" />` that renders the PNG at 40% opacity above the live screen, toggled by a shake gesture.
3. Compare in order: outer padding → block spacing → type size/weight/line-height → radius → colour token. Fix in that order; spacing errors read as visual errors more than colour ones do.
4. Gate the PR on overlay screenshots at 390×844, 375×667 and 430×932.

---

## 7. Phasing

| Phase | Contents | Backend | Mobile | Rough size |
|---|---|---|---|---|
| **0 · Foundations** | Tokens, fonts, typography, `components/ui/*`, ThemeProvider, safe-area + keyboard infra, tab bar rebuild (5 tabs + centre `+`), API client with refresh mutex, delete `(tabs)/report.tsx` and the profile tab | — | L | 6–8 d |
| **1 · Auth** | A1–A15; user auth service, sessions, OTP, mailer, consents, `/auth/*`, `/users/me` | M–L | L | 10–14 d |
| **2 · Wizard** | C1–C11; `reports` migration, drafts, file, case refs, presigned evidence + seal-on-arrival, status events | L | L | 12–16 d |
| **3 · Feed** | B1–B7; feed + facets + search + suggestions, notifications, prefs | M | M–L | 8–11 d |
| **4 · Detail** | D1–D12; detail projections, trust payload, support/corroborate, comments (2-level), flags, share links + OG page, evidence read URLs, evidence strength, moderation state machine | L | L | 12–16 d |
| **5 · Hardening** | Edge devices, a11y sweep, offline, reduce-motion, overlay QA on all 51 artboards, moderation admin screens, deprecate geo-legal aliases | S–M | M | 6–9 d |

Sizes assume one backend and one to two mobile developers, and exclude design QA cycles.

### Cross-phase invariants — put these in the PR template
- One accent, one primary action per screen (A5 excepted, deliberately).
- Green / amber / red = status only. Category colour = dot only.
- No requirement turns red while someone is typing.
- `Next` / `Continue` is never disabled; it explains instead.
- Nothing asks for a permission before it has explained why.
- Login and password-reset responses never reveal whether an account exists.
- Anonymity is enforced in the API projection, never by hiding a field in the UI.
- Every destructive action states its consequence in words before it happens.

---

## 8. File-level change map

### `mobile-app`

**New**
```
constants/theme.ts, constants/typography.ts
providers/ThemeProvider.tsx
components/ui/{Button,Chip,StatusPill,Card,Switch,CategoryDot,Sheet,Dialog,
               ProgressSegments,OtpInput,TextField,PasswordField,StrengthMeter,
               RequirementList,Skeleton,EmptyState,ErrorState,Stepper,Timeline}.tsx
components/report/{FeedCard,LeadMediaBand,EvidenceGrid,EvidenceRow,TrustCard,
                   MiniPreviewCard,SupportBar,CommentRow,CommentComposer,MapPreview}.tsx
components/sheets/{FiltersSheet,SortSheet,TrustSheet,FlagSheet,ShareSheet,
                   SaveOrDiscardSheet,DiscardDialog}.tsx
lib/api/{client,auth,reports,comments,evidence,notifications}.ts
app/(auth)/{splash,intro,location,welcome,log-in}.tsx
app/(auth)/sign-up/{account,terms,verify,profile}.tsx
app/(auth)/reset/{request,confirm,done}.tsx
app/(onboarding)/{notifications,tour}.tsx
app/notifications.tsx, app/search.tsx
app/report/(wizard)/{category,details,when,where,evidence,flags,review}.tsx
app/report/{submitting,receipt}.tsx
app/r/[ref]/{index,owner,comments}.tsx
app/r/[ref]/evidence/[index].tsx
providers/{ReportDraftProvider,ReportsProvider,NotificationsProvider}.tsx
```

**Rewrite**
```
app/_layout.tsx            AuthGate replaces ConsentGate; route groups; font loading
app/(tabs)/_layout.tsx     5 tabs + custom centre + button
app/(tabs)/index.tsx       B1
providers/AuthProvider.tsx our backend + Face ID; Rork OAuth becomes a bridge
components/IncidentCard.tsx → components/report/FeedCard.tsx (treatment 1a, both variants)
constants/colors.ts        → re-export from theme.ts during migration, then delete
app.json                   userInterfaceStyle: "light", softwareKeyboardLayoutMode,
                           permissions, fonts, scheme
```

**Delete / absorb**
```
app/onboarding.tsx          → A7 + server consents
app/report.tsx              → app/report/(wizard)/*
app/(tabs)/report.tsx       → modal from centre +
app/(tabs)/profile.tsx      → out of the tab bar (keep the screen, move the route)
app/incident/[id].tsx       → app/r/[ref]/index.tsx
mocks/incidents.ts          → API-backed; keep only as a test fixture
components/{CredibilityCard,CustodyCard,SecurityCard}.tsx → one TrustCard + TrustSheet
components/VoiceInputButton.tsx → audio attachment recorder, no STT
```

**New dependencies:** `@expo-google-fonts/spectral`, `@expo-google-fonts/work-sans`, `react-native-keyboard-controller`, `expo-local-authentication`, `expo-navigation-bar`, `expo-audio` (or keep `expo-av`), a bottom-sheet library, `@tanstack/query-async-storage-persister`.

### `blacknexa-backend`

**New**
```
models/{app_user,user_session,email_otp,user_consent,password_history}.model.ts
models/{report,report_evidence,report_status_event,report_social,
        report_flag,report_share_link,notification}.model.ts
services/{user_auth,mailer,report,report_feed,report_search,comment,
          evidence,evidence_strength,notification}.service.ts
controllers/{user_auth,report,comment,notification}.controller.ts
routes/{auth,report,comment,notification}.route.ts
validations/{user_auth,report,comment}.validation.ts
migrations/*  (reports rename + new tables + BNX/FLG sequences + tsvector + pg_trgm)
```

**Modify**
```
types/admin.interface.ts     ActorRole union; keep checkRole admin-only
middlewares/auth.middleware.ts  attach userAuthGuard; add checkUserRole
models/incident.model.ts     → report.model.ts (kept as alias one release)
services/geo_legal.service.ts   incident CRUD moves out; lookup/validate/dispatch stay
controllers/geo_legal.controller.ts  incident handlers delegate to report.service
services/moderation.service.ts  status machine, urgent lane, flag queue
routes/index.ts              mount /auth, /reports, /notifications; mark geo-legal
                             incident paths deprecated in ROUTE_MANIFEST
config/env.config.ts         SMTP, S3 required when reports are enabled, OTP TTL
```

**Already built and finally used:** `s3.service.ts`, `upload.middleware.ts`, `userAuthGuard`, `optionalAuth`, `encryption.service.ts`, `pii_scrubber.service.ts`.
