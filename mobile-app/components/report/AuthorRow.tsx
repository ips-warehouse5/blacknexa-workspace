/**
 * The author row on D1 and D2.
 *
 * ── Names are not links ────────────────────────────────────────────────────
 * D4's caption states the rule for the whole app: "Author names are deliberately
 * not links: there is no public profile." So this is a `View`, not a `Pressable`,
 * and there is no `onPress` to add one by accident.
 *
 * An anonymous author gets a generated tile — a quiet 2×2 pattern derived from the
 * report, not initials — so the row still has visual weight without implying an
 * identity. Its colours come from the category token, which is already public.
 */

import React from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { alpha, colors, radius } from "@/constants/theme";
import Text from "@/components/ui/Text";
import type { AuthorView } from "@/lib/api/reports";

export function AuthorRow({
  author,
  area,
  accent = colors.c1,
  style,
}: {
  author: AuthorView;
  area?: string | null;
  /** The report's category colour, for the anonymous tile. */
  accent?: string;
  style?: StyleProp<ViewStyle>;
}): React.ReactElement {
  return (
    <View style={[styles.row, style]}>
      <View style={styles.tile}>
        {author.anonymous || !author.initials ? (
          <AnonymousMark accent={accent} />
        ) : (
          <Text variant="label" color={colors.acc}>
            {author.initials}
          </Text>
        )}
      </View>

      <View style={{ flex: 1 }}>
        <Text variant="labelLg" color={colors.t0}>
          {author.name}
        </Text>
        {area ? (
          <Text variant="meta" color={colors.t4} style={{ marginTop: 2 }}>
            {area}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/**
 * The 2×2 quilt the artboards use for an anonymous author.
 *
 * Two squares in the category colour and two neutral, alternating — recognisable
 * as "no identity" rather than as a missing avatar.
 */
function AnonymousMark({ accent }: { accent: string }): React.ReactElement {
  return (
    <View style={styles.quilt}>
      <View style={[styles.quiltCell, { backgroundColor: accent, opacity: 0.85, borderRadius: 1.4 }]} />
      <View style={[styles.quiltCell, { backgroundColor: colors.t5, borderRadius: 3 }]} />
      <View style={[styles.quiltCell, { backgroundColor: colors.t5, borderRadius: 3 }]} />
      <View style={[styles.quiltCell, { backgroundColor: accent, opacity: 0.55, borderRadius: 1.4 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 11 },
  tile: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.s6,
    alignItems: "center",
    justifyContent: "center",
  },
  quilt: {
    width: 19,
    height: 19,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 1.5,
  },
  quiltCell: { width: 8, height: 8 },
});

/** Kept referenced so the alpha helper stays available for future tinting. */
void alpha;

export default AuthorRow;
