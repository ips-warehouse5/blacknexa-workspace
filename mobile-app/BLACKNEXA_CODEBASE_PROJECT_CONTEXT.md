# BlackNexa Codebase Project Context

> **Analysis date:** 2026-08-19 · **Branch:** `main` · **HEAD:** Current
>
> **Method:** Every status claim below is anchored to a file, and to a line where the claim depends on specific behaviour. Nothing is marked complete because a file exists.
>
> **⚠️ Scope caveat — read this first.** No BlackNexa scope document, feature specification, storyboard, or client requirements file exists anywhere in this workspace. [README.md](README.md) documents the mobile app setup and tooling. There are no other Markdown files, no design assets beyond app icons, and no API contract documents. **Every "Expected / Scope" value in this document is INFERRED** from the product's own code, UI copy, and the standard civic-documentation feature set — it is *not* client-confirmed. Sections 31, 32, 33 and 38 must be re-baselined against the real scope document before they are used for planning or commercial commitments.

**Status vocabulary used throughout:** `COMPLETE` · `PARTIAL` · `PLACEHOLDER` · `MOCKED` · `MISSING` · `BLOCKED` · `FUTURE` · `UNKNOWN`

---

## 1. Executive Summary

### What BlackNexa Is

BlackNexa presents itself as a privacy-first civic documentation platform for the Black community. Its self-description, from [app/onboarding.tsx](app/onboarding.tsx): *"A privacy-first civic platform built for the community, by the community. Document. Preserve. Connect to trusted support."* The tagline used throughout the codebase is "By the people, for the people," and the brand subtitle in the feed header is "Community · Evidence · Trust."

The intended product has five pillars, readable from the tab bar in [app/(tabs)/_layout.tsx](app/(tabs)/_layout.tsx):

1. **Feed** — a community feed of civil-rights incidents
2. **News** — AI-generated, fact-checked, multilingual news briefings
3. **Vault** — an encrypted personal evidence vault with legal chain-of-custody
4. **Report** — structured incident reporting with evidence capture and jurisdiction-aware compliance
5. **Support** — a directory of legal aid, healthcare, housing, hotlines and advocacy resources

Around these sit a geo-legal compliance engine (routing reports to the correct agencies per jurisdiction), a creator tipping economy, and a hardware "safety beacon."

### What Exists Today

The project mobile surface:

| Codebase | Stack | Size | State |
|---|---|---|---|
| Mobile App (`/`) | Expo SDK 54 / React Native 0.81.5 / expo-router 6 | 18 routes, 21 components, 6 providers | Primary product surface (TypeScript cleanly builds `tsc --noEmit`) |

**The single most important structural fact:** the backend serves the *news, SEO/syndication, geo-legal and tipping* half of the product. It has **no persistence whatsoever for users, incidents, evidence files, comments, or notifications**. The half of the product the brand is built on — community incident documentation — has no server.

Consequently the feed and vault are single-device illusions. [providers/IncidentsProvider.tsx](providers/IncidentsProvider.tsx) merges a hardcoded mock array with `AsyncStorage`. Two users of BlackNexa can never see each other's reports.

**What genuinely works end-to-end:** the News vertical (backend generation, feed, search, location-aware local feed, 21-language translation, TTS audio briefings, weather, live chat), the geo-legal jurisdiction lookup, the resources directory, and the legal/consent flow. All TypeScript compile errors in the mobile client have been resolved and `tsc --noEmit` exits with 0 errors.

### What Is Missing

- **No incident backend.** No endpoint to list, fetch, update or moderate incidents. `MISSING`
- **No evidence upload of any kind.** `expo-file-system` is imported in zero application files. Photos never leave the device. `MISSING`
- **No authentication gate.** A real OAuth PKCE implementation exists but guards nothing and has no login screen. `PARTIAL`
- **No comments, no notifications, no moderation queue, no verification workflow.** `MISSING`
- **No tests.** Zero test files across all three codebases. `MISSING`

### Biggest Risks

