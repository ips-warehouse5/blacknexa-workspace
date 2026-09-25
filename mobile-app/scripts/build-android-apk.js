#!/usr/bin/env node
/* global __dirname -- a Node script, run outside the app bundle */
/**
 * Build an Android APK locally for one environment:
 *
 *   npm run apk:<develop|preview|production>:<debug|release>
 *   (or: node scripts/build-android-apk.js <environment> <buildType>)
 *
 * The environment decides more than the file name — the URL scheme, launcher
 * name and the API the JS bundle talks to are all set from
 * EXPO_PUBLIC_APP_VARIANT, partly at prebuild and partly when Gradle bundles
 * the JS. So both steps run with the environment variables of the matching
 * eas.json profile, which keeps a local APK configured exactly like the EAS
 * build of that environment:
 *
 *   1. expo prebuild --platform android   (native project for this environment)
 *   2. gradlew assembleDebug|assembleRelease
 *
 * The APK is named by the Gradle hook from plugins/withAndroidApkNaming.js; this
 * script only prints where it ended up.
 */

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

/** File-name environment → eas.json build profile. */
const PROFILES = { develop: "development", preview: "preview", production: "production" };
const BUILD_TYPES = ["debug", "release"];

const projectRoot = path.resolve(__dirname, "..");
const [environment, buildType] = process.argv.slice(2);

if (!PROFILES[environment] || !BUILD_TYPES.includes(buildType)) {
  console.error(
    "Usage: node scripts/build-android-apk.js <develop|preview|production> <debug|release>",
  );
  process.exit(1);
}

const easJson = JSON.parse(fs.readFileSync(path.join(projectRoot, "eas.json"), "utf8"));
const profileEnv = easJson.build?.[PROFILES[environment]]?.env ?? {};
const env = { ...process.env, ...profileEnv };

function run(command, args, cwd) {
  console.log(`\n> ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, { cwd, env, stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run("npx", ["expo", "prebuild", "--platform", "android", "--no-install"], projectRoot);

const androidDir = path.join(projectRoot, "android");
const gradlew = process.platform === "win32" ? "gradlew.bat" : "./gradlew";
const task = buildType === "debug" ? "assembleDebug" : "assembleRelease";
run(gradlew, [task], androidDir);

// Gradle records the file it wrote; read it rather than guessing the name.
const outputDir = path.join(androidDir, "app/build/outputs/apk", buildType);
const metadata = JSON.parse(fs.readFileSync(path.join(outputDir, "output-metadata.json"), "utf8"));
const apk = metadata.elements?.[0]?.outputFile;
console.log(`\nAPK: ${path.join(outputDir, apk)}`);
