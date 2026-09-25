import type { ExpoConfig } from "expo/config";

// Single source of truth for the human-facing semantic version shown in
// native iOS builds and store listings. eas.json uses
// `cli.appVersionSource: "local"`, so EAS Build reads these values from
// this file when it generates the native Xcode project.
const APP_VERSION = "1.0.0";
const ANDROID_VERSION_CODE = 2;
const IOS_BUILD_NUMBER = "5";
type AppVariant = "development" | "preview" | "production";

function readAppVariant(): AppVariant {
  const raw =
    process.env.EXPO_PUBLIC_APP_VARIANT ??
    process.env.EAS_BUILD_PROFILE ??
    process.env.EXPO_PUBLIC_APP_ENV;

  if (raw === "development" || raw === "preview" || raw === "production")
    return raw;
  return process.env.NODE_ENV === "production" ? "production" : "development";
}

const APP_VARIANT = readAppVariant();
const IS_PRODUCTION = APP_VARIANT === "production";
const NATIVE_APP_NAME = "BlackNexa";
const DISPLAY_NAME = "BlackNexa";
const URL_SCHEME = IS_PRODUCTION
  ? "blacknexa"
  : APP_VARIANT === "preview"
    ? "blacknexa-preview"
    : "blacknexa-dev";

// Converted from app.json so the Google Maps keys can be read from the
// environment instead of being hardcoded per-platform literals. Everything
// else here is unchanged, static config carried over verbatim.
const config: ExpoConfig = {
  // Keep this stable so generated native projects are named BlackNexa.
  // Environment-specific launcher labels are set by platform config plugins
  // below. Keeping them out of `ios.infoPlist` avoids Expo's "name is ignored"
  // warning while preserving the stable native project name.
  name: NATIVE_APP_NAME,
  slug: "blacknexa",
  // The EAS account that owns this project. Without it the CLI defaults to
  // the logged-in personal account (mitdips) and every command fails the
  // slug/projectId check.
  owner: "newsmovesmarketsforex-llc",
  version: APP_VERSION,
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  // Single string on purpose. This was briefly an array to register Google's
  // OAuth redirect scheme, but `expo-linking` warns on every launch when it
  // finds more than one and silently picks the first — so the app's own
  // deep-link scheme lives here alone, and the OAuth redirect is registered
  // per-platform instead: `android.intentFilters` below, and nothing on iOS
  // because Expo already registers the bundle identifier as a scheme
  // automatically.
  scheme: URL_SCHEME,
  userInterfaceStyle: "light",
  newArchEnabled: true,
  // Legacy key, kept deliberately: it is the only splash Expo Go reads,
  // since Expo Go ignores config plugins. The native splash for
  // dev/production builds comes from the `expo-splash-screen` plugin below,
  // which is what actually registers the screen the module can hide. Keep
  // both in step.
  splash: {
    image: "./assets/images/splash-icon.png",
    resizeMode: "contain",
    backgroundColor: "#FFFFFF",
  },
  ios: {
    supportsTablet: true,
    requireFullScreen: true,
    bundleIdentifier: "com.blacknexa.app",
    buildNumber: IOS_BUILD_NUMBER,
    // firebase/*.plist is gitignored, so EAS Build (which only sees
    // git-tracked files) can't find it. GOOGLE_SERVICE_INFO_PLIST is an
    // EAS file-type env var that resolves to a local path at build time;
    // local builds fall back to the file on disk.
    googleServicesFile:
      process.env.GOOGLE_SERVICE_INFO_PLIST ??
      "./firebase/GoogleService-Info.plist",
    // Declared here because `ios/` is gitignored and regenerated: without
    // it, `expo prebuild --clean` produces a project with an empty
    // DEVELOPMENT_TEAM and the next device build fails to sign until
    // someone re-picks the team in Xcode by hand. `usesAppleSignIn` below is
    // what puts `com.apple.developer.applesignin` in the entitlements, and
    // automatic signing is what registers that capability on the App ID.
    appleTeamId: "M3V2DKWAH3",
    usesAppleSignIn: true,
    config: {
      googleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY,
    },
    infoPlist: {
      LSApplicationCategoryType: "public.app-category.social-networking",
      UIViewControllerBasedStatusBarAppearance: false,
      NSMicrophoneUsageDescription:
        "BlackNexa records audio you attach to a report. Recordings are stored as files with the report and are never transcribed.",
      NSCameraUsageDescription:
        "BlackNexa uses the camera so you can photograph or film evidence for a report.",
      NSPhotoLibraryUsageDescription:
        "BlackNexa attaches photos and video from your library to a report as evidence.",
      NSLocationWhenInUseUsageDescription:
        "BlackNexa records where an incident happened, at the precision you choose, and surfaces local news and nearby help.",
      NSFaceIDUsageDescription:
        "BlackNexa uses Face ID to unlock your session and your evidence vault.",
      ITSAppUsesNonExemptEncryption: false,
      UIRequiresFullScreen: true,
      // iPhone orientations come from the top-level `orientation: "portrait"`,
      // which Expo writes as Portrait + PortraitUpsideDown. Setting
      // `UISupportedInterfaceOrientations` here as well makes Expo ignore that
      // property and warn on every build. It has no iPad equivalent, so the
      // `~ipad` key stays explicit.
      "UISupportedInterfaceOrientations~ipad": [
        "UIInterfaceOrientationPortrait",
        "UIInterfaceOrientationPortraitUpsideDown",
      ],
    },
  },
  android: {
    adaptiveIcon: {
      foregroundImage: "./assets/images/adaptive-icon.png",
      backgroundColor: "#FFFFFF",
    },
    package: "com.blacknexa.app",
    versionCode: ANDROID_VERSION_CODE,
    // firebase/*.json is gitignored, so EAS Build (which only sees
    // git-tracked files) can't find it. GOOGLE_SERVICES_JSON is an EAS
    // file-type env var that resolves to a local path at build time;
    // local builds fall back to the file on disk.
    googleServicesFile:
      process.env.GOOGLE_SERVICES_JSON ?? "./firebase/google-services.json",
    config: {
      googleMaps: {
        apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY,
      },
    },
    permissions: [
      "android.permission.RECORD_AUDIO",
      "android.permission.MODIFY_AUDIO_SETTINGS",
      "android.permission.ACCESS_COARSE_LOCATION",
      "android.permission.ACCESS_FINE_LOCATION",
      "android.permission.USE_BIOMETRIC",
      "android.permission.USE_FINGERPRINT",
    ],
    // Google's OAuth redirect. `expo-auth-session` sends an Android OAuth
    // client to `<applicationId>:/oauthredirect`, and unlike iOS — where
    // Expo registers the bundle identifier as a URL scheme automatically —
    // Android gets no such filter for free. Without this the consent screen
    // succeeds and the redirect lands nowhere, which fails silently in the
    // browser with nothing for the app to report. Verified absent from the
    // generated manifest before this was added.
    intentFilters: [
      {
        action: "VIEW",
        category: ["DEFAULT", "BROWSABLE"],
        data: [{ scheme: "com.blacknexa.app" }],
      },
    ],
  },
  web: {
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    "expo-router",
    "expo-font",
    "expo-web-browser",
    "expo-secure-store",
    "expo-apple-authentication",
    "expo-local-authentication",
    [
      "expo-build-properties",
      {
        // Only affects the "release" build variant (build.gradle only reads
        // these two properties inside its `release { ... }` block) — debug
        // builds are untouched, so this doesn't slow down local dev/testing.
        // Cut the release APK from ~128MB to ~45MB in testing. Architecture
        // is deliberately NOT restricted here — an AAB (bundleRelease, what
        // EAS production and Play Store both use) needs every ABI included
        // so Play Store can deliver the right one per device; only a
        // directly-shared testing APK should use
        // `-PreactNativeArchitectures=arm64-v8a` as a one-off build flag.
        android: {
          enableMinifyInReleaseBuilds: true,
          enableShrinkResourcesInReleaseBuilds: true,
        },
        ios: {
          deploymentTarget: "17.0",
        },
      },
    ],
    [
      "expo-splash-screen",
      {
        image: "./assets/images/splash-icon.png",
        resizeMode: "contain",
        backgroundColor: "#FFFFFF",
        imageWidth: 200,
      },
    ],
    [
      "expo-location",
      {
        // The two `false` values DELETE Info.plist keys rather than set
        // them. This plugin injects all three location strings by default,
        // so without them the build shipped `NSLocationAlwaysUsageDescription`
        // carrying the plugin's stock text — 'Allow BlackNexa to access your
        // location' — plus an AlwaysAndWhenInUse key. The app only ever
        // calls `requestForegroundPermissionsAsync` (A4 priming, C4
        // where-it-happened, LocationProvider): no background task, no
        // geofencing, no UIBackgroundModes, and Android correspondingly has
        // no ACCESS_BACKGROUND_LOCATION. Declaring Always invites an App
        // Store rejection asking why it is needed, and requests more than
        // the app uses — the opposite of what its own privacy copy
        // promises. Re-add only alongside a real background implementation.
        locationWhenInUsePermission:
          "BlackNexa records where an incident happened, at the precision you choose, and surfaces local news and nearby help.",
        locationAlwaysPermission: false,
        locationAlwaysAndWhenInUsePermission: false,
      },
    ],
    "expo-audio",
    "expo-asset",
    ["./plugins/withAndroidDisplayName", { displayName: DISPLAY_NAME }],
    [
      "./plugins/withIosDisplayName",
      { displayName: DISPLAY_NAME, bundleName: NATIVE_APP_NAME },
    ],
    ["./plugins/withIosXcodeIdentity", { displayName: DISPLAY_NAME }],
    "./plugins/withIosEnvSchemes",
    "./plugins/withIosSceneLifecycle",
    "./plugins/withIosPodsBuildFixes",
    "./plugins/withIosUserScriptSandboxingDisabled",
    "./plugins/withIPhoneOnlyDestinations",
    "./plugins/withAndroidMailtoQuery",
    "./plugins/withAndroidSingleTaskMainActivity",
    "./plugins/withAndroidReleaseSigning",
    "./plugins/withAndroidApkNaming",
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    appVariant: APP_VARIANT,
    eas: {
      projectId: "e4f7a30d-28d3-4317-95e9-b05ac9a3f254",
    },
  },
};

export default config;
