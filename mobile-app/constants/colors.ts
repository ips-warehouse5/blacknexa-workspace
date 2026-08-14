const palette = {
  bg: "#0E0F12",
  surface: "#16181D",
  surface2: "#1E2128",
  surface3: "#262A32",
  border: "#2D3138",
  text: "#F5F2EA",
  textDim: "#9BA0AA",
  textMute: "#6B7078",
  gold: "#E8B15C",
  goldDeep: "#B8863F",
  emerald: "#4FB286",
  crimson: "#E06666",
  violet: "#9E8BD1",
  sky: "#6FA8DC",
};

export default {
  light: {
    text: palette.text,
    background: palette.bg,
    tint: palette.gold,
    tabIconDefault: palette.textMute,
    tabIconSelected: palette.gold,
  },
  ...palette,
};
