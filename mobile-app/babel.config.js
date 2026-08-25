module.exports = function (api) {
  api.cache(true);
  return {
    presets: [["babel-preset-expo", { unstable_transformImportMeta: true }]],
    plugins: [
      // Reanimated 4 ships its worklet transform in react-native-worklets.
      // `react-native-keyboard-controller` compiles its keyboard handlers as
      // worklets, so without this the sticky footers and the keyboard-aware
      // scrolling silently do nothing. Must stay last in the plugin list.
      "react-native-worklets/plugin",
    ],
  };
};
