import { describe, expect, test } from "bun:test";
import fs from "fs";
import path from "path";

/**
 * Fixed by agreement: development and preview EAS builds produce an installable
 * APK for testers, production produces an app bundle (.aab) for Google Play.
 * Changing any of these is a release decision, not a config tweak — this test
 * fails so the change is made on purpose.
 */
const EXPECTED_ANDROID_BUILD_TYPES = {
  development: "apk",
  preview: "apk",
  production: "app-bundle",
};

describe("eas.json Android build types", () => {
  const eas = JSON.parse(fs.readFileSync(path.join(import.meta.dir, "../eas.json"), "utf8"));

  for (const [profile, buildType] of Object.entries(EXPECTED_ANDROID_BUILD_TYPES)) {
    test(`${profile} builds ${buildType === "apk" ? "an APK" : "an AAB"}`, () => {
      expect(eas.build?.[profile]?.android?.buildType).toBe(buildType);
    });
  }
});
