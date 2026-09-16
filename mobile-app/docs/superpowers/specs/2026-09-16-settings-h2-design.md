# H2 Settings Design

## Goal

Align the signed-in Settings root and its H-section child flows with `BlackNexa Screen Board-v7.html` while preserving the current authentication, session, API, navigation, and shared-component architecture.

## Scope

- Update H2 Settings root grouping, labels, direct controls, and logout confirmation.
- Reuse H6 Account for sign-in and device information.
- Split account deletion into the required H4 warning/choice step and H12 typed re-authentication/final deletion step.
- Reuse persisted profile defaults for H8 Privacy & sharing.
- Move the existing notifications preference onto H2 as the single direct toggle.
- Add the two required local appearance choices.
- Make Face ID default off and remove passcode UI from Settings.
- Keep H11 Your area backed only by real device location until a saved-area backend API exists.

## Navigation

```text
Settings (H2)
├── Account (H6)
│   ├── Change password (existing H7 route)
│   ├── Signed-in devices (existing route)
│   └── Delete account (H4)
│       └── Confirm deletion (H12)
├── Privacy & sharing (H8)
├── Your area (H11)
├── existing Help & About destinations
└── Sign out confirmation → existing AuthProvider.signOut
```

## Account and deletion

`/profile/account-info` remains the H6 Account entry point. It follows the board's compact rows: email, password, and connected sign-in under `SIGN IN`; live device rows under `DEVICES`; and one destructive Delete account row under `YOUR DATA`. The Settings-root footer deletion shortcut is removed so deletion has one intentional route.

The current combined delete screen is separated without changing the backend contract. H4 uses the board's `Step 1 of 2` header, `This is what happens` title, side-by-side `WHAT GOES` / `WHAT STAYS` consequence cards, and its bottom Continue / Keep-my-account actions. It includes the backend-required report-disposition choice as part of the consequence content and passes that selection to H12.

H12 uses the board's `Step 2 of 2` header, `Confirm it’s you` title, typed `DELETE` field, re-authentication field, acknowledgement checkbox, and a Today / final-deletion timeline. The board's 30-day restoration promise cannot be shown because the existing backend does not support pending deletion or account restoration. Copy instead explains the real immediate deletion behavior, including the existing delayed sealed-file purge when the selected disposition supports it. Only H12 invokes `authApi.deleteAccount`. On success, the existing receipt and `AuthProvider.forgetSession` behavior remain in place.

## Preferences and persistence

Notifications stay backed by `AuthProvider.updateProfile({ notificationsEnabled })`, which persists to the existing `/users/me` backend endpoint. Enabling requests the operating-system permission and registers an Expo push token exactly as the current Notifications child screen does. A denied permission restores the off state and presents a safe explanation. No nested Notifications route is reachable from H2.

Privacy & sharing reuses the existing profile-default fields already supported by the backend: default visibility, default location precision, and anonymous-by-default. The unsupported advocate-contact setting remains visibly unavailable; no API is invented.

Your area follows H11's header, search-field visual treatment, explanation, current-area row, and recent-area hierarchy where real data exists. It continues to read and refresh actual `LocationProvider` data. The backend has no saved-area, city/ZIP search, recent-area history, or geocoding contract, so those interactive capabilities are not fabricated. The source remains clearly marked for that future backend dependency.

## Appearance

`SettingsProvider` gains a persisted local appearance value limited to `signal-light` and `gold-dark`. H2 presents the board's selected-row treatment (colour preview tile, title, explanatory copy, and accent checkmark) for only:

- Light · signal blue
- Dark · warm gold

The selection and selected-state indicator update immediately on H2. It does not alter global application colors in this phase because the current token module exports a static `colors` object used throughout the app. A TODO documents that a future centralized theme provider must consume this persisted preference and apply tokens, system bars, and navigation colors globally. No other themes—including the board's Match the system row—are exposed per the approved scope.

## Protection

The persisted biometric setting defaults to `false`. H2 shows one `Unlock with Face ID` switch. When device biometrics are unavailable or unenrolled, it is disabled with an explanation. Enabling is local preference only; it uses the existing availability check and future unlock use remains behind the existing `unlockWithBiometrics` API. `Require a passcode` is removed from H2 and no new passcode storage is introduced.

## Help and logout

The H2 Help & About rows remain Help & FAQ, Contact support, evidence protection, Terms of Service, and Privacy Policy, each retaining its existing destination/action. Sign out remains a bottom destructive row, opens the existing confirmation modal, and calls only `AuthProvider.signOut` after confirmation. Cancel changes no session state.

## Error handling and verification

Field validation remains local and adjacent to deletion fields. API and general failures use the existing Snackbar or safe existing screen treatment. Async controls prevent duplicate submissions and restore interactivity after failure.

Tests cover settings defaults and persistence helpers, deletion-step validation and route payload handling, and appearance-option restrictions. Verification includes TypeScript, focused tests, Expo Doctor, an Expo web export, and manual navigation through H2 → H6 → H4 → H12, H8, H11, notifications, biometrics, appearance, and logout confirmation.
