/**
 * Progress segments, password strength, and the requirement list.
 *
 * All three come from the same corner of the design and share one idea: show
 * position or completeness without ever scolding.
 *
 * ── The rule these encode ──────────────────────────────────────────────────
 * A6's caption: "Requirements stay neutral grey until met — never red while
 * typing." So `RequirementList` has exactly two states, unmet and met, and unmet
 * is grey. There is no error state, because the design does not have one: a
 * missing requirement is not a mistake, it is an unfinished thought.
 *
 * The strength meter does use amber and green, which is consistent with the
 * palette rule — those are status colours reporting a status, not decoration.
 */

import React from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { alpha, colors } from "@/constants/theme";
import Text from "@/components/ui/Text";

/**
 * The step bar on A6–A9 (4 segments, gap 5) and C1–C7 (7 segments, gap 4).
 *
 * h 3, r 2; filled `acc`, empty ink at 10–12%.
 */
export function ProgressSegments({
  total,
  completed,
  gap = 5,
  style,
  testID,
}: {
  total: number;
  completed: number;
  gap?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}): React.ReactElement {
  return (
    <View
      style={[styles.segments, { gap }, style]}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: total, now: completed }}
      testID={testID}
    >
      {Array.from({ length: total }, (_, index) => (
        <View
          key={index}
          style={[
            styles.segment,
            { backgroundColor: index < completed ? colors.acc : alpha(colors.t0, 0.12) },
          ]}
        />
      ))}
    </View>
  );
}

/**
 * The "Step 1 of 4 · Account" header plus its bar, as one unit.
 *
 * Kept together because the artboards never show one without the other, and the
 * spacing between them (9px) is part of the design rather than a caller's choice.
 */
export function StepHeader({
  step,
  total,
  name,
  trailing,
  gap = 5,
  style,
}: {
  step: number;
  total: number;
  name: string;
  /** Right-aligned note — C5's "Optional". */
  trailing?: string;
  gap?: number;
  style?: StyleProp<ViewStyle>;
}): React.ReactElement {
  return (
    <View style={style}>
      <View style={styles.stepRow}>
        <Text variant="labelSm" color={colors.t2}>
          {`Step ${step} of ${total} · ${name}`}
        </Text>
        {trailing ? (
          <Text variant="labelSm" color={colors.t4}>
            {trailing}
          </Text>
        ) : null}
      </View>
      <ProgressSegments
        total={total}
        completed={step}
        gap={gap}
        style={{ marginTop: 9 }}
      />
    </View>
  );
}

/** The four password rules, scored. Keep in step with the server's Joi schema. */
export interface PasswordRule {
  label: string;
  met: boolean;
}

/**
 * Score a candidate password against A6's four printed requirements.
 *
 * The labels are the artboard's own words, so what the screen shows and what the
 * server enforces cannot drift apart in wording either.
 */
export function evaluatePassword(password: string): {
  rules: PasswordRule[];
  score: number;
  label: string;
  color: string;
} {
  const rules: PasswordRule[] = [
    { label: "At least 10 characters", met: password.length >= 10 },
    { label: "One capital letter", met: /[A-Z]/.test(password) },
    { label: "One number", met: /\d/.test(password) },
    { label: "One symbol", met: /[^A-Za-z0-9]/.test(password) },
  ];

  const score = rules.filter((rule) => rule.met).length;

  // A6 shows two amber segments captioned "Fair — two more to go", so the copy is
  // derived from how many rules remain rather than from an abstract entropy score.
  const remaining = rules.length - score;
  let label = "";
  let color = colors.t4;
  if (password.length === 0) {
    label = "";
  } else if (score <= 1) {
    label = remaining === 1 ? "Weak — one more to go" : `Weak — ${remaining} more to go`;
    color = colors.bad2;
  } else if (score < rules.length) {
    label = remaining === 1 ? "Fair — one more to go" : `Fair — ${remaining} more to go`;
    color = colors.warn;
  } else {
    label = "Strong";
    color = colors.ok;
  }

  return { rules, score, label, color };
}

/** The four-segment strength bar on A6 and A14. */
export function StrengthMeter({
  score,
  total = 4,
  label,
  color,
  style,
}: {
  score: number;
  total?: number;
  label?: string;
  color?: string;
  style?: StyleProp<ViewStyle>;
}): React.ReactElement {
  const fill = color ?? colors.warn;
  return (
    <View style={style}>
      <View style={styles.segments}>
        {Array.from({ length: total }, (_, index) => (
          <View
            key={index}
            style={[
              styles.segment,
              { backgroundColor: index < score ? fill : alpha(colors.t0, 0.12) },
            ]}
          />
        ))}
      </View>
      {label ? (
        <Text variant="labelSm" color={fill} style={{ marginTop: 8 }}>
          {label}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * The requirement rows on A6 and A14.
 *
 * Met: a green-tinted disc with a tick. Unmet: a hollow grey ring. Never red.
 */
export function RequirementList({
  rules,
  style,
  testID,
}: {
  rules: PasswordRule[];
  style?: StyleProp<ViewStyle>;
  testID?: string;
}): React.ReactElement {
  return (
    <View style={[styles.rules, style]} testID={testID}>
      {rules.map((rule) => (
        <View key={rule.label} style={styles.ruleRow}>
          <View
            style={[
              styles.ruleMark,
              rule.met
                ? { backgroundColor: alpha(colors.ok, 0.16) }
                : { borderWidth: 1.4, borderColor: colors.line },
            ]}
          >
            {rule.met ? <RuleTick /> : null}
          </View>
          <Text
            variant="label"
            color={rule.met ? colors.t1 : colors.t3}
            // Announced so a screen reader reports progress, not just the label.
            accessibilityLabel={`${rule.label}: ${rule.met ? "met" : "not yet met"}`}
          >
            {rule.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** The 1.6px green tick inside a met requirement's disc. */
function RuleTick(): React.ReactElement {
  return (
    <View style={styles.ruleTick}>
      <View style={styles.ruleTickShort} />
      <View style={styles.ruleTickLong} />
    </View>
  );
}

const styles = StyleSheet.create({
  segments: { flexDirection: "row", gap: 5 },
  segment: { flex: 1, height: 3, borderRadius: 2 },

  stepRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },

  rules: { gap: 11 },
  ruleRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  ruleMark: {
    width: 17,
    height: 17,
    borderRadius: 8.5,
    alignItems: "center",
    justifyContent: "center",
  },
  ruleTick: { width: 11, height: 11, alignItems: "center", justifyContent: "center" },
  ruleTickShort: {
    position: "absolute",
    width: 4,
    height: 1.6,
    borderRadius: 0.8,
    backgroundColor: colors.ok,
    transform: [{ rotate: "45deg" }, { translateX: -2.4 }, { translateY: 1.6 }],
  },
  ruleTickLong: {
    position: "absolute",
    width: 7.5,
    height: 1.6,
    borderRadius: 0.8,
    backgroundColor: colors.ok,
    transform: [{ rotate: "-45deg" }, { translateX: 0.8 }],
  },
});
