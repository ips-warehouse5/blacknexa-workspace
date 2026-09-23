/**
 * Keep iOS launcher label separate from Expo's abstract project name.
 *
 * Putting `CFBundleDisplayName` directly in `ios.infoPlist` makes Expo warn that
 * it is ignoring `name`. This plugin writes the same value during native
 * generation, after config validation, so `name` can stay the stable native
 * project name while the installed app label can vary by environment.
 */

const { withInfoPlist } = require("@expo/config-plugins");

module.exports = function withIosDisplayName(config, { displayName, bundleName } = {}) {
  return withInfoPlist(config, (cfg) => {
    cfg.modResults.CFBundleDisplayName = displayName ?? config.name;
    cfg.modResults.CFBundleName = bundleName ?? config.name;

    return cfg;
  });
};
