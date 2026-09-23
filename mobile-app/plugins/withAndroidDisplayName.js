/**
 * Keep Android's launcher label separate from Expo's native project name.
 *
 * `config.name` must stay stable as "BlackNexa" so native iOS generation
 * creates BlackNexa.xcodeproj. Android uses the same config value for
 * `@string/app_name`, so this plugin writes the environment-specific display
 * label back into strings.xml.
 */

const { withStringsXml } = require("@expo/config-plugins");

function setStringResource(strings, name, value) {
  strings.resources.string ??= [];

  const existing = strings.resources.string.find((entry) => entry?.$?.name === name);

  if (existing) {
    existing._ = value;
    return;
  }

  strings.resources.string.push({
    _: value,
    $: { name },
  });
}

module.exports = function withAndroidDisplayName(config, { displayName } = {}) {
  return withStringsXml(config, (cfg) => {
    setStringResource(cfg.modResults, "app_name", displayName ?? config.name);

    return cfg;
  });
};
