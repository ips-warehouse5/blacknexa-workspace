import { Platform, TextStyle } from "react-native";
import Colors from "@/constants/colors";

export const colors = {
  ...Colors,
  primary: Colors.gold,
  textPrimary: Colors.text,
};

export const fontFamily = {
  regular: "WorkSans_400Regular",
  medium: "WorkSans_500Medium",
  semiBold: "WorkSans_600SemiBold",
  bold: "WorkSans_700Bold",
} as const;

// Editorial/display typeface — used only for news article headlines and
// long-form body copy (app/(tabs)/news.tsx, app/news/[id].tsx, NewsCard).
// Everything else in the app uses `fontFamily` (Work Sans) above.
export const fontFamilySpectral = {
  regular: "Spectral_400Regular",
  regularItalic: "Spectral_400Regular_Italic",
  medium: "Spectral_500Medium",
  semiBold: "Spectral_600SemiBold",
  bold: "Spectral_700Bold",
} as const;

export const typography = {
  fontFamily: {
    base: undefined,
    mono: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  weight: {
    regular: "400",
    medium: "500",
    semibold: "600",
    bold: "700",
    extrabold: "800",
    black: "900",
  } as const,
  size: {
    caption: 10,
    small: 12,
    body: 14,
    subheading: 17,
    h3: 20,
    h2: 24,
    h1: 30,
  },
  lineHeight: {
    caption: 14,
    small: 16,
    body: 20,
    subheading: 22,
    h3: 26,
    h2: 30,
    h1: 36,
  },
};

// Centralized, reusable Inter text styles. Prefer these over ad-hoc
// fontSize/fontWeight pairs so type scale changes happen in one place.
export const textStyles = {
  display: {
    fontFamily: fontFamily.bold,
    fontSize: 32,
    fontWeight: "700",
  },
  screenTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 24,
    fontWeight: "700",
  },
  sectionTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 20,
    fontWeight: "600",
  },
  cardTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 18,
    fontWeight: "600",
  },
  body: {
    fontFamily: fontFamily.regular,
    fontSize: 16,
    fontWeight: "400",
  },
  bodyMedium: {
    fontFamily: fontFamily.medium,
    fontSize: 16,
    fontWeight: "500",
  },
  secondary: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    fontWeight: "400",
  },
  caption: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    fontWeight: "400",
  },
  button: {
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    fontWeight: "600",
  },
  navigationLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    fontWeight: "500",
  },
} as const satisfies Record<string, TextStyle>;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 40,
  massive: 48,
};

export const radius = {
  sm: 6,
  input: 10,
  button: 10,
  card: 12,
  sheet: 16,
  full: 999,
};

export default { colors, typography, spacing, radius };
