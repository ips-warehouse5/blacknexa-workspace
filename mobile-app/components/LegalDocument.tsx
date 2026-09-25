/**
 * Shared layout for the Terms of Service and Privacy Policy screens.
 *
 * The documents are long (Privacy runs to thirteen sections), so each section
 * is a collapsible row: the reader sees every heading at a glance and opens
 * the ones they want. Sections sit
 * flat on the screen, separated by hairlines, so the text uses the full width
 * instead of being inset twice by a card inside the screen padding.
 */

import { router } from "expo-router";
import React, { useCallback, useState } from "react";
import { Pressable, Text as RNText, StyleSheet, View } from "react-native";
import { ChevronDown } from "lucide-react-native";
import { colors, fonts, screenPadding, useThemeSync } from "@/constants/theme";
import Text from "@/components/ui/Text";
import { BackHeader, ScrollScreen } from "@/components/ui/Screen";
import BrandMark from "@/components/BrandMark";

export interface LegalDoc {
  title: string;
  updated: string;
  sections: { heading: string; body: string }[];
  footer: string;
}

export default function LegalDocument({
  screenTitle,
  doc,
  testID,
}: {
  /** Title in the back header, e.g. "Privacy Policy". */
  screenTitle: string;
  doc: LegalDoc;
  testID: string;
}): React.ReactElement {
  useThemeSync();
  const [open, setOpen] = useState<ReadonlySet<number>>(() => new Set());

  const toggle = useCallback((index: number) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  return (
    <ScrollScreen
      padding={screenPadding.detail}
      contentStyle={styles.content}
      testID={testID}
    >
      <BackHeader title={screenTitle} onBack={() => router.back()} padding={0} />
      <BrandMark variant="chip" style={styles.brand} testID={`${testID}-brand`} />
      <Text variant="cardTitle" color={colors.t0} style={styles.title}>
        {doc.title}
      </Text>
      <Text variant="metaSm" color={colors.t3} style={styles.updated}>
        {doc.updated}
      </Text>

      <View style={[styles.list, { borderColor: colors.line }]}>
        {doc.sections.map((s, i) => {
          const isOpen = open.has(i);
          return (
            <View
              key={s.heading}
              style={[styles.section, { borderColor: colors.line }]}
            >
              <Pressable
                onPress={() => toggle(i)}
                accessibilityRole="button"
                accessibilityLabel={s.heading}
                accessibilityState={{ expanded: isOpen }}
                hitSlop={isOpen ? { bottom: 8 } : undefined}
                style={({ pressed }) => [
                  styles.sectionHeader,
                  isOpen && styles.sectionHeaderOpen,
                  pressed && styles.pressed,
                ]}
                testID={`${testID}-section-${i}`}
              >
                <Text
                  variant="labelLg"
                  color={isOpen ? colors.acc : colors.t0}
                  style={styles.heading}
                >
                  {s.heading}
                </Text>
                <ChevronDown
                  size={18}
                  color={colors.t3}
                  style={isOpen ? styles.chevronOpen : undefined}
                />
              </Pressable>
              {isOpen ? (
                <View style={styles.body}>
                  {splitParagraphs(s.body).map((para, p) => (
                    <Text
                      key={p}
                      variant="body"
                      color={colors.t2}
                      style={[styles.paragraph, p > 0 && styles.paragraphGap]}
                    >
                      {renderInline(para)}
                    </Text>
                  ))}
                </View>
              ) : null}
            </View>
          );
        })}
      </View>

      <Text variant="bodySm" color={colors.t3} center style={styles.footer}>
        {doc.footer}
      </Text>
      <Text variant="metaSm" color={colors.t4} center style={styles.tm}>
        © {new Date().getFullYear()} News Moves Markets Forex LLC. All Rights
        Reserved. BlackNexa™ is a trademark of News Moves Markets Forex LLC.
      </Text>
    </ScrollScreen>
  );
}

/**
 * Bodies mark paragraphs with a blank line. Rendered as-is, each blank line is
 * a full empty line of text; split instead, so paragraphs sit a small, fixed
 * gap apart.
 */
function splitParagraphs(body: string): string[] {
  return body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/**
 * `**…**` marks bold and `_…_` italic — the two emphases the client's copy
 * uses. Nested `RNText` inherits the parent's size, colour and line height;
 * only the family changes, because Android does not synthesise weights or
 * italics for custom fonts.
 */
function renderInline(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|_[^_]+_)/g).map((part, i) => {
    if (part.length > 4 && part.startsWith("**") && part.endsWith("**")) {
      return (
        <RNText key={i} style={styles.bold}>
          {part.slice(2, -2)}
        </RNText>
      );
    }
    if (part.length > 2 && part.startsWith("_") && part.endsWith("_")) {
      return (
        <RNText key={i} style={styles.italic}>
          {part.slice(1, -1)}
        </RNText>
      );
    }
    return part;
  });
}

const styles = StyleSheet.create({
  content: { paddingBottom: 40 },
  brand: { marginTop: 6, marginBottom: 12 },
  title: { marginBottom: 4 },
  updated: { marginBottom: 12 },
  list: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  section: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sectionHeader: {
    minHeight: 48,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  // An open heading sits close to its own text rather than floating above it.
  // `minHeight` goes too — it would otherwise re-centre the heading in 48px;
  // `hitSlop` on the row keeps the touch target that size.
  sectionHeaderOpen: { minHeight: 0, paddingBottom: 6 },
  heading: { flex: 1 },
  pressed: { opacity: 0.7 },
  chevronOpen: { transform: [{ rotate: "180deg" }] },
  body: { paddingBottom: 16 },
  paragraph: { lineHeight: 21 },
  paragraphGap: { marginTop: 8 },
  bold: { fontFamily: fonts.bodySemi },
  italic: { fontFamily: fonts.bodyItalic },
  footer: { marginTop: 20 },
  tm: { marginTop: 8, paddingHorizontal: 16 },
});
