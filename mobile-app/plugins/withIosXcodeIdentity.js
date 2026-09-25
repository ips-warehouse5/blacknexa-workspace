/**
 * Make Xcode's General › Identity panel match app.config.ts after every prebuild.
 *
 * That panel reads build settings, not Info.plist: Version is
 * `MARKETING_VERSION`, Build is `CURRENT_PROJECT_VERSION`, Display Name and App
 * Category are `INFOPLIST_KEY_CFBundleDisplayName` and
 * `INFOPLIST_KEY_LSApplicationCategoryType`. `expo prebuild` writes the real
 * values into Info.plist only and leaves those settings at the template's
 * `1.0` / `1` / empty, so the panel shows the wrong identity and gets corrected
 * by hand after each prebuild.
 *
 * Worse, Expo writes the version and build number into Info.plist as literals,
 * which win over the build settings at build time. A Build edited in Xcode was
 * therefore never the build number that shipped. Info.plist is pointed at the
 * build settings instead, so what the panel shows is what the archive carries.
 *
 * This has to be a config plugin: `ios/` is gitignored and regenerated, so
 * anything set through the Xcode UI is discarded by the next
 * `expo prebuild --clean`. Change the version or build number in
 * app.config.ts, never in Xcode.
 *
 * Scoped to build configurations carrying `PRODUCT_BUNDLE_IDENTIFIER` — the app
 * target — as in withIPhoneOnlyDestinations.
 */

const { withInfoPlist, withXcodeProject } = require("@expo/config-plugins");

/** pbxproj values need quotes once they hold anything beyond a bare word. */
function pbxValue(value) {
  const text = String(value);
  return /^[A-Za-z0-9_./]+$/.test(text) ? text : `"${text.replace(/"/g, '\\"')}"`;
}

module.exports = function withIosXcodeIdentity(config, { displayName } = {}) {
  const settings = {
    MARKETING_VERSION: config.version,
    CURRENT_PROJECT_VERSION: config.ios?.buildNumber,
    INFOPLIST_KEY_CFBundleDisplayName: displayName ?? config.name,
    INFOPLIST_KEY_LSApplicationCategoryType: config.ios?.infoPlist?.LSApplicationCategoryType,
  };

  config = withXcodeProject(config, (cfg) => {
    const configurations = cfg.modResults.pbxXCBuildConfigurationSection();

    for (const key of Object.keys(configurations)) {
      const buildSettings = configurations[key]?.buildSettings;
      // String values appear in this section too (comment entries); guard on shape.
      if (!buildSettings || typeof buildSettings !== "object") continue;
      if (!buildSettings.PRODUCT_BUNDLE_IDENTIFIER) continue;

      for (const [name, value] of Object.entries(settings)) {
        if (value !== undefined && value !== null && value !== "") {
          buildSettings[name] = pbxValue(value);
        }
      }
    }

    return cfg;
  });

  return withInfoPlist(config, (cfg) => {
    cfg.modResults.CFBundleShortVersionString = "$(MARKETING_VERSION)";
    cfg.modResults.CFBundleVersion = "$(CURRENT_PROJECT_VERSION)";
    return cfg;
  });
};
