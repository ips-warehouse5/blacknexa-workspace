/**
 * The wizard chrome shared by C1 through C7 — variant 1d, "segment bar".
 *
 * Header: `×` / "New report" + "Draft saved · 9:41 PM" / `?`. Then "Step N of 7 ·
 * Name" and seven progress segments. Footer: Back (88px quiet) + Next (flex
 * accent), above a hairline.
 *
 * ── Next is never disabled ─────────────────────────────────────────────────
 * The section caption is explicit: "Next is the only accent element on every step
 * and is never disabled — tapping it with something missing scrolls to the first
 * problem and prints the rule in words under that field."
 *
 * So `onNext` always fires and the *step* decides. `problem` is how a step reports
 * back what was missing; the shell renders it, the step supplies the words.
 *
 * ── × does not close ───────────────────────────────────────────────────────
 * C10 sits behind the ×. Nothing is ever half-filed, so there is no dismissal
 * path here at all — `onClose` opens the save-or-discard sheet.
 */

import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { alpha, colors, screenPadding } from "@/constants/theme";
import Text from "@/components/ui/Text";
import Button from "@/components/ui/Button";
import { ScrollScreen } from "@/components/ui/Screen";
import { StepHeader } from "@/components/ui/Progress";

/** "Draft saved · 9:41 PM" — the local save time, per the provider's contract. */
function formatSavedAt(iso: string | null): string {
  if (!iso) return "Not saved yet";
  const value = Date.parse(iso);
  if (!Number.isFinite(value)) return "Not saved yet";
  const time = new Date(value).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  return `Draft saved · ${time}`;
}

export interface WizardShellProps {
  step: number;
  stepName: string;
  /** C5's right-aligned "Optional". */
  stepNote?: string;
  savedAt: string | null;
  children: React.ReactNode;
  onClose: () => void;
  onBack?: () => void;
  onNext: () => void;
  /** Label for the forward action — "File report" on C7. */
  nextLabel?: string;
  /** Set by the step when Next was tapped with something missing. */
  problem?: string | null;
  busy?: boolean;
  scrollRef?: React.ComponentProps<typeof ScrollScreen>["scrollRef"];
  testID?: string;
}

export function WizardShell({
  step,
  stepName,
  stepNote,
  savedAt,
  children,
  onClose,
  onBack,
  onNext,
  nextLabel = "Next",
  problem,
  busy = false,
  scrollRef,
  testID,
}: WizardShellProps): React.ReactElement {
  return (
    <ScrollScreen
      padding={screenPadding.wizard}
      scrollRef={scrollRef}
      footerBorder
      testID={testID}
      footer={
        <View>
          {problem ? (
            <Text variant="metaSm" color={colors.bad2} style={styles.problem}>
              {problem}
            </Text>
          ) : null}
          <View style={styles.footerRow}>
            <Button
              label="Back"
              variant="quiet"
              block={false}
              height={52}
              style={styles.backButton}
              onPress={onBack}
              // Step 1 has nothing to go back to, so the control is genuinely
              // unavailable rather than merely unhelpful.
              disabled={!onBack}
            />
            {/* Never disabled — see the file header. */}
            <Button
              label={nextLabel}
              onPress={onNext}
              loading={busy}
              style={styles.nextButton}
              testID="wizard-next"
            />
          </View>
        </View>
      }
    >
      <View style={styles.header}>
        <Pressable
          onPress={onClose}
          hitSlop={11}
          accessibilityRole="button"
          accessibilityLabel="Close this report"
          testID="wizard-close"
        >
          <CloseGlyph />
        </Pressable>

        <View style={styles.headerCentre}>
          <Text variant="label" color={colors.t0} style={{ fontSize: 15 }}>
            New report
          </Text>
          <Text variant="metaSm" color={colors.t4} style={{ marginTop: 2, fontSize: 11 }}>
            {formatSavedAt(savedAt)}
          </Text>
        </View>

        <Pressable
          hitSlop={11}
          accessibilityRole="button"
          accessibilityLabel="What this step is for"
        >
          <HelpGlyph />
        </Pressable>
      </View>

      <StepHeader
        step={step}
        total={7}
        name={stepName}
        trailing={stepNote}
        gap={4}
        style={styles.stepHeader}
      />

      <View style={styles.body}>{children}</View>
    </ScrollScreen>
  );
}

