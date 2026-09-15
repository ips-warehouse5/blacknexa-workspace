Written for: engineers picking this project up.

# BlackNexa Admin Console

The operator console for BlackNexa — a React + Vite application ported from the
approved prototype (`BlackNexa-Admin-Panel 10 (1).html`).

Two modules are live against the API: **authentication** and **Admin & Roles**.
Every other screen is built and navigable but reads prototype fixtures; each one
says so on screen while `VITE_USE_MOCK_DATA=true`.

---

## Running it

The console needs the API for sign-in, so start both.

```bash
# 1. API — in ../blacknexa-backend
npm run db:sync          # create tables
npm run db:seed:admin    # one operator account per role (development only)
npm run dev              # http://localhost:4000

# 2. Console — here
npm install
npm run dev              # http://localhost:5174
```

### Signing in

`db:seed:admin` creates four accounts, one per role, all with the password
**`BlackNexa2026!`**:

| Email                       | Role          |
| --------------------------- | ------------- |
| `superadmin@blacknexa.com`  | Super Admin   |
| `moderator@blacknexa.com`   | Moderator     |
| `advocate@blacknexa.com`    | Advocate      |
| `staff@blacknexa.com`       | Support Staff |

Sign-in is two steps: password, then a six-digit code. Without SMTP configured
the code is written to the API log, and outside production the API also returns
it — the login screen shows it in a "Development code" banner, so the flow is
walkable with no mail provider.

### Scripts

| Command             | Does                                                  |
| ------------------- | ----------------------------------------------------- |
| `npm run dev`       | Dev server with the API proxied at `/api`             |
| `npm run build`     | Type-check, then production build                     |
| `npm run typecheck` | Types only                                            |
| `npm run lint`      | oxlint                                                |
| `npm run smoke`     | Browser smoke test — see below                        |

---

## Architecture

```
src/
├── app/            App root, providers, router and route guards
├── components/
│   ├── layout/     Sidebar and the signed-in shell
│   ├── rbac/       <Can> and the permission hooks
│   └── ui/         Shared primitives (Select, Modal, DataTable, …)
├── config/         env, navigation
├── features/       One folder per module — screens, API client, hooks, types
├── hooks/          Cross-cutting hooks
├── lib/            HTTP client, query client, the RBAC matrix, token storage
├── mocks/          Prototype fixtures, typed
├── stores/         Zustand — currently just the session
├── styles/         Design tokens + the ported design system
└── types/          Shared types
```

Features are vertical slices: `features/admin-roles` holds its screens, its API
client, its query hooks and its types. Anything two features need moves to
`components/`, `hooks/` or `lib/` — not into a neighbouring feature.

### Styling

The prototype's CSS was carried over rather than rewritten. It is 3,600 lines
driven entirely by custom properties (`--accent`, `--surface`, `--line`) and a
`body.dark` class, which is already the right shape for theming — porting it to
a utility framework would have risked fidelity against an approved design for no
real gain.

`styles/design/` holds it, split into 21 files **in the original source order**.
That order is load-bearing: later files intentionally flatten surfaces and
restate the type scale, so `styles/index.css` imports them in the same sequence
they appeared in the prototype. The split was verified lossless — concatenating
the files reproduces the original stylesheet byte for byte.

Two files sit outside that:

- `styles/tokens.css` — hand-written. Defines both accents in both modes.
- `styles/app.css` — corrections the port needs, kept separate so the line
  between "approved design" and "made it work in React" stays visible. Mostly
  two things: shells the prototype hid by default (it kept every screen in one
  document and toggled `display`), and button/anchor resets for navigation that
  used to be `<div>`s.

### Theming

Two accents — Signal Blue and Warm Gold — each in light and dark. `ThemeProvider`
writes `data-accent` and `data-mode` onto `<html>` plus `dark` on `<body>`; every
component reads the tokens, so a theme change is two attribute writes.

Gold in dark mode uses near-black button text rather than white. White on
`#d8b64b` is about 1.9:1, which fails contrast badly; the prototype already used
this treatment for its light `mono` accent.

### RBAC

Four fixed roles: `superadmin`, `moderator`, `advocate`, `staff`. The matrix
lives in `lib/rbac.ts` and mirrors `config/rbac.config.ts` on the server.

**The client copy is not security.** It decides what to render so an operator
never lands on a screen that will only show them errors. The server checks every
request through `requirePermission`, and that check is the one that matters. The
two files are small, static and deliberately parallel so that changing one is an
obvious prompt to change the other.

Two ways to handle an action a role cannot take, and they suit different cases:

- `<Can perform="…">` renders nothing — right when the control would be
  meaningless, like a bulk-action bar for a read-only role.
- `deniedReason` on `Button` renders it disabled with an explanation — right
  when the action visibly exists for other operators, so hiding it would read as
  a missing feature rather than a closed door.

Whole sections are removed from the sidebar; individual actions are explained.

### Session handling

`stores/auth.store.ts` owns the session. Tokens live in `lib/token-storage.ts`:
the access token stays in memory, only the refresh token is persisted, and
"Remember this device" picks between `localStorage` and `sessionStorage`.

Web Storage means any script on this origin can read the refresh token. That is
a real and known weakness; the alternative — httpOnly cookies — needs the API to
set them and brings CSRF defences of its own. The trade is made knowingly, and
`token-storage.ts` is the only file that would need to change.

Refreshing **rotates** the token server-side, so two concurrent refreshes mean
the second is rejected as a replay. Both places that can refresh guard against
that by sharing one in-flight promise: the 401 interceptor in `lib/http.ts`, and
`restore()` in the auth store. The latter matters because StrictMode
double-invokes the mount effect — without the guard, every reload signed the
operator out.

---

## The smoke test

`npm run smoke` drives a real Chrome against the running stack: it signs in
through the form, walks all 22 routes checking each one actually paints, watches
for console errors and failed requests, resolves both accents in both modes, and
confirms a Support Staff session is kept out of Admin & Roles. Screenshots land
in `smoke-shots/`.

It needs both servers up and a Chrome binary; set `CHROME_PATH` if the default
is wrong.

It is worth having rather than trusting the type-checker. Two defects that both
compiled cleanly and read fine in review only surfaced here:

- the session being discarded on every page reload (the StrictMode refresh race
  above), and
- every detail screen rendering to a blank column, because `.details-page`
  defaults to `display: none` in the ported CSS and only two of the four page
  shells had an override.

The second one is why the test measures painted area rather than asking whether
an element exists — a `display: none` ancestor satisfies a DOM query perfectly.

---

## Wiring up the remaining modules

Each fixture-backed screen already has the shape a real one needs. To connect
one, follow `features/admin-roles`:

1. Add `<feature>.api.ts` — endpoints, returning domain types.
2. Add `<feature>.hooks.ts` — React Query bindings; invalidate every cache a
   write can affect, not just the list.
3. Swap the fixture import for the hook. The components should not change —
   `mocks/types.ts` describes the domain shape, not the fixture's shape.
4. Delete the screen's `<FixtureNotice />`.

`VITE_USE_MOCK_DATA=false` turns every notice off at once when the last one is
done.

## Configuration

See `.env.example`. `VITE_API_BASE_URL` is left as the relative `/api/v1` so the
dev proxy in `vite.config.ts` can serve it same-origin, which keeps CORS out of
the local loop entirely.
