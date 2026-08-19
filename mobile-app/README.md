# Welcome to your Expo App

## Project info

This is a native cross-platform mobile app built with **Expo** and **React Native**.

- **Platform**: Native iOS & Android app
- **Framework**: Expo Router + React Native

---

## Getting Started

### Prerequisites

Make sure you have Node.js and Bun (or npm/yarn/pnpm) installed:
- [Install Node.js (via nvm)](https://github.com/nvm-sh/nvm)
- [Install Bun](https://bun.sh/docs/installation)

### Installation

```bash
# Step 1: Clone the repository
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory
cd <YOUR_PROJECT_NAME>

# Step 3: Install dependencies
bun install
```

---

## Development

Start the development server using Expo CLI:

```bash
# Start the Expo development server
bunx expo start
# or
npx expo start
```

### Running on Targets

- **iOS Simulator**: Press `i` in the terminal or run `npx expo start --ios`
- **Android Emulator**: Press `a` in the terminal or run `npx expo start --android`
- **Web Browser**: Press `w` in the terminal or run `npx expo start --web`
- **Physical Device (Expo Go)**:
  1. Download **Expo Go** from [App Store (iOS)](https://apps.apple.com/app/expo-go/id982107779) or [Google Play (Android)](https://play.google.com/store/apps/details?id=host.exp.exponent).
  2. Scan the QR code displayed in the terminal with your camera (iOS) or the Expo Go app (Android).

---

## Tech Stack

This project is built with:

- **[React Native](https://reactnative.dev/)** - Cross-platform native mobile app framework
- **[Expo](https://expo.dev/)** - Toolchain and runtime for universal React Native applications
- **[Expo Router](https://docs.expo.dev/router/introduction/)** - File-based routing for React Native and Web
- **[TypeScript](https://www.typescriptlang.org/)** - Type-safe JavaScript
- **[TanStack Query (React Query)](https://tanstack.com/query/latest)** - Asynchronous server state management
- **[Lucide Icons](https://lucide.dev/)** - Clean and consistent icon set (`lucide-react-native`)
- **[Zustand](https://github.com/pmndrs/zustand)** - Lightweight client-side state management

---

## Project Structure

```
├── app/                    # App screens & navigation (Expo Router)
│   ├── (tabs)/            # Tab navigation screens
│   │   ├── _layout.tsx    # Tab layout configuration
│   │   └── index.tsx      # Home tab screen
│   ├── _layout.tsx        # Root layout & providers
│   ├── modal.tsx          # Modal screen
│   └── +not-found.tsx     # 404 screen
├── assets/                # Static assets (images, fonts, etc.)
│   └── images/            # App icons and images
├── constants/             # App constants, themes, and configuration
├── app.json               # Expo configuration & app manifest
├── package.json           # Dependencies and scripts
└── tsconfig.json          # TypeScript configuration
```

---

## Building and Deployment (EAS)

Deployments and production builds are handled via [Expo Application Services (EAS)](https://expo.dev/eas).

### 1. Install EAS CLI

```bash
bun add -g eas-cli
# or
npm install -g eas-cli
```

### 2. Configure EAS

```bash
eas build:configure
```

### 3. Build & Submit

#### iOS (Apple App Store)
```bash
# Build for iOS
eas build --platform ios

# Submit to App Store
eas submit --platform ios
```
For more details, see [Expo's iOS Deployment Guide](https://docs.expo.dev/submit/ios/).

#### Android (Google Play Store)
```bash
# Build for Android
eas build --platform android

# Submit to Google Play
eas submit --platform android
```
For more details, see [Expo's Android Deployment Guide](https://docs.expo.dev/submit/android/).

#### Web Deployment
```bash
# Build static web bundle
bunx expo export --platform web
```
You can deploy the resulting `dist` folder to platforms like Vercel, Netlify, Cloudflare Pages, or EAS Hosting.

---

## Custom Development Builds

When using custom native libraries, native credentials, or features not supported in Expo Go (e.g., Apple Sign In, custom push notifications, In-App Purchases), use EAS Development Builds:

```bash
# Build a custom dev client
eas build --profile development --platform ios
eas build --profile development --platform android

# Run the dev client
bunx expo start --dev-client
```

Learn more at [Expo Development Builds Guide](https://docs.expo.dev/develop/development-builds/introduction/).

---

## Troubleshooting

- **Clear Metro cache**:
  ```bash
  bunx expo start --clear
  ```
- **Reinstall dependencies**:
  ```bash
  rm -rf node_modules
  bun install
  ```
- **Connection issues with physical devices**:
  Ensure both the computer and mobile device are on the same Wi-Fi network, or run with tunnel mode:
  ```bash
  bunx expo start --tunnel
  ```
- Refer to the official [Expo Documentation](https://docs.expo.dev/) for more troubleshooting tips.
