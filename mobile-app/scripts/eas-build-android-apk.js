#!/usr/bin/env node
/* global __dirname -- a Node script, run outside the app bundle */
/**
 * EAS cloud APK build, saved under the BlackNexa file name:
 *
 *   npm run eas:apk:<develop|preview>
 *   (or: node scripts/eas-build-android-apk.js <develop|preview>)
 *
 * EAS serves every build from expo.dev under its own name
 * (…/artifacts/eas/<id>.apk) and has no setting to change it. So this runs the
 * normal `eas build` for the matching eas.json profile, waits for it, and
 * downloads the APK to builds/ as
 *
 *   BlackNexa_{environment}_{buildType}_v{version}_{DDMMYYYY}.apk
 *
 * using the same naming rule as local builds (scripts/android-apk-name.js).
 * Production is not offered: its EAS profile builds an .aab for Google Play,
 * which stays exactly as EAS produces it.
 */

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { apkFileName, environmentName, readAppConfig } = require("./android-apk-name");

/** File-name environment → eas.json profile, and the build type that profile produces. */
const PROFILES = {
  develop: { profile: "development", buildType: "debug" }, // development client
  preview: { profile: "preview", buildType: "release" },
};

const projectRoot = path.resolve(__dirname, "..");
const environment = process.argv[2];
const target = PROFILES[environment];
if (!target) {
  console.error("Usage: node scripts/eas-build-android-apk.js <develop|preview>");
  process.exit(1);
}

// Resolve the name the way the build itself will see the config: with the
// profile's environment variables applied.
const easJson = JSON.parse(fs.readFileSync(path.join(projectRoot, "eas.json"), "utf8"));
const profile = easJson.build?.[target.profile];
if (profile?.android?.buildType !== "apk") {
  console.error(`eas.json profile "${target.profile}" does not build an APK.`);
  process.exit(1);
}
Object.assign(process.env, profile.env ?? {});
const { version, appVariant } = readAppConfig(projectRoot);
if (environmentName(appVariant) !== environment) {
  console.error(`Profile "${target.profile}" resolves to "${appVariant}", expected ${environment}.`);
  process.exit(1);
}

console.log(`> eas build --profile ${target.profile} --platform android (waiting for EAS…)`);
const build = spawnSync(
  "eas",
  ["build", "--profile", target.profile, "--platform", "android", "--non-interactive", "--json"],
  { cwd: projectRoot, env: process.env, stdio: ["inherit", "pipe", "inherit"], encoding: "utf8", shell: process.platform === "win32" },
);
if (build.status !== 0) process.exit(build.status ?? 1);

const [result] = JSON.parse(build.stdout);
const url = result?.artifacts?.buildUrl ?? result?.artifacts?.applicationArchiveUrl;
if (result?.status !== "FINISHED" || !url) {
  console.error(`EAS build ${result?.id ?? ""} did not finish with an APK (status ${result?.status}).`);
  process.exit(1);
}

// Named on arrival: the date is when the build finished, the version the one it was built with.
const fileName = apkFileName({
  environment,
  buildType: target.buildType,
  version: result.appVersion ?? version,
  date: new Date(),
});
const outDir = path.join(projectRoot, "builds");
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, fileName);

console.log(`> downloading ${url}`);
const download = spawnSync("curl", ["-fL", "--progress-bar", "-o", outPath, url], { stdio: "inherit" });
if (download.status !== 0) process.exit(download.status ?? 1);

console.log(`\nAPK: ${outPath}\nEAS build: https://expo.dev/accounts/${result.project?.ownerAccount?.name ?? "-"}/projects/${result.project?.slug ?? "-"}/builds/${result.id}`);