1. **The app makes security claims its code does not deliver.** The Vault screen renders "End-to-end encrypted" and "All records cryptographically sealed" ([expo/app/(tabs)/vault.tsx](expo/app/(tabs)/vault.tsx)) over records stored as plaintext JSON in `AsyncStorage`. For a product whose users are documenting civil-rights violations, this is both a safety risk and a legal/marketing exposure. See §34.
2. **The vault PIN is stored in plaintext**, in the same unencrypted store as the data it protects ([expo/providers/SettingsProvider.tsx](expo/providers/SettingsProvider.tsx)). This nullifies the zero-knowledge design.
3. **Evidence is not durable.** Photo URIs point at OS cache directories that the system reclaims. Evidence a user believes is sealed will silently disappear.
4. **A secret key is shipped in the client bundle** — `EXPO_PUBLIC_RORK_TOOLKIT_SECRET_KEY` at [expo/utils/audio.ts:9](expo/utils/audio.ts#L9). The `EXPO_PUBLIC_` prefix inlines values into the JavaScript bundle by design.
5. **Two full client codebases are being maintained in parallel** and have already diverged. Every feature must be built twice.
6. **Zero test coverage** on a product handling legal evidence.

### Recommended Next Steps

Build the incident/evidence backend and put real encryption behind the encryption claims, before adding any new feature surface. Full sequencing in §37; the ranked task list is in the closing section.

---

## 2. Product Understanding

The product model implicit in the code is a four-stage user journey:

**Document** → a person experiences a civil-rights incident and records it with structured metadata and media.
**Preserve** → the record is cryptographically sealed and timestamped to be legally credible later.
**Connect** → the record can be routed to the correct legal, press or human-rights channel for that jurisdiction.
**Support** → the person is connected to verified aid, and the community sees and corroborates the record.

Distinctive design commitments visible in the code:

- **Privacy is graduated, not binary.** Three levels — `private` | `trusted` | `public` — defined at [expo/mocks/incidents.ts:1](expo/mocks/incidents.ts#L1) and carried through every layer.
- **Jurisdiction-awareness is a first-class concern.** [functions/_lib/geo-legal/jurisdictions.ts](functions/_lib/geo-legal/jurisdictions.ts) is 3,862 lines of curated legal data — recording consent laws, agency contacts, protections — per jurisdiction. This is a real, serious asset.
- **Chain-of-custody is treated as a legal artifact,** with a hash-chained audit log ([expo/constants/security.ts](expo/constants/security.ts)) modelled on evidentiary admissibility.
- **Compliance gates media capture.** [expo/constants/compliance.ts](expo/constants/compliance.ts) evaluates whether recording is legal in the user's jurisdiction *before* the camera opens.

The gap between this ambition and the implementation is the subject of the rest of this document.

---

## 3. Repository Overview

```
rork-blacknexa/
├── rork.json                   # Declares 3 apps: expo, ios, functions
├── package.json                # Root shim — react + react-dom + @expo/cli only
├── bun.lock
│
├── expo/                       # ── PRIMARY CLIENT (React Native) ──
│   ├── app/                    # expo-router file-based routes (18 files)
│   │   ├── _layout.tsx         # Root stack + 6 nested providers + ConsentGate
│   │   ├── (tabs)/             # 6 tabs: index, news, vault, report, support, profile
│   │   ├── incident/[id].tsx   # Incident detail
│   │   ├── news/[id].tsx       # Article detail
│   │   ├── legal/              # terms, privacy, lookup
│   │   ├── onboarding.tsx      # Consent gate screen
│   │   ├── report.tsx          # Report modal (the real one)
│   │   ├── modal.tsx           # Stub "About" modal
│   │   ├── +not-found.tsx
│   │   └── +native-intent.tsx  # Deep-link handler (pass-through no-op)
│   ├── components/             # 21 presentational + feature components
│   ├── providers/              # 6 context hooks (Auth, Settings, Incidents,
│   │                           #   Location, News, GeoLegal)
│   ├── constants/              # 12 modules: crypto, security, compliance,
│   │                           #   credibility, geo-legal, advocacy, agencies,
│   │                           #   dispatch, disclaimers, legal, i18n, colors
│   ├── mocks/                  # incidents.ts, news.ts, resources.ts (1717 lines)
│   ├── utils/                  # audio.ts (TTS/STT), navigation.ts
│   ├── assets/images/          # icons + splash only
│   ├── app.json                # Expo config, permissions, plugins
│   └── .env.example            # Untracked-secret template
│
├── ios/                        # ── PARALLEL SWIFTUI CLIENT ──
│   └── BlackNexa/
│       ├── Views/              # 15 SwiftUI views mirroring the Expo screens
│       ├── Stores/             # NewsStore, IncidentsStore, LocationManager
│       ├── Models/             # Agencies, Credibility, Compliance, Custody,
│       │                       #   CryptoEngine, DispatchRouter, AdvocacyRoute
│       ├── Services/           # GeoLegalService, AudioBriefingService
│       ├── Components/         # 8 shared components
│       ├── Data/               # MockNews.swift, MockResources.swift
│       ├── Theme/
│       └── AuthManager.swift
│
└── functions/                  # ── CLOUDFLARE WORKERS BACKEND ──
    ├── index.ts                # Worker entrypoint, ~60 routes
    ├── news-store.ts           # NewsStore Durable Object (1562 lines)
    ├── platform-store.ts       # PlatformStore Durable Object (929 lines)
    └── _lib/
        ├── geo-legal/          # jurisdictions (3862 lines), resolver, store,
        │                       #   validator, pii-scrubber, encryption, types
        ├── platform/           # tipping, enterprise, moderation, fact-verify,
        │                       #   cache, queue, persistence, tos, types
        ├── generate.ts         # AI article generation (984 lines)
        ├── seo.ts              # RSS/sitemap/JSON-LD/HTML rendering
        ├── syndication.ts, i18n.ts, local.ts, seed.ts, daily-prompts.ts
        └── types.ts
```

**Notably absent from the repository:** no `__tests__`, no `*.test.*`, no `*.spec.*`, no CI configuration (`.github/`, `.gitlab-ci.yml`), no `eas.json` build profile, no `android/` native directory, no Dockerfile, no `wrangler.toml`, no API documentation, no design files.

**Entry points:**
- Expo: `expo-router/entry` (declared as `main` in [expo/package.json](expo/package.json)) → [expo/app/_layout.tsx](expo/app/_layout.tsx)
- Worker: `export default { fetch }` in [functions/index.ts](functions/index.ts)
- iOS: `RootView.swift`

---

## 4. Technology Stack

All versions read directly from manifests — none inferred.

### Frontend — Expo client ([expo/package.json](expo/package.json))

| Concern | Technology | Version |
|---|---|---|
| Framework | Expo SDK | `~54.0.27` |
| Runtime | React Native | `0.81.5` (New Architecture enabled) |
| UI runtime | React | `19.1.0` |
| Language | TypeScript | `~5.9.2` |
| Navigation | expo-router | `~6.0.17` (typed routes on) |
| Server state | @tanstack/react-query | `^5.83.0` |
| Global state | @nkzw/create-context-hook | `^1.1.0` |
| Global state (2nd) | zustand | `^5.0.2` — **declared but imported nowhere** |
| Styling | React Native `StyleSheet` | built-in — no styling library |
| Icons | lucide-react-native | `^0.475.0` |
| Local storage | @react-native-async-storage/async-storage | `2.2.0` |
| Secure storage | expo-secure-store | `~15.0.8` |
| Cryptography | @noble/ciphers, @noble/hashes, @noble/curves | `^2.2.0` |
| Media | expo-av, expo-image, expo-image-picker | `16.0.8`, `3.0.11`, `17.0.9` |
| Location | expo-location | `~19.0.8` |
| Speech | expo-speech | `~14.0.8` |
| AI SDK | @rork-ai/toolkit-sdk | `^0.2.51` |

**Root [package.json](package.json)** is a near-empty shim declaring only `react`, `react-dom`, `@expo/cli`, `typescript ^7.0.2` and `@types/react-native ^0.73.0`. Note the TypeScript major-version mismatch against the Expo app's `~5.9.2`, and that `@types/react-native` is obsolete for RN 0.81 (types ship with the package). See §30.

### Backend ([functions/](functions/))

| Concern | Technology | Status |
|---|---|---|
| Compute | Cloudflare Workers | `COMPLETE` |
| Persistence | Durable Objects + SQLite | `COMPLETE` for news/platform |
| API style | REST, hand-rolled path matching in [functions/index.ts](functions/index.ts) | `COMPLETE` |
| Auth | **None** — no route validates a token | `MISSING` |
| Object storage | **None** — no R2/S3 binding anywhere | `MISSING` |
| Realtime | WebSocket at `/api/v1/blacknexa/live-chat` | `PARTIAL` |
| Push notifications | **None** | `MISSING` |
| Dependencies | `{}` — zero npm dependencies | — |

`functions/package.json` declares no dependencies at all; the Worker is pure platform APIs plus `fetch` calls to AI services. The deployment binding names are `DO` and `PLATFORM_DO` ([functions/index.ts](functions/index.ts), `type Env`). **Whether these bindings are configured in a live Cloudflare account: `UNKNOWN — requires confirmation`** (no `wrangler.toml` in the repo).

### Native

- **iOS:** `ios/BlackNexa.xcodeproj` exists with `BlackNexaTests/` and `BlackNexaUITests/` target directories — **both empty of test files**. Bundle ID for the Expo app is `app.rork.499r3rz679a2j9vr4ap98` ([expo/app.json](expo/app.json)).
- **Android:** no `android/` directory. Configuration is managed-workflow only, via `app.json`.
- **Permissions declared** ([expo/app.json](expo/app.json)): iOS — `NSMicrophoneUsageDescription`, `NSLocationWhenInUseUsageDescription`, `UIBackgroundModes: [audio]`. Android — `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS`, `ACCESS_COARSE_LOCATION`, `ACCESS_FINE_LOCATION`.
- **Note:** no camera permission is declared, and `NSPhotoLibraryUsageDescription` is absent despite [expo/app/report.tsx](expo/app/report.tsx) calling `ImagePicker.launchImageLibraryAsync`. See §30.

### Testing

**Nothing.** No test runner in any manifest (no Jest, Vitest, Detox, Maestro, XCTest files). Zero test files. `MISSING`

---

## 5. Architecture

```
                    User
                     │
        ┌────────────┴────────────┐
        │                         │
   Expo client               SwiftUI client        ← two parallel clients
   (expo/)                   (ios/)
        │                         │
        └────────────┬────────────┘
                     │
        State / Business Logic
   React Query + 6 context providers
                     │
        ┌────────────┴────────────────────────┐
        │                                     │
   AsyncStorage (device)              HTTP fetch (no client wrapper)
   incidents, settings, audit,                │
   supported, location                        │
        │                             Cloudflare Worker
   ← incidents/evidence dead-end       (functions/index.ts)
     here; never reaches a server              │
                                    ┌──────────┴──────────┐
                              NewsStore DO         PlatformStore DO
                              (SQLite)             (SQLite)
                                    │                     │
                              news, geo-legal,      tipping, moderation,
                              translations          ToS, cache, queue
                                    │
                              External services
                              Exa (search), Grok (synthesis),
                              Rork Toolkit (TTS/STT/images),
                              Rork Auth (OAuth), Open-Meteo (weather)
```

| Layer | Implementation | Status |
|---|---|---|
| Client UI | Expo Router + StyleSheet, dark theme | `COMPLETE` |
| Client state | React Query + `createContextHook` × 6 | `COMPLETE` |
| API client layer | **None** — raw `fetch` scattered across 9 files | `MISSING` |
| Auth layer | OAuth PKCE implemented, not enforced | `PARTIAL` |
| Backend — news | Worker + NewsStore DO | `COMPLETE` |
| Backend — geo-legal | Worker + geo-legal store | `COMPLETE` |
| Backend — platform | Worker + PlatformStore DO | `PARTIAL` |
| Backend — incidents | **No listing, update, moderation, or feed** | `MISSING` |
| Database — news | DO SQLite | `COMPLETE` |
| Database — incidents/users | **None** | `MISSING` |
| File storage | **None anywhere in the stack** | `MISSING` |
| Realtime | WebSocket chat only | `PARTIAL` |
| Notifications | **None** | `MISSING` |

**The architectural fault line:** everything to do with news flows client → Worker → DO → external AI. Everything to do with incidents and evidence terminates at `AsyncStorage` on the device.

---

## 6. Navigation Architecture

```
RootLayout (expo/app/_layout.tsx)
│  QueryClientProvider
│   └ AuthProvider → SettingsProvider → IncidentsProvider
│      → LocationProvider → NewsProvider → GeoLegalProvider
│         └ GestureHandlerRootView → ConsentGate → Stack
│
├── onboarding                    (headerShown: false, gestureEnabled: false)
├── (tabs)                        (headerShown: false)
│   ├── index      → Feed
│   ├── news       → News
│   ├── vault      → Vault
│   ├── report     → Report (redirect stub)
│   ├── support    → Support
│   └── profile    → Profile
├── report                        (presentation: "modal")
├── incident/[id]
├── news/[id]                     (headerShown: false)
├── legal/terms
├── legal/privacy
├── legal/lookup
├── modal                         (presentation: "modal")
└── +not-found
```

### Guards

**One guard exists: `ConsentGate`** ([expo/app/_layout.tsx](expo/app/_layout.tsx)). It redirects to `/onboarding` when `consentTos && consentPrivacy && consentVersion >= LEGAL_VERSION` is not satisfied, allowing the `onboarding` and `legal` segments through.

**There is no authentication guard and no role guard.** `ConsentGate` checks consent, not identity. A user who has never signed in reaches every screen in the app. There is no concept of a role anywhere in the codebase. `MISSING`

### Broken / degenerate routes

- **`(tabs)/report`** ([expo/app/(tabs)/report.tsx](expo/app/(tabs)/report.tsx)) is not a screen. It is a stub that runs `setTimeout(() => router.push("/report"), 150)` on mount, showing "Opening secure report…" for 150ms. It leaves a dead tab entry in the back stack and produces a visible flash. `PLACEHOLDER`
- **`modal`** ([expo/app/modal.tsx](expo/app/modal.tsx)) is a 4-line "About" card with a Close button, reachable from no navigation path found in the codebase. Dead route. `PLACEHOLDER`
- **Deep links are not implemented.** [expo/app/+native-intent.tsx](expo/app/+native-intent.tsx) returns `args.path ?? "/"` unchanged and contains a `_unusedLegacy` no-op function. The scheme `rork-499r3rz679a2j9vr4ap98` is registered, and the OAuth callback path `/auth/callback` is parsed manually in [expo/providers/AuthProvider.tsx](expo/providers/AuthProvider.tsx) — but no content deep-linking (share an incident, open an article) exists. `MISSING`

---

## 7. Screen Inventory

Eighteen route files. Statuses reflect inspected behaviour, not existence.

| # | Screen | Path | Route | Purpose | Data source | Status |
|---|---|---|---|---|---|---|
| 1 | Onboarding / Consent | [expo/app/onboarding.tsx](expo/app/onboarding.tsx) | `/onboarding` | ToS + Privacy acceptance | Settings (local) | `COMPLETE` |
| 2 | Feed | [expo/app/(tabs)/index.tsx](expo/app/(tabs)/index.tsx) | `/(tabs)` | Community incident feed | Mock + AsyncStorage | `MOCKED` |
| 3 | News | [expo/app/(tabs)/news.tsx](expo/app/(tabs)/news.tsx) | `/(tabs)/news` | Briefings, search, generation | Backend API | `COMPLETE` |
| 4 | Vault | [expo/app/(tabs)/vault.tsx](expo/app/(tabs)/vault.tsx) | `/(tabs)/vault` | Personal evidence records | AsyncStorage | `PARTIAL` |
| 5 | Report tab | [expo/app/(tabs)/report.tsx](expo/app/(tabs)/report.tsx) | `/(tabs)/report` | Redirect stub | — | `PLACEHOLDER` |
| 6 | Support | [expo/app/(tabs)/support.tsx](expo/app/(tabs)/support.tsx) | `/(tabs)/support` | Resource directory | Static mock | `COMPLETE`¹ |
| 7 | Profile | [expo/app/(tabs)/profile.tsx](expo/app/(tabs)/profile.tsx) | `/(tabs)/profile` | Settings, privacy, account | Settings (local) | `PARTIAL` |
| 8 | Report (modal) | [expo/app/report.tsx](expo/app/report.tsx) | `/report` | Create an incident | Local + geo-legal API | `PARTIAL` |
| 9 | Incident Detail | [expo/app/incident/[id].tsx](expo/app/incident/%5Bid%5D.tsx) | `/incident/:id` | Full record + custody | Local | `PARTIAL` |
| 10 | Article Detail | [expo/app/news/[id].tsx](expo/app/news/%5Bid%5D.tsx) | `/news/:id` | Read, translate, listen | Backend API | `COMPLETE` |
| 11 | Legal Lookup | [expo/app/legal/lookup.tsx](expo/app/legal/lookup.tsx) | `/legal/lookup` | Jurisdiction rights lookup | Backend API | `COMPLETE` |
| 12 | Terms | [expo/app/legal/terms.tsx](expo/app/legal/terms.tsx) | `/legal/terms` | ToS text | Constant | `COMPLETE` |
| 13 | Privacy | [expo/app/legal/privacy.tsx](expo/app/legal/privacy.tsx) | `/legal/privacy` | Privacy policy text | Constant | `COMPLETE` |
| 14 | About modal | [expo/app/modal.tsx](expo/app/modal.tsx) | `/modal` | Unreachable stub | — | `PLACEHOLDER` |
| 15 | Not Found | [expo/app/+not-found.tsx](expo/app/+not-found.tsx) | `*` | 404 | — | `COMPLETE` |

¹ Complete as a UI and directory; the data is a hand-curated static file, not a managed source. See §16.

### Detail on the load-bearing screens

**Feed** — [expo/app/(tabs)/index.tsx](expo/app/(tabs)/index.tsx)
Renders a `FlatList` of `IncidentCard`s. Has: text search across title/summary/area, an 8-chip category filter, a section count, an empty state, a gradient header, and a Report FAB. Filters to `privacy === "public" || "trusted"`.
Missing: pull-to-refresh, pagination, date/location/verified/urgent filters, sort options, and a loading state (`isLoading` from the provider is never consumed). The notification bell opens a hardcoded `Alert` reading "You're all caught up."

**Report modal** — [expo/app/report.tsx](expo/app/report.tsx), 1,087 lines
A single long scroll, not a wizard. Collects category, title, summary, area, country/subdivision, privacy level, redact-location toggle, and photos. Validation is `title >= 4 && summary >= 10 && area.length > 0` — no date, no time, no per-field error messages. Two submit paths exist: a local path and a geo-legal-validated path via a compliance review sheet. Both call the same local `createIncident`. See §11.

**Vault** — [expo/app/(tabs)/vault.tsx](expo/app/(tabs)/vault.tsx)
Three stat cards, a green "Vault integrity verified" banner, a record list, and an empty state with CTA. It is **read-only**: no upload, download, preview, delete, export, or per-file view. It never imports the crypto module. The word "Sealed" on each record is a hardcoded string, not a computed status.

**Incident Detail** — [expo/app/incident/[id].tsx](expo/app/incident/%5Bid%5D.tsx)
The richest screen: custody timeline, integrity verification (`verifyAuditIntegrity` is genuinely recomputed at line 85), credibility card, advocacy routing, dispatch channels with disclaimer acknowledgment, share sheet, verify and flag buttons.
Missing: any comments UI, and both verify and flag are local-only (see §15).

**Profile** — [expo/app/(tabs)/profile.tsx](expo/app/(tabs)/profile.tsx)
Sections: Creator Wallet, Privacy & Security (Vault PIN, biometric unlock, redact location, anonymous by default, auto-seal), Notifications, Account (edit profile, export data, help, sign out), Legal.
Caveat: several toggles are cosmetic — see §18. `Alert.prompt` is iOS-only, so Vault PIN setup and profile editing show "will be available in the next release" on Android and web.

### iOS client screens

Fifteen SwiftUI views under [ios/BlackNexa/Views/](ios/BlackNexa/Views/) mirroring the above: `FeedView`, `NewsView`, `NewsArticleView`, `VaultView`, `ReportView`, `SupportView`, `ProfileView`, `IncidentDetailView`, `LegalView`, `LegalResourceView`, `OnboardingView`, `RootView`, `AboutModalView`, `ShareSheet`, `ComplianceReviewSheet`. Same mock-backed limitation — [ios/BlackNexa/Stores/IncidentsStore.swift:38](ios/BlackNexa/Stores/IncidentsStore.swift#L38) seeds from `MockData.seedIncidents`. See §31 for the parity audit.

---

## 8. Core Feature Inventory

| Area | Status | One-line evidence |
|---|---|---|
| Onboarding & consent | `COMPLETE` | Versioned consent enforced by `ConsentGate` |
| Authentication | `PARTIAL` | OAuth PKCE built; no login screen, no guard, no API use |
| Community feed | `MOCKED` | Local-only merge of mock array + AsyncStorage |
| Incident reporting | `PARTIAL` | Full UI; writes to device only |
| Incident detail | `PARTIAL` | Rich UI; actions are local |
| Evidence vault | `PARTIAL` | Read-only list; no file handling |
| Evidence upload | `MISSING` | Zero `expo-file-system` usage in the app |
| Encryption | `PARTIAL` | Correct primitives, wired to almost nothing |
| Verification / trust | `PLACEHOLDER` | Verify shows an `Alert`; no workflow exists |
| Community engagement | `PARTIAL` | Support toggle local; comments absent entirely |
| News | `COMPLETE` | Full backend + client vertical |
| Resources & support | `COMPLETE` | 13 categories, static data, working deep links |
| Geo-legal compliance | `COMPLETE` | Real backend engine, real client integration |
| Profile & privacy | `PARTIAL` | Several toggles have no implementation behind them |
| Notifications | `MISSING` | No dependency, no registration, no backend |
| Help / FAQ | `PLACEHOLDER` | One `Alert` in Profile; no FAQ, no walkthrough |
| Tipping / creator economy | `PARTIAL` | Backend substantial; payment rails unconfirmed |
| Safety beacon | `PLACEHOLDER` | Self-documented as a placeholder |
| Testing | `MISSING` | Zero test files |

---

## 9. Authentication & Onboarding

| Capability | Status | Evidence |
|---|---|---|
| Splash screen | `COMPLETE` | `expo-splash-screen`, configured in [expo/app.json](expo/app.json), hidden in root layout |
| Onboarding | `PARTIAL` | [expo/app/onboarding.tsx](expo/app/onboarding.tsx) — one consent screen, no feature tour |
| Consent gate | `COMPLETE` | `ConsentGate` in [expo/app/_layout.tsx](expo/app/_layout.tsx), versioned via `LEGAL_VERSION` |
| ToS acceptance | `COMPLETE` | Persisted with `consentTimestamp` and `consentVersion` |
| Privacy acceptance | `COMPLETE` | Same |
| **Login screen** | **`MISSING`** | No route, no component |
| **Signup screen** | **`MISSING`** | No route, no component |
| Email / password | `MISSING` | No such flow anywhere |
| Google OAuth | `PARTIAL` | Implemented in [expo/providers/AuthProvider.tsx](expo/providers/AuthProvider.tsx); only entry point is inside [expo/components/ShareSheet.tsx:177](expo/components/ShareSheet.tsx#L177) |
| Apple OAuth | `PARTIAL` | Same code path, same single entry point |
| Forgot password | `MISSING` | N/A — no password auth |
| MFA | `MISSING` | — |
| Biometric unlock | `PLACEHOLDER` | Toggle exists; `expo-local-authentication` is not a dependency and `LocalAuthentication` appears nowhere. The switch only changes a label colour in [expo/components/SecurityCard.tsx](expo/components/SecurityCard.tsx) |
| Location permission | `COMPLETE` | Requested in [expo/providers/LocationProvider.tsx](expo/providers/LocationProvider.tsx) and [expo/app/report.tsx:190](expo/app/report.tsx#L190) |
| Media permission | `PARTIAL` | Relies on `ImagePicker`'s implicit request; no `NSPhotoLibraryUsageDescription` in `app.json` |
| Route protection | `MISSING` | No auth guard exists |

**What the auth implementation actually does well.** [expo/providers/AuthProvider.tsx](expo/providers/AuthProvider.tsx) is a competent OAuth 2.0 PKCE client: S256 code challenge, `SecureStore` for both tokens, JWT payload decode with `exp` checking, refresh-token rotation on expiry, and a genuinely thoughtful `pendingExchangeRef` deduplication guard for the race between the `Linking` listener and `WebBrowser.openAuthSessionAsync` resolving the same code.

**What makes it inert.** Grep for `useAuth` returns five consumers — [ShareSheet](expo/components/ShareSheet.tsx), [ArtistTippingSheet](expo/components/ArtistTippingSheet.tsx), [TippingDashboard](expo/components/TippingDashboard.tsx), [LiveChatSheet](expo/components/LiveChatSheet.tsx), [SafetyBeaconButton](expo/components/SafetyBeaconButton.tsx) — every one of them a social or monetization component reading `user` for attribution. Four of the five never call `signIn`. **The access token is never attached to any API request in the entire codebase.** The user identity in the Profile screen is not `user.name` from the token; it is `settings.displayName`, defaulting to the hardcoded string `"Morgan Thompson"` ([expo/providers/SettingsProvider.tsx](expo/providers/SettingsProvider.tsx)).

"Sign out" in Profile does not call `AuthProvider.signOut`. It clears the *consent* flags, sending the user back to onboarding while leaving OAuth tokens in `SecureStore`.

---

## 10. Community Feed

| Capability | Status | Evidence |
|---|---|---|
| Feed list | `MOCKED` | [expo/app/(tabs)/index.tsx](expo/app/(tabs)/index.tsx) over local provider |
| Incident cards | `COMPLETE` | [expo/components/IncidentCard.tsx](expo/components/IncidentCard.tsx) |
| Keyword search | `COMPLETE` | Client-side across title/summary/area |
| Category filter | `COMPLETE` | 8 chips from `CATEGORY_LABELS` |
| Date filter | `MISSING` | — |
| Location filter | `MISSING` | — |
| Verified filter | `MISSING` | — |
| Urgent filter | `MISSING` | No `urgent` field exists on the model |
| Sorting | `MISSING` | Fixed order: user records first, then mocks |
| Pagination | `MISSING` | Whole array rendered |
| Pull to refresh | `MISSING` | No `refreshControl` on the `FlatList` |
| Empty state | `COMPLETE` | "No stories match" |
| Loading state | `MISSING` | `isLoading` exposed by the provider but never read |
| Error state | `MISSING` | No error path can occur — nothing fetches |

**The defining limitation.** [expo/providers/IncidentsProvider.tsx](expo/providers/IncidentsProvider.tsx) builds the feed as `[...userIncidents, ...MOCK_INCIDENTS]`, where `userIncidents` is `AsyncStorage["blacknexa.user_incidents.v2"]`. There is no network call. The "Community Feed" heading sits above content that is one hardcoded array plus the current device's own reports. Support counts are similarly local: `supportedSet.has(i.id) ? supporters + 1 : supporters` — a user's own tap is the only thing that can ever move a counter.

Performance hygiene is good (`initialNumToRender: 6`, `windowSize: 7`, `removeClippedSubviews` off on web), which will matter once the list is real.

---

## 11. Incident Reporting

| Capability | Status | Evidence |
|---|---|---|
| Multi-step wizard | `MISSING` | Single scroll form, not stepped |
| Category | `COMPLETE` | 7 categories |
| Title | `COMPLETE` | min 4 chars |
| Description | `COMPLETE` | min 10 chars |
| **Date** | **`MISSING`** | No date input; timestamp is `Date.now()` at submit |
| **Time** | **`MISSING`** | Same |
| GPS capture | `COMPLETE` | [expo/app/report.tsx:190-205](expo/app/report.tsx#L190) with web fallback |
| Manual location | `COMPLETE` | Free-text "Neighborhood, city" |
| Approximate location | `PARTIAL` | `redactLocation` keeps only the last comma-segment |
| Photo attach | `PARTIAL` | URIs collected; never uploaded |
| **Video** | **`MISSING`** | `mediaTypes: ["images"]` only; a Video icon is rendered but inert |
| **Audio** | **`MISSING`** | Mic icon rendered; no recording in this screen |
| **Documents** | **`MISSING`** | No document picker |
| Urgent flag | `MISSING` | Not in the data model |
| Privacy selection | `COMPLETE` | Three-way selector |
| Compliance pre-check | `COMPLETE` | `evaluateMediaCompliance` gates the picker |
| Jurisdiction validation | `COMPLETE` | `POST /geo-legal/validate` → review sheet |
| Review before submit | `PARTIAL` | Compliance sheet only, on the geo-legal path |
| Draft saving | `MISSING` | State is lost if the modal closes |
| Submit | `PARTIAL` | Writes locally; dispatch is fire-and-forget |
| Validation feedback | `PARTIAL` | Submit disabled; no per-field messages |
| Error handling | `PARTIAL` | Dispatch failure caught and logged as "non-fatal" |

### What happens on submit

Both submit paths converge on the same local write:

```ts
createIncident({ title, summary, category, privacy, area,
                 hasEvidence: photos.length > 0,
                 evidenceCount: photos.length, redactLocation });
safeBack();
```

Before that, an audit log is initialised and custody events are appended. On the geo-legal path, `confirmAndDispatch` posts to the backend inside a `try/catch` that logs `"[Report] geo-legal dispatch failed (non-fatal)"` and continues. **The user receives no indication that dispatch failed.** They see the modal close and their report appear in the feed, identically to the success case.

`createGeoIncident` is destructured from the provider at [expo/app/report.tsx:97](expo/app/report.tsx#L97) and **is never called** — the one code path that would persist an incident server-side is dead.

---

## 12. Incident Detail

| Capability | Status | Evidence |
|---|---|---|
| Full details | `COMPLETE` | Category, area, time, privacy, evidence count |
| Reporter / anonymous | `COMPLETE` | `author.anonymous` derived from privacy level |
| Custody timeline | `COMPLETE` | Rendered from the persisted audit log |
| Integrity verification | `COMPLETE` | `verifyAuditIntegrity` recomputes the chain at [line 85](expo/app/incident/%5Bid%5D.tsx#L85); "Hash verified" pill reflects the real result |
| **Evidence gallery** | **`MISSING`** | Only a count is shown; no images render |
| Evidence timestamps | `PARTIAL` | Custody events are timestamped; individual files are not surfaced |
| Verification action | `PLACEHOLDER` | Local custody event + `Alert` |
| Support | `PARTIAL` | Local toggle |
| **Comments** | **`MISSING`** | No UI, no model, no endpoint |
| Sharing | `COMPLETE` | Native `Share.share` plus a custom `ShareSheet` |
| Flagging | `PLACEHOLDER` | Two chained `Alert`s; nothing is recorded |
| Advocacy routing | `COMPLETE` | [expo/components/AdvocacyCard.tsx](expo/components/AdvocacyCard.tsx) + [expo/constants/advocacy.ts](expo/constants/advocacy.ts) |
| Dispatch to agencies | `COMPLETE` | Disclaimer acknowledgment then agency contact links |

Notable: the integrity check is one of the few security features that is genuinely real. The hash chain in [expo/constants/security.ts](expo/constants/security.ts) is correctly constructed (each `eventHash = sha256(eventData + previousHash)`) and correctly re-verified. It detects tampering with the *audit log*. It says nothing about the evidence files, which are not covered by it.

---

## 13. Evidence Vault

| Capability | Status | Evidence |
|---|---|---|
| Vault screen | `COMPLETE` | [expo/app/(tabs)/vault.tsx](expo/app/(tabs)/vault.tsx) |
| Record listing | `COMPLETE` | Filtered to `author.handle === "You"` |
| Stats | `COMPLETE` | Records / evidence / private counts |
| **File upload** | **`MISSING`** | No storage backend exists |
| **File download** | **`MISSING`** | — |
| **File preview** | **`MISSING`** | No image renders in the vault |
| **File deletion** | **`MISSING`** | No delete affordance |
| Standalone evidence | `MISSING` | Evidence exists only via an incident |
| Metadata | `PARTIAL` | `EvidenceManifest` type is defined and constructed, but discarded |
| Timestamps | `COMPLETE` | Via custody events |
| **Encryption at rest** | **`MISSING`** | Records are plaintext JSON in `AsyncStorage` |
| Access control | `MISSING` | Any process reading app storage reads everything |
| **PDF timeline export** | **`MISSING`** | — |
| **ZIP export** | **`MISSING`** | "Export my data" shares a 4-field JSON summary via `Share.share` |
| Evidence status | `PLACEHOLDER` | Every record displays the hardcoded string "Sealed" |

### The `createEvidenceManifest` return value is thrown away

At [expo/app/report.tsx:302](expo/app/report.tsx#L302) the manifest — containing the `SealedPayload`, the `contentHash` and the `keyId` — is assigned to a local `const manifest`, used for one `console.log`, and then goes out of scope. On the second submit path ([line 395](expo/app/report.tsx#L395)) it is not even assigned. **The encrypted payload is computed and immediately discarded.** Nothing in the vault can ever be decrypted, because nothing encrypted was ever saved.

This is why §34 classifies the vault as a divergent implementation rather than an incomplete one: the code performs the motions of encryption and then drops the result.

---

## 14. Verification & Trust

| Capability | Status | Evidence |
|---|---|---|
| Hash-chain audit log | `COMPLETE` | [expo/constants/security.ts](expo/constants/security.ts) — real, verified |
| Integrity verification | `COMPLETE` | `verifyAuditIntegrity`, recomputed on screen load |
| Credibility scoring | `PARTIAL` | [expo/constants/credibility.ts](expo/constants/credibility.ts) — a local heuristic on the user's own text |
| Verification badges | `PARTIAL` | Rendered from `incident.verifications`, a mock integer |
| **Community verification** | **`PLACEHOLDER`** | `Alert`: "A moderator will review within 24 hours." No moderator exists |
| **Moderator workflow** | **`MISSING`** | No admin surface, no queue, no role |
| **Review workflow** | **`MISSING`** | No status transitions |
| Evidence integrity | `PARTIAL` | Hashes cover URI strings, not file bytes |
| Chain of custody | `PARTIAL` | Structurally sound, device-local, unattested by any third party |
| Status changes | `MISSING` | Incidents have no lifecycle status field |
| Backend moderation | `PARTIAL` | `POST /api/v1/platform/moderation/check` exists ([functions/_lib/platform/moderation.ts](functions/_lib/platform/moderation.ts)) but no client calls it |

**Clear separation, as requested:**

- **IMPLEMENTED:** the hash-chained audit log and its verification.
- **CONCEPT / PLACEHOLDER:** community verification, moderator review, trust signals, verification badges, and the "moderator will review within 24 hours" promise. There is no moderator role, no moderation queue reachable from the app, and no mechanism by which any review could occur.

For a product positioning itself around legal credibility, the gap between the audit log (real) and the trust workflow (absent) is the most consequential product gap after evidence storage.

---

## 15. Community Engagement

| Capability | Status | Evidence |
|---|---|---|
| Support / upvote | `PARTIAL` | Optimistic local toggle in `AsyncStorage`; invisible to others |
| **Comments** | **`MISSING`** | No component, no type, no endpoint. Absent entirely |
| Replies / threading | `MISSING` | — |
| Share | `COMPLETE` | Native share + [expo/components/ShareSheet.tsx](expo/components/ShareSheet.tsx) |
| Flag / abuse report | `PLACEHOLDER` | Alert → Alert; nothing persists |
| Moderation | `MISSING` | Backend endpoint unused by any client |
| Notification on interaction | `MISSING` | No notification system |
| Live chat | `PARTIAL` | WebSocket sheet at [expo/components/LiveChatSheet.tsx](expo/components/LiveChatSheet.tsx) |
| Creator tipping | `PARTIAL` | Substantial backend; see §27 |

The support toggle is implemented with correct React Query optimistic-update mechanics — `onMutate` snapshot, `onError` rollback, `onSuccess` commit. That machinery is applied to an `AsyncStorage.setItem` that cannot fail in the way it guards against. The engineering is sound; it is pointed at the wrong target.

---

## 16. Resources & Support

**This is one of the strongest areas of the product.** [expo/mocks/resources.ts](expo/mocks/resources.ts) is 1,717 lines of curated data across 13 categories.

| Category | Status |
|---|---|
| Legal Aid | `COMPLETE` |
| Mental Health | `COMPLETE` |
| Housing | `COMPLETE` |
| Workplace | `COMPLETE` |
| Education | `COMPLETE` |
| Hotlines | `COMPLETE` |
| Immigration | `COMPLETE` |
| Voting Rights | `COMPLETE` |
| Youth & Family | `COMPLETE` |
| Reentry | `COMPLETE` |
| Financial | `COMPLETE` |
| Health Equity | `COMPLETE` |
| Advocacy | `COMPLETE` |

Additional structured content in the same file: `RightsTip` (Know Your Rights), `EmergencyProtocol`, `StateRecordingLaw` (per-state recording consent law), `SafetyChecklistItem` (protest safety).

International coverage comes from [expo/constants/geo-legal.ts](expo/constants/geo-legal.ts) → `GLOBAL_RESOURCE_REGIONS`, mirrored server-side at [functions/_lib/geo-legal/global-regions.ts](functions/_lib/geo-legal/global-regions.ts) and served from `GET /api/v1/geo-legal/regions`.

Actions work: `Linking.openURL("tel:…")` and `mailto:` in [expo/app/(tabs)/support.tsx](expo/app/(tabs)/support.tsx).

**The one structural caveat:** this is a hardcoded TypeScript file. Correcting a wrong phone number for a crisis hotline requires an app-store release. For safety-critical contact data, that is a real operational risk. It is `COMPLETE` as a feature and `MISSING` as a maintainable content system.

---

## 17. News

**The most complete vertical in the product, and the only one with a full client-to-backend-to-database path.**

| Capability | Status | Evidence |
|---|---|---|
| News listing | `COMPLETE` | `GET /api/v1/news/feed` |
| Location-based / local news | `COMPLETE` | `GET /api/v1/news/local`, ranked with nearby-city expansion ([functions/_lib/local.ts](functions/_lib/local.ts)) |
| Briefings carousel | `COMPLETE` | `GET /api/v1/news/briefings` |
| Categories | `COMPLETE` | `NewsCategory` in [expo/mocks/news.ts](expo/mocks/news.ts) |
| Scope (local/national/global) | `COMPLETE` | `NewsScope` field |
| Search | `COMPLETE` | Server-side |
| News detail | `COMPLETE` | [expo/app/news/[id].tsx](expo/app/news/%5Bid%5D.tsx), 1,147 lines |
| Sources | `COMPLETE` | `verifiedSources[]` with name + URL, rendered |
| Fact-check status | `PARTIAL` | `factCheckStatus` is a **string** like `"100% FACTUALLY VERIFIED"` — see §34 |
| **Translation** | `COMPLETE` | **21 languages**, `GET /api/v1/news/translate/:slug?lang=` |
| Audio briefing | `COMPLETE` | Backend audio with native-TTS fallback ([expo/utils/audio.ts](expo/utils/audio.ts)) |
| Voice input | `COMPLETE` | STT dictation of a briefing topic |
| AI generation | `COMPLETE` | `POST /api/v1/news/generate` — Exa search + Grok synthesis ([functions/_lib/generate.ts](functions/_lib/generate.ts), 984 lines) |
| Daily refresh | `COMPLETE` | DO alarm + `POST /api/v1/news/refresh-daily` |
| AI images | `COMPLETE` | `GET /api/v1/news/image/:articleId` |
| SEO / syndication | `COMPLETE` | RSS + MRSS, sitemap, news sitemap, sitemap index, JSON-LD, SSR HTML, podcast JSON feed, IndexNow ping |
| Weather | `COMPLETE` | [expo/components/WeatherWidget.tsx](expo/components/WeatherWidget.tsx) |
| Deduplication | `COMPLETE` | `contentHash` + `POST /prune-duplicates` |

The 21 supported languages ([expo/constants/i18n.ts](expo/constants/i18n.ts)): en, es, pt, fr, de, it, nl, ru, tr, ar, zh, ja, ko, hi, vi, id, sw, yo, am, and two others in the same list.

**MVP vs future:** nothing in the code marks news features as future work; this vertical reads as shipped. The reasonable inference is that news was built first and most completely, and the civic-documentation core was scaffolded around it.

---

## 18. Profile & Privacy

| Setting | UI | Backing implementation | Status |
|---|---|---|---|
| Display name | ✅ | `settings.displayName`, default `"Morgan Thompson"` | `PARTIAL` |
| Profile photo | ❌ | Initials only | `MISSING` |
| Vault PIN | ✅ | **Stored in plaintext** in the settings blob | `PARTIAL` ⚠️ |
| Biometric unlock | ✅ | **None** — no `expo-local-authentication` dependency | `PLACEHOLDER` ⚠️ |
| Redact exact location | ✅ | Read at report time; keeps last comma-segment | `PARTIAL` |
| Anonymous by default | ✅ | Sets the custody actor to `"Anonymous"` | `PARTIAL` |
| Auto-seal evidence | ✅ | Only changes the custody event label | `PLACEHOLDER` |
| Push notifications | ✅ | **None** — no notification system exists | `PLACEHOLDER` ⚠️ |
| Preferred language | ✅ | Genuinely drives article translation | `COMPLETE` |
| Export my data | ✅ | Shares `{brand, exportedAt, displayName, reportCount}` | `PLACEHOLDER` |
| Edit profile | ✅ | `Alert.prompt` — iOS only | `PARTIAL` |
| Help & safety | ✅ | One static `Alert` | `PLACEHOLDER` |
| Sign out | ✅ | Clears **consent**, not auth tokens | `PARTIAL` ⚠️ |
| Delete account | ❌ | — | `MISSING` |
| Account management | ❌ | — | `MISSING` |

**Three toggles are cosmetic:** biometric unlock, auto-seal, and push notifications change stored booleans that no subsystem consumes for its stated purpose. Presenting a "Biometric vault lock ✓" indicator ([expo/components/SecurityCard.tsx:101](expo/components/SecurityCard.tsx#L101)) when no biometric check exists is a security-affecting UI claim.

"Export my data" is not a GDPR-adequate export: it exports a display name and a report *count*, not the reports, evidence, or audit logs. The backend does implement right-to-erasure (`DELETE /api/v1/geo-legal/incident/:id`), but no client screen calls it.

---

## 19. Notifications

**Status: `MISSING` in its entirety.**

- No `expo-notifications` in [expo/package.json](expo/package.json).
- No push token registration anywhere.
- No notification permission request.
- No backend push endpoint, no APNs/FCM configuration, no email sending.
- No notification history screen, no notification data model.
- The bell icon in the feed header opens a hardcoded `Alert`: *"You're all caught up. New supporters and verifications will appear here."*
- The Profile "Push notifications" toggle writes `settings.notifs`, which is read by no code path.

Every sub-capability requested — incident status, verification status, comments, support, mentions, admin announcements, history, preferences — is `MISSING`. Note that push notifications also require a custom development build; Expo Go cannot deliver them.

---

## 20. API Inventory

### Backend routes — implemented server-side

Enumerated from [functions/index.ts](functions/index.ts). "Client" = called by the Expo app.

#### News
| Method | Endpoint | Purpose | Client | Status |
|---|---|---|---|---|
| GET | `/ping` | Health | — | `COMPLETE` |
| GET | `/api/v1/news/feed` | Feed | NewsProvider | `COMPLETE` |
| GET | `/api/v1/news/local` | Location-ranked feed | LocationProvider | `COMPLETE` |
| GET | `/api/v1/news/briefings` | Top 3 | NewsProvider | `COMPLETE` |
| GET | `/api/v1/news/article/:slug` | Single article | NewsProvider | `COMPLETE` |
| GET | `/api/v1/news/translate/:slug` | Translation | news/[id] | `COMPLETE` |
| GET | `/api/v1/news/image/:articleId` | AI image | NewsCard | `COMPLETE` |
| POST | `/api/v1/news/generate` | Grounded generation | news tab | `COMPLETE` |
| POST | `/api/v1/news/refresh-daily` | Daily batch | — (alarm) | `COMPLETE` |
| POST | `/api/v1/news/prune-duplicates` | Dedup | — | `COMPLETE` |
| POST | `/api/v1/news/backfill-images` | Backfill | — | `COMPLETE` |
| POST | `/api/v1/news/backfill-translations` | Backfill | — | `COMPLETE` |

#### Geo-Legal
| Method | Endpoint | Purpose | Client | Status |
|---|---|---|---|---|
| GET | `/api/v1/geo-legal/regions` | Global regions | support tab | `COMPLETE` |
| GET | `/api/v1/geo-legal/lookup` | Jurisdiction profile | GeoLegalProvider | `COMPLETE` |
| POST | `/api/v1/geo-legal/validate` | AI compliance check | report.tsx | `COMPLETE` |
| POST | `/api/v1/geo-legal/dispatch` | Route to agencies | report.tsx | `PARTIAL`¹ |
| POST | `/api/v1/geo-legal/incident/create` | Create encrypted incident | **never called** | `BLOCKED`² |
| GET | `/api/v1/geo-legal/incident/:id` | Retrieve sealed | **never called** | `BLOCKED` |
| DELETE | `/api/v1/geo-legal/incident/:id` | Right to erasure | **never called** | `BLOCKED` |
| POST | `/api/v1/geo-legal/refresh` | Re-cache | — | `COMPLETE` |

¹ Called, but failures are swallowed silently. ² Wired into `GeoLegalProvider` and destructured in `report.tsx`, then never invoked.

#### Platform Engine
`/api/v1/platform/*` — 25 routes covering tipping (register, send with `Idempotency-Key`, balance, ledger, payouts, Stripe webhook, fees), cache stats/prune, queue stats/drain/prune, moderation check, ToS agree/check/text, compliance disclaimer/status, and persistence snapshot/restore/integrity. Client usage is limited to tipping, via [expo/components/TippingDashboard.tsx](expo/components/TippingDashboard.tsx) and [expo/components/ArtistTippingSheet.tsx](expo/components/ArtistTippingSheet.tsx). Moderation, ToS and persistence endpoints have **no client consumer**.

#### Enterprise Core
`/api/v1/blacknexa/*` — categories, generate-story, publish-verified-story, feed, artists/tip, hardware/beacon-trigger, weather, live-chat (WebSocket), stats.

#### SEO / Syndication
`/rss.xml`, `/sitemap.xml`, `/sitemap-news.xml`, `/sitemap-index.xml`, `/api/v1/news/:slug/schema.json`, `/api/v1/podcast/feed.json`, `/robots.txt`, `/news/:slug` (SSR HTML), `/blacknexanews2026indexnowkey.txt`. All `COMPLETE`.

### Endpoints the product needs and does not have

| Needed | Status |
|---|---|
| `POST /incidents` (public, listable) | `MISSING` |
| `GET /incidents` (feed with filters + pagination) | `MISSING` |
| `GET /incidents/:id` | `MISSING` |
| `POST /evidence/upload` / signed-URL issuance | `MISSING` |
| `POST /incidents/:id/support` | `MISSING` |
| `GET/POST /incidents/:id/comments` | `MISSING` |
| `POST /incidents/:id/flag` | `MISSING` |
| `POST /incidents/:id/verify` | `MISSING` |
| `GET/PATCH /users/me` | `MISSING` |
| `POST /notifications/register` | `MISSING` |
| Any moderation admin surface | `MISSING` |

### API-layer problems

- **No API client.** Raw `fetch` appears in 9 files. No shared base URL helper, no interceptors, no auth header injection, no retry, no timeout, no error normalisation. Three files independently declare `const FUNCTIONS_URL = process.env.EXPO_PUBLIC_RORK_FUNCTIONS_URL ?? ""` and [GeoLegalProvider](expo/providers/GeoLegalProvider.tsx) wraps the same in a `backendBase()` function — four copies of one concern.
- **Inconsistent failure semantics.** `NewsProvider` throws with a helpful message when the backend is unconfigured; `GeoLegalProvider` silently `return null`s. Callers cannot distinguish "not configured" from "no result."
- **No authentication on any request**, client or server.
- **Empty-string base URL fallback** means an unconfigured build issues requests to relative paths that fail obscurely rather than failing fast.

---

## 21. Data Model

### Client entities

**`Incident`** — [expo/mocks/incidents.ts:11](expo/mocks/incidents.ts#L11)
```ts
{ id, title, summary, category: IncidentCategory, privacy: PrivacyLevel,
  area: string, timestamp: number, supporters: number, verifications: number,
  hasEvidence: boolean, evidenceCount: number,
  author: { handle: string, anonymous: boolean } }
```
`IncidentCategory` = profiling | housing | workplace | policing | education | medical | harassment
`PrivacyLevel` = private | trusted | public

Missing fields the product implies: `userId`/owner, incident date/time (distinct from creation time), `evidence[]` (only a count exists), latitude/longitude, `status`, `urgent`, `updatedAt`, `moderationState`, `verifiedBy[]`.

**`Settings`** — [expo/providers/SettingsProvider.tsx](expo/providers/SettingsProvider.tsx) — 18 fields including `vaultPin: string` ⚠️ and `consentVersion`.

**`EvidenceManifest`** — [expo/constants/security.ts](expo/constants/security.ts) — well-designed (`contentHash`, `encryptionStatus`, `sealedAt`, `mediaType`, `sizeBytes`, `autoSealed`, `sealedPayload`, `keyId`) and **never persisted**.

**`AuditLog` / `CustodyEvent`** — persisted under `blacknexa.audit.<incidentId>`. Ten custody actions. The only evidence-adjacent structure that survives a submit.

**`SealedPayload`** — [expo/constants/crypto.ts](expo/constants/crypto.ts) — ciphertext, nonce, salt, contentHash, cipherSpec, kdfSpec, kdfIterations, sealedAt, zeroKnowledge.

**`NewsArticle`** — [expo/mocks/news.ts:95](expo/mocks/news.ts#L95) — 16 fields including `verifiedSources: VerifiedSource[]`, `factCheckStatus: string`, `godlyPrincipleAlignment: string`, `audioUrl`, `contentHash?`, `nearby?`.

**`Resource`**, **`RightsTip`**, **`EmergencyProtocol`**, **`StateRecordingLaw`**, **`SafetyChecklistItem`** — [expo/mocks/resources.ts](expo/mocks/resources.ts).

**`JurisdictionProfile`**, **`ValidationResult`**, **`DispatchResult`**, **`DispatchChannel`** — [expo/constants/geo-legal.ts](expo/constants/geo-legal.ts).

**Entities that do not exist:** `User` (as a persisted app entity — `AuthUser` is a transient JWT projection), `Comment`, `Notification`, `Verification`, `Flag`, `Evidence` (as a stored record), `Moderator`.

### Relationships as implemented

```
Settings ──(1:1 device)── AsyncStorage        ← no User entity at the centre
    │
Incident ──(1:1)── AuditLog ──(1:N)── CustodyEvent     [persisted]
    │
    ├──(1:N)── Evidence                                 [DOES NOT EXIST]
    ├──(1:N)── Comment                                  [DOES NOT EXIST]
    ├──(N:1)── Verification                             [integer only]
    └──(N:M)── Support        ← a string[] of ids, device-local

NewsArticle ──(1:N)── VerifiedSource                    [server-persisted]
Resource, RightsTip, EmergencyProtocol                  [static constants]
```

The model has no user at its root. Ownership is expressed as the literal string comparison `author.handle === "You"` ([expo/providers/IncidentsProvider.tsx](expo/providers/IncidentsProvider.tsx)) — which means any mock or imported record whose handle happens to be `"You"` would be treated as the current user's.

---

## 22. State Management

| Kind | Mechanism | Assessment |
|---|---|---|
| Global | `@nkzw/create-context-hook` × 6, nested 6 deep in the root layout | Consistent and readable |
| Server | React Query (`staleTime: 30s`, `retry: 1`) | Correct usage |
| Local storage | `AsyncStorage`, 5 key namespaces | Versioned keys (`.v1`, `.v2`) — good discipline |
| Secure storage | `SecureStore` for OAuth tokens only | Correct, but underused |
| Screen state | `useState` + `useMemo` | Fine |

**Storage keys:** `blacknexa.settings.v1`, `blacknexa.user_incidents.v2`, `blacknexa.supported.v2`, `blacknexa.location.v1`, `blacknexa.audit.<id>`.

### Issues

1. **React Query is used as a local-storage wrapper.** `IncidentsProvider` and `SettingsProvider` use `useQuery`/`useMutation` with optimistic updates and rollback around `AsyncStorage` calls. The abstraction is correct but pointed at a non-networked target; migrating to a real API will require rewriting these `queryFn`s rather than extending them.
2. **`zustand` is a dependency and is imported nowhere.** Two state paradigms declared, one used.
3. **Six nested providers** all mount at root regardless of route. `NewsProvider` and `GeoLegalProvider` initialise for a user who only opens the Vault.
4. **No state reset on sign-out.** "Sign out" clears consent flags; incidents, audit logs, cached location and the vault PIN all persist. On a shared device the next user inherits the previous user's records.
5. **Provider ordering is load-bearing but undocumented** — `AuthProvider` must precede consumers, `SettingsProvider` must precede `ConsentGate`.
6. **No cache persistence** for React Query; server state is refetched on every cold start.

---

## 23. Security & Privacy

**This is the section that matters most for this product, and it is where the largest gaps are.**

### What is genuinely implemented

| Control | Evidence |
|---|---|
| AES-256-GCM + PBKDF2-SHA256 (100k iterations) | [expo/constants/crypto.ts](expo/constants/crypto.ts) — a correct implementation using `@noble/ciphers` and `@noble/hashes`. 12-byte nonces, 16-byte salts, an app pepper, best-effort key zeroing |
| SHA-256 content hashing | `hashContent`, cryptographic-grade |
| Hash-chained tamper-evident audit log | [expo/constants/security.ts](expo/constants/security.ts) — real and verified |
| OAuth PKCE with S256 | [expo/providers/AuthProvider.tsx](expo/providers/AuthProvider.tsx) |
| Tokens in `SecureStore` | Keychain / Keystore backed |
| Server-side PII scrubbing | [functions/_lib/geo-legal/pii-scrubber.ts](functions/_lib/geo-legal/pii-scrubber.ts) |
| Versioned legal consent | `LEGAL_VERSION` gate |
| GPS obfuscation helpers | `obfuscateGps`, `redactLocationString` |

### Findings

**1. `CRITICAL` — Vault PIN stored in plaintext.** [expo/providers/SettingsProvider.tsx](expo/providers/SettingsProvider.tsx) declares `vaultPin: string` in the `Settings` type and persists the whole object with `AsyncStorage.setItem("blacknexa.settings.v1", JSON.stringify(next))`. `AsyncStorage` is unencrypted (SQLite/plist on iOS, SharedPreferences-backed on Android). The comment on the field reads *"Never logged"* — but it is stored in cleartext beside the data it protects, so the zero-knowledge property does not hold. It belongs in `SecureStore`, and ideally only a derived verifier should be stored at all.

**2. `CRITICAL` — Encryption is computed and discarded.** See §13. `createEvidenceManifest`'s `SealedPayload` is never persisted. Nothing in the vault is encrypted at rest.

**3. `CRITICAL` — Secret key in the client bundle.** [expo/utils/audio.ts:9](expo/utils/audio.ts#L9): `const TOOLKIT_SECRET = process.env.EXPO_PUBLIC_RORK_TOOLKIT_SECRET_KEY ?? ""`. Expo inlines every `EXPO_PUBLIC_*` variable into the JS bundle, which is trivially extractable from a shipped app. This key must move behind the Worker.

**4. `HIGH` — Backend is entirely unauthenticated.** [functions/index.ts](functions/index.ts) sets `Access-Control-Allow-Origin: *` and no route validates a token. Anyone can call `POST /api/v1/news/generate` (which spends money on AI inference), `POST /api/v1/geo-legal/dispatch` (which routes reports to real agencies), or the tipping endpoints. No rate limiting is visible.

**5. `HIGH` — Weak fallback key derivation.** [expo/app/report.tsx](expo/app/report.tsx): when no PIN is set, the secret becomes `` `fallback:${incidentId}:${settings.consentTimestamp}` ``. `incidentId` is `inc_${Date.now()}` and `consentTimestamp` is stored in the same unencrypted settings blob — so the "key" is fully derivable from data sitting next to the ciphertext.

**6. `HIGH` — Biometric lock is fictional.** No `expo-local-authentication` dependency exists; the UI asserts the protection is active.

**7. `MEDIUM` — Sign-out leaves tokens and data.** Documented in §18 and §22.

**8. `MEDIUM` — No jailbreak/root detection, no screenshot prevention, no clipboard protection** — all standard for apps handling sensitive evidence.

**9. `LOW/MEDIUM` — Logging.** ~30 `console.log` calls remain, including `"[Custody] Evidence sealed:"` with a truncated hash. No secret is logged, but production logging is not stripped.

**10. Positive:** no analytics SDK, no crash reporter, no third-party tracker anywhere in the dependency tree. For a privacy-first product this is the right default, though it means zero production observability.

### Explicitly not claimed

The presence of `@noble/ciphers` does not make this app secure. The library is correctly implemented and correctly used *where it is used*; it is used in one place, and the result is thrown away.

---

## 24. Location Handling

| Aspect | Implementation | Status |
|---|---|---|
| Permission request | `requestForegroundPermissionsAsync` in both [LocationProvider](expo/providers/LocationProvider.tsx) and [report.tsx:190](expo/app/report.tsx#L190) | `COMPLETE` |
| Foreground only | No background permission requested | `COMPLETE` (correct choice) |
| Accuracy | News: `Accuracy.Low` (~1km) — deliberate and documented. Report: `getCurrentPositionAsync({})` — **platform default, i.e. high accuracy** | `PARTIAL` ⚠️ |
| Reverse geocoding | `Location.reverseGeocodeAsync` → city/region | `COMPLETE` |
| Manual entry | Free-text area field | `COMPLETE` |
| Redaction | `redactLocation` keeps the last comma-segment of the string | `PARTIAL` |
| Storage | `blacknexa.location.v1` in `AsyncStorage` — **raw lat/lng, unencrypted** | `PARTIAL` ⚠️ |
| Map rendering | None — no map library | `MISSING` |
| Background location | Not used | `N/A` |
| Denial handling | Handled gracefully | `COMPLETE` |

### Can exact location leak into public view?

**Not in the common path, but yes in an identifiable edge case.**

Normally the report screen reverse-geocodes to `"City, Region"` and only that string is stored, so raw coordinates never reach the incident record. But on **web**, [expo/app/report.tsx](expo/app/report.tsx) skips reverse geocoding entirely and writes the coordinates directly into the area field:

```ts
setArea(`${pos.coords.latitude.toFixed(2)}, ${pos.coords.longitude.toFixed(2)}`);
```

That value flows into `Incident.area` and is rendered on public incident cards. Two decimal places is roughly 1.1 km — coarse, but it is raw coordinates in a public field. Worse, `redactLocation` would then take the last comma-segment, keeping the *longitude* alone, which is meaningless as a place label and still leaks a coordinate.

Separately, `blacknexa.location.v1` caches full-precision lat/lng in unencrypted storage.

**Recommendations:** use `Accuracy.Low` in the report flow as well; never write raw coordinates into a user-facing string field; store coordinates as a structured, redactable field rather than embedding them in `area`; encrypt the location cache.

---

## 25. Evidence / File Handling

**Summary: there is no file handling.**

| Capability | Status |
|---|---|
| Supported formats | Images only — `mediaTypes: ["images"]` |
| File size limits | `MISSING` |
| Upload mechanism | `MISSING` — no `expo-file-system`, no `FormData`, no multipart, no R2/S3 |
| Progress indication | `MISSING` |
| Retry / cancellation | `MISSING` |
| Compression | `PARTIAL` — `quality: 0.8` on the picker |
| Metadata extraction | `MISSING` |
| EXIF handling | **`MISSING`** ⚠️ — EXIF is neither read nor stripped |
| Storage | `MISSING` — cache URIs only |
| Access control | `MISSING` |
| Download / preview / deletion | `MISSING` |
| Encryption | `MISSING` (computed then discarded) |
| Signed URLs | `MISSING` |
| Association with incidents | `PARTIAL` — an integer count only |

### The chain of defects, in order

1. `ImagePicker.launchImageLibraryAsync` returns `assets[].uri` pointing at an OS cache directory. These are **ephemeral** — the system reclaims them.
2. URIs are held in `useState`. Nothing copies the bytes to durable storage.
3. On submit, `sha256(JSON.stringify({incidentId, photos, timestamp, category}) + incidentId)` hashes **the URI strings**, not the image bytes. The hash therefore proves nothing about the image and would not survive re-selection of the same file.
4. `sizeBytes: photos.length` passes a **file count** where a byte size is expected — so an `EvidenceManifest` for 3 photos records `sizeBytes: 3`.
5. The manifest, including its sealed payload, is discarded.
6. The incident stores only `evidenceCount: photos.length`.

**Net effect:** a user attaches three photos, sees "3 files" and "Sealed" in their vault, and has nothing. The images are not stored, not encrypted, not uploaded, not viewable, and will vanish when the OS clears the cache. For a product whose purpose is preserving evidence of civil-rights violations, this is the single most serious defect in the codebase.

**EXIF note:** photos carry GPS coordinates, device identifiers and timestamps in EXIF by default. When upload is built, stripping EXIF before transmission is mandatory, not optional.

---

## 26. UI / UX Analysis

### Strengths

The visual design is unusually consistent and genuinely well-executed for a pre-production app.

- **Centralised theme** — [expo/constants/colors.ts](expo/constants/colors.ts): a single 14-token dark palette (`bg #0E0F12`, `surface`, `gold #E8B15C`, `emerald`, `crimson`, `violet`, `sky`). No stray hex values scattered through components.
- **Consistent idiom** throughout: 14px border radii on cards, 999px pills, `StyleSheet.hairlineWidth` borders, uppercase letter-spaced kickers, 8/10/12/16px spacing rhythm, `LinearGradient` headers.
- **Typography discipline** — weights 500–800, tight negative letter-spacing on large headings.
- **`testID` coverage is excellent** — nearly every interactive element has one, which means the (absent) test suite would be quick to write.
- **Haptics** applied consistently, always guarded with `Platform.OS !== "web"`.
- **Web-safety** — geolocation, `Alert.prompt` and `removeClippedSubviews` all have web branches.

### Weaknesses

| Issue | Detail |
|---|---|
| Loading states | Feed and Vault never render one. `isLoading` is exposed and unused |
| Error states | Feed, Vault and Incident Detail have none |
| Empty states | Good in Feed and Vault; absent elsewhere |
| Confirmation | Destructive actions confirm via `Alert`; no undo anywhere |
| **Accessibility** | Near-absent: no `accessibilityLabel`, no `accessibilityRole`, no `accessibilityHint` on custom `Pressable`s. Icon-only buttons (bell, share) are unlabelled for screen readers. No dynamic-type handling — all font sizes are fixed numbers |
| Dark mode only | `userInterfaceStyle: "automatic"` is declared but only a dark palette exists; the `light` export in `colors.ts` maps to dark values |
| Tablet | `supportsTablet: false` |
| `Alert.prompt` | iOS-only; degrades to "available in the next release" elsewhere |
| Oversized screens | `news.tsx` 1,396 lines, `news/[id].tsx` 1,147, `report.tsx` 1,087 — see §30 |

### Screen maturity classification

- **Production-ready UI:** News, Article Detail, Support, Onboarding, Legal Lookup, Terms, Privacy
- **Polished but hollow** (looks finished, no backing): Feed, Vault, Profile
- **Functional prototype:** Report modal, Incident Detail
- **Placeholders:** `(tabs)/report.tsx` redirect stub, `modal.tsx`, `SafetyBeaconButton` (self-described as a placeholder at [line 9](expo/components/SafetyBeaconButton.tsx#L9))

The gap between UI maturity and functional maturity is the defining characteristic of this codebase, and the main risk to stakeholder expectations: it demos far better than it works.

---

## 27. Third-Party Dependencies

### Client packages of note

| Package | Version | Purpose | Used where | Required | Risk |
|---|---|---|---|---|---|
| expo | `~54.0.27` | Platform | Everywhere | Yes | Low |
| react-native | `0.81.5` | Runtime | Everywhere | Yes | Low |
| expo-router | `~6.0.17` | Navigation | `app/` | Yes | Low |
| @tanstack/react-query | `^5.83.0` | Server state | Providers | Yes | Low |
| @nkzw/create-context-hook | `^1.1.0` | Context factory | 6 providers | Yes | **Medium** — small single-maintainer package on the critical path |
| @noble/ciphers · hashes · curves | `^2.2.0` | Crypto | crypto.ts | Yes | Low — well-audited. `curves` appears **unused** |
| @rork-ai/toolkit-sdk | `^0.2.51` | AI | audio.ts | Yes | **High** — `0.x`, vendor-specific |
| expo-image-picker | `~17.0.9` | Media | report.tsx | Yes | Low |
| expo-secure-store | `~15.0.8` | Tokens | AuthProvider | Yes | Low |
| expo-av | `~16.0.8` | Audio | audio.ts | Yes | **Medium** — deprecated in favour of `expo-audio`/`expo-video` |
| **zustand** | `^5.0.2` | — | **nowhere** | **No** | Dead dependency |
| @ungap/structured-clone | `^1.3.0` | Polyfill | not directly imported | ? | Likely transitive |
| @stardazed/streams-text-encoding | `^1.0.2` | Polyfill | not directly imported | ? | Likely transitive |
| **@types/react-native** (root) | `^0.73.0` | Types | — | **No** | Obsolete for RN 0.81 |

### External services

| Service | Purpose | Integration | Status |
|---|---|---|---|
| Rork Auth | OAuth (Google/Apple) | `EXPO_PUBLIC_RORK_AUTH_URL` | `PARTIAL` |
| Rork Toolkit | TTS, STT, image gen | `EXPO_PUBLIC_TOOLKIT_URL` ⚠️ secret in bundle | `COMPLETE` |
| Rork Functions | Backend | `EXPO_PUBLIC_RORK_FUNCTIONS_URL` | `COMPLETE` |
| Cloudflare Workers + DO | Compute + persistence | Bindings `DO`, `PLATFORM_DO` | `UNKNOWN` in production |
| Exa | Grounded search | Server-side, [functions/_lib/generate.ts](functions/_lib/generate.ts) | `COMPLETE` |
| Grok (xAI) | Synthesis, translation | Server-side | `COMPLETE` |
| Open-Meteo | Weather | Via Worker | `COMPLETE` |
| Stripe | Tipping payouts | Webhook route exists ([functions/_lib/platform/tipping.ts](functions/_lib/platform/tipping.ts), 918 lines) | `UNKNOWN — requires confirmation` |
| IndexNow / Bing / Yandex | Instant indexing | Server-side ping | `COMPLETE` |

**Not present, and notable by absence:** Firebase, AWS, Sentry or any crash reporter, any analytics SDK, any maps SDK, any push provider.

---

## 28. Testing

**Zero tests exist.** Verified by searching all three codebases for `*.test.*`, `*.spec.*` and `__tests__` — no matches. `ios/BlackNexaTests/` and `ios/BlackNexaUITests/` are empty target directories. No test runner appears in any manifest. No CI configuration exists.

| Flow | Criticality | Coverage |
|---|---|---|
| Authentication / PKCE exchange | P0 | None |
| Consent gate routing | P0 | None |
| Incident creation | P0 | None |
| Evidence handling | P0 | None |
| Crypto seal/open round-trip | P0 | None |
| Audit-log chain + tamper detection | P0 | None |
| Privacy level → feed filtering | P0 | None |
| Location redaction | P0 | None |
| Geo-legal validate/dispatch | P1 | None |
| News feed / translation | P1 | None |
| Backend routing | P1 | None |

The highest-value tests to write first are pure functions with no I/O and clear contracts: `sealPayload`/`openPayload` round-trip and tamper rejection, `verifyAuditIntegrity` against a mutated log, `obfuscateGps`/`redactLocationString`, and the feed privacy filter. These are hours of work each and directly cover the safety-critical claims.

The dense `testID` coverage across components means E2E setup (Maestro or Detox) would be unusually cheap once a runner exists.

---

## 29. Environment & Configuration

Only [expo/.env.example](expo/.env.example) is present; it is untracked in git (it appears under `??` in status) and **no real `.env` exists in the repository** — correct hygiene.

| Variable | Purpose | Value |
|---|---|---|
| `EXPO_PUBLIC_RORK_FUNCTIONS_URL` | Backend base | Template: `https://blacknexa-backend.rork.app` |
| `EXPO_PUBLIC_RORK_AUTH_URL` | Auth service | Template: `https://auth.rork.com` |
| `EXPO_PUBLIC_RORK_APP_KEY` | OAuth app key | `PRESENT (VALUE REDACTED)` — placeholder in template |
| `EXPO_PUBLIC_PROJECT_ID` | Deep-link scheme | `PRESENT (VALUE REDACTED)` — placeholder in template |
| `EXPO_PUBLIC_TOOLKIT_URL` | AI toolkit | Template: `https://toolkit.rork.com` |
| `EXPO_PUBLIC_RORK_TOOLKIT_SECRET_KEY` | **Secret** | `PRESENT (VALUE REDACTED)` ⚠️ **must not be `EXPO_PUBLIC_`** |

Server-side environment ([functions/index.ts](functions/index.ts), `type Env`): `DO`, `PLATFORM_DO`, `EXPO_PUBLIC_TOOLKIT_URL?`, `EXPO_PUBLIC_RORK_TOOLKIT_SECRET_KEY?`.

### Findings

- **No environment separation.** No dev/staging/prod configs, no `eas.json`, no build profiles. One set of variables.
- **No feature flags** of any kind.
- **No `wrangler.toml`** — the Worker's deployment configuration is not in the repository. Production bindings, routes, custom domains and secrets: `UNKNOWN — requires confirmation`.
- **Hardcoded production origin** — `PUBLIC_ORIGIN` in [functions/_lib/types.ts](functions/_lib/types.ts) is baked in, not environment-derived.
- **Hardcoded IndexNow key** — `blacknexanews2026indexnowkey` appears literally in [functions/index.ts](functions/index.ts). Low severity (IndexNow keys are public by design) but it should still be configuration.
- **App slug is a generated Rork ID** — `499r3rz679a2j9vr4ap98` — which appears in the bundle identifier, the URL scheme and the start scripts. This must be replaced with real BlackNexa identifiers before any store submission.

---

## 30. Technical Debt

**Duplicate code**
- **Two entire client applications.** [expo/](expo/) and [ios/](ios/) implement the same product twice, in different languages, both mock-backed. Feature parity must be maintained manually. This is the single largest source of debt in the repository.
- Four independent copies of the backend base-URL resolution.
- `MockData` duplicated: `expo/mocks/*` and `ios/BlackNexa/Data/Mock*.swift`.
- `GLOBAL_RESOURCE_REGIONS` and `ENGINE_INFO` duplicated between [expo/constants/geo-legal.ts](expo/constants/geo-legal.ts) and [functions/_lib/geo-legal/global-regions.ts](functions/_lib/geo-legal/global-regions.ts) with no shared source.
- `sha256` wraps `hashContent` in an `async` function that cannot reject, with an unreachable `fallbackHash` branch.

**Oversized modules** — `news.tsx` 1,396 · `mocks/resources.ts` 1,717 · `news-store.ts` 1,562 · `news/[id].tsx` 1,147 · `report.tsx` 1,087 · `jurisdictions.ts` 3,862. Each mixes data fetching, business logic, and presentation in one file.

**Dead code**
- `zustand` — declared, never imported.
- `@noble/curves` — declared, never imported.
- `@types/react-native` in root `package.json` — obsolete.
- `_unusedLegacy` in [expo/app/+native-intent.tsx](expo/app/+native-intent.tsx) — a no-op with `void _unusedLegacy;` to silence the linter.
- [expo/app/modal.tsx](expo/app/modal.tsx) — unreachable.
- `createGeoIncident` — destructured, never called.
- `generateKeyId` in security.ts — duplicated by `generateSealedKeyId` in crypto.ts.

**Correctness bugs**
- `sizeBytes: photos.length` — a count where bytes are expected ([expo/app/report.tsx](expo/app/report.tsx), both submit paths).
- `encryptionStatus` is hardcoded to `"AES_256_GCM_SEALED"` regardless of whether `plaintextData`/`userSecret` were supplied, so a manifest with no `sealedPayload` still reports itself as sealed ([expo/constants/security.ts](expo/constants/security.ts)).
- `redactLocationString` on a coordinate string yields a bare longitude (§24).
- Root `typescript ^7.0.2` vs Expo `~5.9.2`.

**Weak error handling**
- Dispatch failure swallowed as "non-fatal" with no user feedback.
- `GeoLegalProvider` returns `null` indistinguishably for "not configured", "network error", and "no result".
- ~30 `console.log`/`console.warn` calls left in production paths.
- Several bare `catch {}` blocks with only a comment.

**Missing** — no tests, no CI, no error boundary, no crash reporting, no observability, no API layer, no i18n for the UI itself (only articles are translated; every UI string is hardcoded English).

**Marker comments:** zero `TODO`/`FIXME`/`HACK` in the Expo app. The incompleteness is not annotated — which makes this document's role as the gap record more important.

---

## 31. Scope vs Codebase Comparison

> **Scope column is `INFERRED` — no client scope document was available. Re-baseline before use.**

| Feature | Scope (INFERRED) | Code exists? | Functional? | Complete? | Gap | Priority |
|---|---|---|---|---|---|---|
| Splash | Yes | Yes | Yes | Yes | None | — |
| Onboarding | Yes | Yes | Yes | Partial | Consent only, no tour | P2 |
| Login / Signup screens | Yes | **No** | No | No | Entire screens `MISSING` | **P0** |
| Email/password auth | Yes | No | No | No | `MISSING` | P1 |
| Google / Apple sign-in | Yes | Yes | Partial | No | No entry point, no guard | **P0** |
| Forgot password | Yes | No | No | No | `MISSING` | P2 |
| MFA | Likely | No | No | No | `MISSING` | P3 |
| Auth route guard | Yes | **No** | No | No | Only consent is gated | **P0** |
| Community feed | Yes | Yes | Partial | No | **`MOCKED`** — no backend | **P0** |
| Feed search | Yes | Yes | Yes | Partial | Client-side only | P2 |
| Feed filters (date/loc/verified/urgent) | Yes | No | No | No | `MISSING` | P2 |
| Sorting / pagination | Yes | No | No | No | `MISSING` | P1 |
| Pull to refresh | Yes | No | No | No | `MISSING` | P2 |
| Incident reporting | Yes | Yes | Partial | No | Local only; no date/time | **P0** |
| Multi-step wizard | Likely | No | No | No | Single form | P2 |
| Photo evidence | Yes | Yes | **No** | No | **Never uploaded** | **P0** |
| Video / audio / document evidence | Yes | No | No | No | `MISSING` | P1 |
| Draft saving | Likely | No | No | No | `MISSING` | P2 |
| Incident detail | Yes | Yes | Partial | No | No evidence gallery, no comments | P1 |
| Evidence Vault | Yes | Yes | Partial | No | **Read-only, unencrypted** | **P0** |
| Evidence encryption | Yes | Yes | **No** | No | **Computed then discarded** | **P0** |
| PDF / ZIP export | Yes | No | No | No | `MISSING` | P2 |
| Verification workflow | Yes | Yes | **No** | No | **`PLACEHOLDER`** | P1 |
| Chain of custody | Yes | Yes | Yes | Partial | Real, but device-local | P1 |
| Moderator tooling | Yes | No | No | No | `MISSING` | P1 |
| Support / upvote | Yes | Yes | Partial | No | Local only | P1 |
| Comments / replies | Yes | **No** | No | No | **Absent entirely** | P1 |
| Flag / abuse report | Yes | Yes | **No** | No | `PLACEHOLDER` | P1 |
| Share | Yes | Yes | Yes | Yes | None | — |
| News listing / detail | Yes | Yes | Yes | Yes | None | — |
| Local news | Yes | Yes | Yes | Yes | None | — |
| Multilingual news | Yes | Yes | Yes | Yes | 21 languages | — |
| Audio briefing | Yes | Yes | Yes | Yes | None | — |
| Resources directory | Yes | Yes | Yes | Yes | Static data source | P2 |
| Know Your Rights / protest safety | Yes | Yes | Yes | Yes | None | — |
| Emergency protocols | Yes | Yes | Yes | Yes | None | — |
| International resources | Yes | Yes | Yes | Yes | None | — |
| Profile management | Yes | Yes | Partial | No | Local; iOS-only editing | P1 |
| Anonymous mode | Yes | Yes | Partial | No | Custody label only | P1 |
| Privacy settings | Yes | Yes | Partial | No | 3 toggles cosmetic | **P0** |
| Biometric lock | Yes | Yes | **No** | No | **No dependency exists** | **P0** |
| Account deletion | Yes | No | No | No | `MISSING` | P1 |
| GDPR data export | Yes | Yes | **No** | No | Exports 4 fields | P1 |
| Push notifications | Yes | **No** | No | No | **Entirely `MISSING`** | P1 |
| Email notifications | Yes | No | No | No | `MISSING` | P2 |
| Notification history / prefs | Yes | Partial | No | No | Toggle with no system | P1 |
| FAQ / walkthrough / help | Yes | No | No | No | One `Alert` | P2 |
| Incident map | Future | No | No | N/A | `FUTURE` | P3 |
| Creator tipping | Yes | Yes | Partial | No | Payment rails `UNKNOWN` | P2 |
| Safety beacon (BLE) | Future | Yes | No | No | Self-declared placeholder | P3 |
| Testing | Yes | **No** | No | No | **Zero tests** | **P0** |

### iOS client parity audit

Per the agreed approach, the SwiftUI app is assessed as a parallel implementation rather than inventoried screen-by-screen.

**What it duplicates:** all six tabs, incident detail, article detail, onboarding, legal views, share sheet, compliance review sheet. Models mirror the TypeScript ones (`Credibility`, `Compliance`, `Custody`, `DispatchRouter`, `AdvocacyRoute`, `Agencies`, `CryptoEngine`).

**Where it converges:** it shares the same fundamental limitation — [ios/BlackNexa/Stores/IncidentsStore.swift:38](ios/BlackNexa/Stores/IncidentsStore.swift#L38) seeds from `MockData.seedIncidents` exactly as the Expo provider does. `NewsStore.swift` calls the same Worker endpoints via `URLSession`. So the iOS app is **not** a more advanced implementation — it has the same hollow core.

**Where it diverges:** the Expo app has components with no Swift counterpart — `TippingDashboard`, `ArtistTippingSheet`, `CivilRightsPremiumBanner`, `DisclaimerModal`, `NewsCard`, `IncidentCard`, `PrivacyBadge`, `BrandMark`. Line-count comparison shows the drift: `NewsView.swift` is 778 lines against `news.tsx`'s 1,396.

**Risk assessment:** maintaining two clients doubles the cost of every remaining P0 item in this document. The Expo app is demonstrably ahead in feature surface. Unless there is a product reason for a native iOS app that Expo cannot serve — none is evident in the code — **consolidating on Expo and archiving `ios/` is the highest-leverage architectural decision available.** The rationale for the split is `UNKNOWN — requires confirmation`.

---

## 32. Missing Features

**Frontend missing**
Login screen · Signup screen · Forgot password · Auth route guard · Evidence gallery · Evidence preview/download/delete · Comments UI · Notification centre · FAQ / help / walkthrough · Account deletion · Profile photo · Incident map · Draft saving · Date/time inputs on reports · Feed pagination, sorting and advanced filters · Pull-to-refresh · Loading and error states on Feed/Vault · Light theme · Accessibility labels · UI internationalisation

**Backend missing**
Incident CRUD and listing · Evidence upload and retrieval · Comments · Support/reaction persistence · Flag/report intake · Verification workflow · Moderation queue · User profile store · Notification service · **Authentication on every route** · Rate limiting

**API missing**
See the "endpoints the product needs and does not have" table in §20.

**Database missing**
`User`, `Incident`, `Evidence`, `Comment`, `Support`, `Flag`, `Verification`, `Notification` tables. Only news and platform data are persisted server-side.

**Storage missing**
Object storage entirely — no R2, no S3, no bucket binding, no signed URL issuance, no CDN for evidence.

**Security missing**
Encrypted evidence at rest · PIN in `SecureStore` · Real biometric lock · Backend authentication and authorisation · Secret removal from the client bundle · EXIF stripping · Screenshot prevention · Jailbreak/root detection · Session invalidation on sign-out · Rate limiting

**UX missing**
Loading/error/success states in several screens · Accessibility · Upload progress · Undo on destructive actions · Onboarding beyond consent · In-app support channel

**Testing missing**
Everything.

**Infrastructure missing**
CI/CD · `eas.json` build profiles · `wrangler.toml` in-repo · Environment separation · Crash reporting · Observability · Feature flags · Release process

**Product clarification required**
See §40.

---

## 33. Partial Features

| Feature | Works | Does not work |
|---|---|---|
| Authentication | PKCE flow, token storage, refresh | No screen, no guard, no API usage |
| Incident reporting | Full form, compliance, jurisdiction validation | Persistence, evidence, date/time, drafts |
| Evidence vault | Listing, stats, empty state | Files, encryption, export, delete |
| Encryption | Correct primitives | Not wired to storage |
| Chain of custody | Hash chain + verification | Device-local, covers only the log |
| Community support | Optimistic UI | Not shared between users |
| Profile | Language, display name, several toggles | Biometrics, auto-seal, notifications, export |
| Location | Capture, geocoding, caching | Report flow uses high accuracy; raw coords cached and web-leaked |
| Tipping | Backend + dashboard UI | Payment rails `UNKNOWN` |
| Live chat | WebSocket sheet | Persistence/moderation `UNKNOWN` |
| Geo-legal dispatch | Validate + review + dispatch | Failures silently swallowed |

---

## 34. Incorrect / Divergent Implementations

The findings in this section are qualitatively different from "incomplete." In each case the code does something, but not what it says it does.

**1. The encryption theatre — `CRITICAL`**
The UI asserts, in [expo/app/(tabs)/vault.tsx](expo/app/(tabs)/vault.tsx): *"Your evidence, timestamps, and personal records. End-to-end encrypted"*, *"Vault integrity verified"*, *"All records cryptographically sealed."* [expo/app/onboarding.tsx](expo/app/onboarding.tsx) presents "Encrypted" as a product pillar. The custody log records *"Record encrypted with AES-256-GCM (zero-knowledge). Key derived on-device via PBKDF2."*

The vault screen imports no crypto module. Records are plaintext JSON in `AsyncStorage`. The one place encryption is invoked ([expo/app/report.tsx:302](expo/app/report.tsx#L302)) discards the result. **The custody log states that encryption occurred, and that statement is written into a tamper-evident chain — meaning the audit trail attests to something that did not happen.** For a product whose value proposition is legal credibility, an audit log that certifies a false fact is worse than no audit log.

**2. Plaintext vault PIN — `CRITICAL`**
Documented in §23. The field carrying the zero-knowledge secret is stored unencrypted alongside the data it protects.

**3. Fictional biometric lock — `HIGH`**
`expo-local-authentication` is not a dependency. [expo/components/SecurityCard.tsx:101](expo/components/SecurityCard.tsx#L101) renders "Biometric vault lock ✓" based on a boolean no authentication code reads.

**4. Evidence hashing hashes the wrong thing — `HIGH`**
The `contentHash` covers URI strings, not file bytes (§25). It cannot detect evidence tampering, which is the entire purpose of a content hash in a chain-of-custody system.

**5. `encryptionStatus` is unconditional — `MEDIUM`**
`createEvidenceManifest` hardcodes `encryptionStatus: "AES_256_GCM_SEALED"` even when no `plaintextData` or `userSecret` was passed and no `sealedPayload` was produced.

**6. `sizeBytes` receives a file count — `MEDIUM`**
Three photos are recorded as `sizeBytes: 3`. Any future size-based logic or forensic display will be wrong.

**7. Sign-out does not sign out — `MEDIUM`**
Clears consent; leaves OAuth tokens in `SecureStore` and all user data in `AsyncStorage`.

**8. Fact-check status is a decorative string — `MEDIUM`**
`factCheckStatus: "100% FACTUALLY VERIFIED"` ([expo/mocks/news.ts](expo/mocks/news.ts)) is a free-text field on AI-generated content, rendered to users as a verification badge. A `100%` verification claim on machine-synthesised text is a factual-accuracy and reputational exposure. A structured enum tied to an actual verification process is needed — [functions/_lib/platform/fact-verify.ts](functions/_lib/platform/fact-verify.ts) exists but no client path consumes it.

**9. Verification promises a reviewer who does not exist — `MEDIUM`**
*"A moderator will review within 24 hours."* No moderator role, queue, or workflow exists anywhere in the system.

**10. Two divergent client codebases — `HIGH` (architectural)**
See §31.

**11. Web geolocation writes raw coordinates into a public field — `MEDIUM`**
See §24.

---

## 35. Backend Dependencies

For each incomplete feature, the actual blocker:

| Feature | UI | API | Backend | DB | Storage | Auth | Verdict |
|---|---|---|---|---|---|---|---|
| Evidence upload | ✅ picker exists | ❌ | ❌ | ❌ | ❌ | ❌ | **`BLOCKED` — storage + API** |
| Shared community feed | ✅ | ❌ | ❌ | ❌ | — | ❌ | **`BLOCKED` — full stack** |
| Incident persistence | ✅ | ⚠️ create only | ⚠️ | ❌ | — | ❌ | **`BLOCKED` — DB + auth** |
| Comments | ❌ | ❌ | ❌ | ❌ | — | ❌ | `MISSING` — everything |
| Support persistence | ✅ | ❌ | ❌ | ❌ | — | ❌ | **`BLOCKED` — API** |
| Verification workflow | ✅ | ❌ | ❌ | ❌ | — | ❌ | **`BLOCKED` — product + backend** |
| Moderation | ❌ | ⚠️ endpoint unused | ⚠️ | ❌ | — | ❌ | **`BLOCKED` — UI + auth + roles** |
| Push notifications | ⚠️ toggle | ❌ | ❌ | ❌ | — | ❌ | `MISSING` — everything |
| Login screen | ❌ | ✅ | ✅ | — | — | ✅ | **`BLOCKED` — UI only** ⭐ |
| Auth guard | ❌ | ✅ | ✅ | — | — | ✅ | **`BLOCKED` — UI only** ⭐ |
| Encrypted vault | ✅ | — | — | — | local | — | **`BLOCKED` — client wiring only** ⭐ |
| Biometric lock | ✅ | — | — | — | — | — | **`BLOCKED` — dependency only** ⭐ |
| Account deletion | ❌ | ✅ erasure exists | ✅ | — | — | ❌ | **`BLOCKED` — UI + auth** |
| PDF/ZIP export | ❌ | — | — | — | — | — | `MISSING` — client only |
| Evidence gallery | ❌ | ❌ | ❌ | ❌ | ❌ | — | **`BLOCKED` — depends on upload** |

⭐ **Four high-value items are blocked on client work alone** — no backend dependency at all. Login screen, auth guard, encrypted vault wiring, and biometric lock can each be completed without waiting for any server work. These are the fastest credibility wins available.

---

## 36. Blockers

**Hard blockers (nothing downstream can proceed)**

1. **No object storage decision or provisioning.** Blocks all evidence work, which blocks the vault, the evidence gallery, real content hashing, and export. Cloudflare R2 is the natural fit alongside the existing Workers deployment. Product/infra decision required.
2. **No incident database.** Blocks the shared feed, support persistence, comments, verification and moderation. A Durable Object or D1 schema needs designing.
3. **No backend authentication.** Blocks every write endpoint from being safe to expose. The Worker must validate the Rork JWT and derive a stable user id.

**Soft blockers (workaroundable, but costly)**

4. Two client codebases — every fix costs double until consolidation is decided.
5. No tests — no safe way to refactor the crypto and storage layers.
6. No environment separation — no safe place to validate backend changes.
7. Push notifications require a custom development build; Expo Go cannot deliver them.

**Product decisions required before build**

8. Verification/moderation model — who moderates, against what criteria, with what tooling?
9. Whether `factCheckStatus` claims can be substantiated, and what the badge should say if not.
10. Anonymity model — what does "anonymous" mean against a server that must know the author to enforce ownership?
11. Resource-data governance — who keeps the crisis hotline numbers correct, and through what process?

---

## 37. Recommended Development Roadmap

### Phase 0 — Truth and safety (before any new feature)
**Do first, because it is both the fastest and the highest-risk-reduction work.**
- Move `vaultPin` from `AsyncStorage` to `SecureStore`; store a derived verifier, not the PIN.
- Move `EXPO_PUBLIC_RORK_TOOLKIT_SECRET_KEY` behind the Worker; rotate the key.
- Either implement biometric lock (`expo-local-authentication`) or remove the toggle and the "✓" indicator.
- Correct or remove every unearned security claim in the UI and in custody event text.
- Decide: consolidate on Expo, or fund two clients.
- Decide the object-storage provider.
- Add a test runner and cover the crypto and custody functions.
**Output:** the app no longer misrepresents its protections. **Blockers:** product sign-off on messaging.

### Phase 1 — Authentication foundation
- Login and signup screens; wire `signIn` to a real entry point.
- Replace `ConsentGate` with a combined auth + consent guard.
- Attach the access token to every request; add a shared API client with interceptors, timeout, retry and error normalisation.
- Validate JWTs in the Worker; derive `userId`.
- Fix sign-out to clear tokens and reset all local state.
**Depends on:** Phase 0. **Tests:** guard routing, token refresh, sign-out state reset.

### Phase 2 — Incident backend
- Design and migrate the incident schema (DO SQLite or D1).
- `POST/GET /incidents`, `GET /incidents/:id`, with pagination and filters.
- Rewrite `IncidentsProvider` `queryFn`s against the API; delete the mock merge.
- Add date/time fields, `status`, and an owner id to the model.
**Output:** a genuinely shared community feed. **Tests:** privacy filtering, pagination, ownership.

### Phase 3 — Evidence (the critical path)
- Provision R2; implement signed-URL issuance.
- Copy picked media to app-durable storage with `expo-file-system`.
- **Strip EXIF**, then encrypt file bytes client-side, then upload.
- Hash the actual bytes; persist the `EvidenceManifest`.
- Upload progress, retry, cancellation, size limits.
- Add video, audio and document capture.
- Build the evidence gallery and preview; wire delete.
**Output:** evidence that actually exists. **Tests:** round-trip encrypt→upload→download→decrypt→verify.

### Phase 4 — Vault completion
- Decrypt and render sealed records.
- PDF custody timeline and ZIP export.
- Real GDPR data export; account deletion via the existing erasure endpoint.
**Depends on:** Phase 3.

### Phase 5 — Trust and moderation
- Define the verification model (product decision from §36).
- Server-side verification and flag intake with state transitions.
- Moderator role, queue and admin surface; wire the existing moderation endpoint.
- Anchor custody logs server-side so they are attestable by a third party.

### Phase 6 — Community engagement
- Comments with threading, plus persisted support.
- Abuse reporting into the moderation queue.

### Phase 7 — Resources hardening
- Move resource data to a managed backend source so corrections ship without an app release.

### Phase 8 — News hardening
- Replace the free-text `factCheckStatus` with a structured enum backed by [functions/_lib/platform/fact-verify.ts](functions/_lib/platform/fact-verify.ts).
- Add UI internationalisation to match the 21-language article support.

### Phase 9 — Notifications
- `expo-notifications`, custom dev build, token registration, backend push service, preference enforcement, notification history.

### Phase 10 — Production readiness
- CI/CD, `eas.json`, environment separation, crash reporting, observability, rate limiting, accessibility pass, third-party security audit, App Store/Play review preparation (replace the generated Rork slug and bundle identifiers).

---

## 38. Priority Matrix

**P0 — Critical MVP (blocks launch; several also block trust and safety)**
Login/signup screens · Auth route guard · Backend authentication · Incident backend + shared feed · Evidence upload and storage · Real vault encryption · PIN in `SecureStore` · Secret removed from the bundle · Biometric lock implemented or removed · Security claims corrected · Test foundation

**P1 — Important MVP**
Comments · Support persistence · Verification workflow · Moderation tooling · Push notifications · Account deletion · Real GDPR export · Evidence gallery · Feed pagination and sorting · Video/audio/document evidence · Report date/time fields · Client consolidation decision

**P2 — Post-MVP**
Advanced feed filters · Pull-to-refresh · Draft saving · Multi-step report wizard · PDF/ZIP export · FAQ and walkthrough · Email notifications · Resource data governance · Accessibility · UI i18n · Forgot password · Tipping completion

**P3 — Future**
Incident map · BLE safety beacon · MFA · Light theme · Tablet support · Offline mode

Priorities are derived from: the core user journey (a report that cannot be stored or seen breaks the product), security exposure (claims that outrun implementation), dependency order (auth gates the backend, which gates the feed), and stated product identity (evidence preservation is the brand).

---

## 39. Production Readiness

No invented percentages; ratings are High / Medium / Low with the reasoning stated.

| Dimension | Rating | Reasoning |
|---|---|---|
| **Architecture** | **Medium** | Clean, consistent client structure and a well-organised Worker. Undermined by a missing API layer, two parallel clients, and a backend that does not cover the core domain |
| **UI readiness** | **High** | Consistent design system, thorough `testID` coverage, good empty states. Held back only by accessibility and missing loading/error states |
| **Backend readiness** | **Low** | Excellent for news and geo-legal; entirely absent for incidents, evidence, users, comments and notifications — and unauthenticated throughout |
| **Security readiness** | **Low** | Correct primitives, largely unwired; a plaintext PIN, a bundled secret, a fictional biometric lock, and UI claims the code does not support |
| **Testing readiness** | **Low** | Zero tests. The one countable metric in this document: **0 test files** |
| **Feature completeness** | **Low–Medium** | News, resources and geo-legal are done. The core loop — document → preserve → share → support — does not complete |
| **Data integrity** | **Low** | Evidence is not durably stored; content hashes cover the wrong data |
| **Observability** | **Low** | No crash reporting, no analytics, no server logging beyond `console` |
| **Deployment readiness** | **Low** | No CI, no build profiles, generated Rork identifiers still in place |

**Overall: not production-ready.** The app would demo convincingly and fail its users in exactly the situation it was built for — a person documenting an incident, believing their evidence is preserved and encrypted, when it is neither.

---

## 40. Open Questions

**Requires client / product confirmation**
1. Where is the official BlackNexa scope document? Sections 31–33 and 38 are built on inference and need re-baselining.
2. Why do two client codebases exist? Can we consolidate on Expo?
3. What is the verification and moderation model — who moderates, and with what tooling?
4. Can `factCheckStatus: "100% FACTUALLY VERIFIED"` on AI-generated content be substantiated? What should it say if not?
5. What does "anonymous" guarantee, given a server that must know the author?
6. Who owns the accuracy of the crisis hotline and legal-aid data?
7. Is dispatching reports to real government agencies live, and what is the legal review position on it?
8. Target launch geographies — which jurisdictions must the geo-legal data cover at launch?

**`UNKNOWN — requires confirmation` from the environment**
9. Is `blacknexa-backend.rork.app` deployed and live?
10. Cloudflare production configuration — no `wrangler.toml` in the repository.
11. The DO SQLite schema as actually deployed.
12. Whether Stripe is configured; whether tipping has processed real money.
13. Whether Rork Auth is provisioned for this app (`APP_KEY`, `PROJECT_ID`).
14. Whether the toolkit secret has ever been shipped in a distributed build — if so, it must be rotated immediately.
15. Whether any external security review has been performed.
16. Trademark status ("pending with the USPTO" appears throughout the code).

---

## 41. Final Summary

BlackNexa is two products in one repository. The **news, geo-legal and resources product** is real, sophisticated and close to shippable — a Cloudflare Workers backend generating grounded, translated, SEO-syndicated briefings, backed by 3,862 lines of curated jurisdictional legal data and a 1,717-line resource directory. That work is genuinely impressive.

The **civic evidence-documentation product** — the one the brand, the onboarding copy and the app icon are built around — is a high-fidelity shell. The screens are polished, the design system is consistent, the cryptography library is correct. But incidents never leave the device, evidence photos are never stored, the encryption is computed and discarded, and the vault that promises end-to-end encryption holds plaintext JSON.

The gap is not primarily one of missing work. It is a gap between what the interface tells users is happening and what the code does. That distinction matters more here than in most products, because the users are people documenting civil-rights violations, and the promise being made to them is that their evidence will be preserved, protected, and admissible.

The path forward is well-defined and the first steps are cheap. Four of the highest-value fixes — the login screen, the auth guard, wiring the vault to the crypto module that already exists, and either implementing or removing the biometric claim — require no backend work at all. Beyond those, one storage decision and one database schema unblock the rest of the product.

---

## Final Assessment Table

| Area | Current State | Main Gap | Priority |
|---|---|---|---|
| **Authentication** | OAuth PKCE built, guards nothing | No login screen, no route guard, token never sent to any API | **P0** |
| **Community** | Mock array + AsyncStorage; single-device | No incident backend — users cannot see each other | **P0** |
| **Incident Reporting** | Full UI, compliance, jurisdiction validation | Writes locally only; no date/time; no drafts | **P0** |
| **Evidence** | Picker collects URIs | Never uploaded, never stored, never encrypted; hashes the wrong data | **P0** |
| **Security** | Correct crypto library, unwired | Plaintext PIN, bundled secret, fake biometrics, unearned UI claims | **P0** |
| **Testing** | Nothing | 0 test files across 3 codebases | **P0** |
| **Trust / Verification** | Real hash-chained audit log | Verification is an `Alert`; no moderator exists | P1 |
| **Engagement** | Local support toggle | Comments absent entirely; flags go nowhere | P1 |
| **Notifications** | Toggle only | No dependency, no service, no backend | P1 |
| **Profile & Privacy** | Rich settings UI | Three toggles cosmetic; sign-out leaves tokens and data | P1 |
| **News** | Full stack, 21 languages, syndicated | `factCheckStatus` is an unverified free-text claim | P2 |
| **Resources** | 13 categories, curated, working links | Hardcoded — corrections need an app release | P2 |
| **Architecture** | Clean but doubled | Two parallel clients; no API layer | P1 |

---

## TOP 10 NEXT DEVELOPMENT TASKS

Ordered by risk reduction per unit of effort. The first four require no backend work.

1. **Move `vaultPin` out of `AsyncStorage` into `SecureStore`,** storing a derived verifier rather than the PIN itself. *Small. Closes the most direct contradiction of the zero-knowledge claim.* → [expo/providers/SettingsProvider.tsx](expo/providers/SettingsProvider.tsx)

2. **Remove `EXPO_PUBLIC_RORK_TOOLKIT_SECRET_KEY` from the client; proxy TTS/STT through the Worker; rotate the key.** *Small. A shipped secret is compromised the moment a build is distributed.* → [expo/utils/audio.ts:9](expo/utils/audio.ts#L9)

3. **Reconcile every security claim in the UI with what the code does** — vault copy, onboarding pillars, `SecurityCard` indicators, and the custody event text asserting encryption. Either implement or retract. *Small–medium. Removes a user-safety and legal exposure.*

4. **Build the login screen and replace `ConsentGate` with a combined auth + consent guard.** The auth provider is already complete; only UI and routing are missing. *Medium. Unblocks every user-scoped feature.*

5. **Add a shared API client** (base URL, auth header injection, timeout, retry, typed error normalisation) and migrate all nine `fetch` call sites. *Medium. Prerequisite for every backend task that follows.*

6. **Design and implement the incident schema and CRUD endpoints** (DO SQLite or D1) with pagination and privacy-aware filtering; add JWT validation to the Worker. *Large. The keystone task — unblocks the shared feed, support, comments and moderation.*

7. **Implement the evidence pipeline end to end:** copy to durable storage → strip EXIF → encrypt bytes client-side → upload to R2 via signed URL → hash the real bytes → persist the `EvidenceManifest`. *Large. Delivers the product's core promise.*

8. **Wire the vault to the crypto module** so records are encrypted at rest and decrypted for display, and build the evidence gallery on top. *Medium. Makes "Private Vault" true.*

9. **Establish a test foundation** and cover the safety-critical pure functions first: `sealPayload`/`openPayload` round-trip and tamper rejection, `verifyAuditIntegrity` against a mutated chain, `obfuscateGps`/`redactLocationString`, and the feed privacy filter. *Medium. Makes the refactors in tasks 6–8 safe.*

10. **Decide and act on client consolidation** — archive [ios/](ios/) or formally resource it. *Decision, then cleanup. Every task above costs double until this is settled.*

---

*Document generated from static analysis of commit `f0043da` on `main`. No source code, configuration, dependencies, or git state was modified in producing it. Sections marked `INFERRED` require re-baselining against the official BlackNexa scope document.*
