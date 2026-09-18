/**
 * Keep Android deep links in the existing app task.
 *
 * OAuth redirects arrive as VIEW intents. If Android starts a second
 * MainActivity for that intent, Expo Router ends up with more than one root
 * navigation listener and React Navigation reports:
 *
 * "Looks like you have configured linking in multiple places."
 *
 * `android/` is regenerated, so this belongs in config rather than a manual
 * AndroidManifest.xml edit.
 */

const { AndroidConfig, withAndroidManifest } = require("@expo/config-plugins");

module.exports = function withAndroidSingleTaskMainActivity(config) {
  return withAndroidManifest(config, (cfg) => {
    const mainActivity = AndroidConfig.Manifest.getMainActivityOrThrow(
      cfg.modResults,
    );

    mainActivity.$["android:launchMode"] = "singleTask";

    return cfg;
  });
};
