#!/usr/bin/env node
/* global __dirname -- a Node script, run outside the app bundle */
/**
 * Android APK file names:
 *
 *   BlackNexa_{environment}_{buildType}_v{version}_{DDMMYYYY}.apk
 *   e.g. BlackNexa_preview_release_v1.0.2_26092026.apk
 *
 * Run by android/app/build.gradle while Gradle configures a build (the hook is
 * added by plugins/withAndroidApkNaming.js). It evaluates app.config.ts with
 * Expo's own config loader rather than reading anything prebuild wrote into
 * build.gradle, so:
 *
 *   - the version is always the current `version` in app.config.ts, even if
 *     it was bumped after the last `expo prebuild`;
 *   - the environment is the one this build is compiled for, from the same
 *     EXPO_PUBLIC_APP_VARIANT that app.config.ts and the JS bundle read (set by
 *     the eas.json profile, or by scripts/build-android-apk.js locally).
 *
 * Prints one line of JSON with the name for each build type:
 *   {"debug":"BlackNexa_…_debug_….apk","release":"BlackNexa_…_release_….apk"}
 */

const path = require("path");

/** app.config.ts's variant → the environment word used in file names. */
const ENVIRONMENT_NAMES = {
  development: "develop",
  preview: "preview",
  production: "production",
};

function environmentName(appVariant) {
  const name = ENVIRONMENT_NAMES[appVariant];
  if (!name) {
    throw new Error(
      `Unknown app variant "${appVariant}" (expected ${Object.keys(ENVIRONMENT_NAMES).join(", ")}).`,
    );
  }
  return name;
}

/** DDMMYYYY in the build machine's local time. */
function formatBuildDate(date) {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${dd}${mm}${date.getFullYear()}`;
}

function apkFileName({ environment, buildType, version, date }) {
  return `BlackNexa_${environment}_${buildType}_v${version}_${formatBuildDate(date)}.apk`;
}

/** `version` and the resolved app variant, straight from app.config.ts. */
function readAppConfig(projectRoot) {
  const expoPackage = require.resolve("expo/package.json", { paths: [projectRoot] });
  const { getConfig } = require(require.resolve("@expo/config", { paths: [expoPackage] }));
  const { exp } = getConfig(projectRoot, { skipSDKVersionRequirement: true });
  return { version: exp.version, appVariant: exp.extra && exp.extra.appVariant };
}

if (require.main === module) {
  const projectRoot = path.resolve(__dirname, "..");
  const { version, appVariant } = readAppConfig(projectRoot);
  if (!version) throw new Error("app.config.ts has no `version`.");
  const environment = environmentName(appVariant);
  const date = new Date();
  // Gradle reads the last line of output, so config-loader warnings above it are harmless.
  process.stdout.write(
    `\n${JSON.stringify({
      debug: apkFileName({ environment, buildType: "debug", version, date }),
      release: apkFileName({ environment, buildType: "release", version, date }),
    })}\n`,
  );
}

module.exports = { environmentName, formatBuildDate, apkFileName, readAppConfig };
