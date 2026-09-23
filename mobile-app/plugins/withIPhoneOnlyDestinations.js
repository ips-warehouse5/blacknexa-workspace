/**
 * Restrict the iOS target's Supported Destinations to iPhone and iPad.
 *
 * `ios.supportsTablet: true` in app.config.ts sets `TARGETED_DEVICE_FAMILY = 1,2`,
 * which enables iPhone and iPad. It does **not** remove the two "Designed for
 * iPhone/iPad" destinations, because those are governed by separate build settings
 * that Xcode treats as YES when they are absent — and `expo prebuild` does not
 * write them. Left alone, the app can also show Mac and Apple Vision destinations.
 *
 * This has to be a config plugin rather than a change in Xcode: `ios/` is
 * gitignored and regenerated, so anything set through the Xcode UI is discarded by
 * the next `expo prebuild --clean`.
 *
 * Scoped to build configurations carrying `PRODUCT_BUNDLE_IDENTIFIER` — that is the
 * app target. The project-level configuration has no bundle id and does not drive
 * the destination list.
 */

const { withXcodeProject } = require("@expo/config-plugins");

/** Absent means YES to Xcode, so each of these must be written explicitly. */
const DESTINATION_SETTINGS = {
  SUPPORTS_MACCATALYST: "NO",
  SUPPORTS_MAC_DESIGNED_FOR_IPHONE_IPAD: "NO",
  SUPPORTS_XR_DESIGNED_FOR_IPHONE_IPAD: "NO",
};

module.exports = function withIPhoneOnlyDestinations(config) {
  return withXcodeProject(config, (cfg) => {
    const configurations = cfg.modResults.pbxXCBuildConfigurationSection();

    for (const key of Object.keys(configurations)) {
      const buildSettings = configurations[key]?.buildSettings;
      // String values appear in this section too (comment entries); guard on shape.
      if (!buildSettings || typeof buildSettings !== "object") continue;
      if (!buildSettings.PRODUCT_BUNDLE_IDENTIFIER) continue;

      Object.assign(buildSettings, DESTINATION_SETTINGS);
    }

    return cfg;
  });
};