/** The 22px × from the artboard. */
function CloseGlyph(): React.ReactElement {
  return (
    <View style={styles.glyph}>
      <View style={[styles.closeBar, { transform: [{ rotate: "45deg" }] }]} />
      <View style={[styles.closeBar, { transform: [{ rotate: "-45deg" }] }]} />
    </View>
  );
}

/** The 22px question mark in a circle. */
function HelpGlyph(): React.ReactElement {
  return (
    <View style={styles.glyph}>
      <View style={styles.helpRing} />
      <Text variant="labelSm" color={colors.t1} style={{ fontSize: 11 }}>
        ?
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingTop: 2,
  },
  headerCentre: { alignItems: "center", flex: 1 },
  stepHeader: { marginTop: 16 },
  body: { marginTop: 20 },

  problem: { marginBottom: 10 },
  footerRow: { flexDirection: "row", gap: 10 },
  backButton: { width: 88 },
  nextButton: { flex: 1 },

  glyph: { width: 22, height: 22, alignItems: "center", justifyContent: "center" },
  closeBar: {
    position: "absolute",
    width: 16,
    height: 1.8,
    borderRadius: 1,
    backgroundColor: colors.t1,
  },
  helpRing: {
    position: "absolute",
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.7,
    borderColor: colors.t1,
  },
});

/**
 * The card the design uses for a consequential row: a raised surface with a title
 * and the sentence that says what it does.
 *
 * Pulled out because C3, C4, C6 and C7 all repeat it, and the design's rule that
 * "every consequential choice states its consequence" is easier to keep when the
 * consequence is a required prop.
 */
export function ConsequenceCard({
  title,
  consequence,
  children,
  selected = false,
  onPress,
  testID,
}: {
  title: string;
  consequence: string;
  children?: React.ReactNode;
  selected?: boolean;
  onPress?: () => void;
  testID?: string;
}): React.ReactElement {
  const content = (
    <>
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
        <Text variant="label" color={colors.t0} style={{ fontSize: 13.5, flex: 1 }}>
          {title}
        </Text>
        {children}
      </View>
      <Text
        variant="metaSm"
        color={selected ? colors.t2 : colors.t3}
        style={{ marginTop: 2, lineHeight: 17.5 }}
      >
        {consequence}
      </Text>
    </>
  );

  const surface = {
    backgroundColor: selected ? colors.s5 : colors.s3,
    borderRadius: 13,
    borderWidth: selected ? 1.5 : 0,
    borderColor: selected ? colors.acc : "transparent",
    // Padding drops by the border width so the row height never shifts.
    paddingVertical: selected ? 10.5 : 12,
    paddingHorizontal: selected ? 12.5 : 14,
  } as const;

  if (!onPress) return <View style={surface}>{content}</View>;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${title}. ${consequence}`}
      testID={testID}
      style={({ pressed }) => [surface, pressed && { opacity: 0.88 }]}
    >
      {content}
    </Pressable>
  );
}

/** Section eyebrow — "WHO CAN SEE IT", "HOW PRECISE". */
export function SectionLabel({
  children,
  style,
}: {
  children: string;
  style?: React.ComponentProps<typeof Text>["style"];
}): React.ReactElement {
  return (
    <Text variant="fieldLabel" color={colors.t3} style={style}>
      {children}
    </Text>
  );
}

/** The in-card hairline the design uses to separate a title from its consequence. */
export const cardHairline = alpha(colors.t0, 0.07);
