/**
 * C7 · Step 7 of 7 — Review.
 *
 * From the caption: "Six labelled blocks, each with an Edit that jumps straight
 * back to its step and returns here."
 *
 * "And returns here" is the part worth implementing carefully: an Edit that pushes
 * the step onto the stack means Back lands on Review, which is exactly right. The
 * step's own Next also routes forward through the wizard, so both exits work.
 *
 * The attestation is a real gate — the server rejects a literal `false` — so it is
 * the one thing on this screen that blocks the primary action.
 */

import React, { useCallback, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { colors, radius } from "@/constants/theme";
import Text from "@/components/ui/Text";
import { CategoryDot, CheckboxRow } from "@/components/ui/Controls";
import { WizardShell, cardHairline } from "@/components/report/WizardShell";
import { Chevron } from "@/app/report/details";
import { useReportDraft } from "@/providers/ReportDraftProvider";
import { useWizardExit } from "@/components/report/useWizardExit";
import {
  CATEGORY_META,
  absoluteTime,
  formatBytes,
  type Visibility,
} from "@/lib/api/reports";

const VISIBILITY_LABEL: Record<Visibility, string> = {
  public: "Public",
  trusted: "Trusted Circle",
  private: "Private",
};

export default function ReviewStep(): React.ReactElement {
  const { payload, attachments, savedAt, setStep, allSealed, uploadingCount } = useReportDraft();
  const exit = useWizardExit();

  const [attested, setAttested] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const totalBytes = useMemo(
    () => attachments.reduce((sum, item) => sum + item.bytes, 0),
    [attachments],
  );

  /** Edit jumps to the step and pushes, so Back returns here. */
  const edit = useCallback(
    (step: number, path: string) => {
      setStep(step);
      router.push(path as never);
    },
    [setStep],
  );

  const file = useCallback(() => {
    setProblem(null);

    if (!attested) {
      setProblem("Confirm the report is true to the best of your knowledge.");
      return;
    }
    // C8's checklist seals before it files, so a still-uploading file means the
    // wizard got ahead of itself. Said plainly rather than as a generic error.
    if (!allSealed) {
      setProblem(
        uploadingCount === 1
          ? "One file is still uploading. Nothing is filed until it finishes."
          : `${uploadingCount} files are still uploading. Nothing is filed until they finish.`,
      );
      return;
    }

    router.push("/report/submitting");
  }, [allSealed, attested, uploadingCount]);

  const flags = useMemo(() => {
    const parts: string[] = [];
    if (payload.urgent) parts.push("Urgent");
    parts.push(VISIBILITY_LABEL[payload.visibility ?? "trusted"]);
    if (payload.anonymous) parts.push("Anonymous");
    return parts.join(" · ");
  }, [payload]);

  return (
    <WizardShell
      step={7}
      stepName="Review"
      savedAt={savedAt}
      onClose={exit}
      onBack={() => router.back()}
      onNext={file}
      nextLabel="File report"
      problem={problem}
      testID="wizard-review"
    >
      <View>
        <ReviewRow
          label="CATEGORY"
          onEdit={() => edit(1, "/report/category")}
          testID="review-category"
        >
          {payload.category ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
              <CategoryDot color={colors[CATEGORY_META[payload.category].token]} />
              <Text variant="label" color={colors.t0} style={{ fontSize: 13.5 }}>
                {CATEGORY_META[payload.category].label}
              </Text>
            </View>
          ) : (
            <Missing />
          )}
        </ReviewRow>

        <ReviewRow label="DETAILS" onEdit={() => edit(2, "/report/details")} testID="review-details">
          {payload.title?.trim() ? (
            <>
              <Text variant="label" color={colors.t0} style={{ fontSize: 13.5, lineHeight: 18 }}>
                {payload.title}
              </Text>
              <Text
                variant="metaSm"
                color={colors.t3}
                numberOfLines={2}
                style={{ marginTop: 3, lineHeight: 17 }}
              >
                {payload.body}
              </Text>
            </>
          ) : (
            <Missing />
          )}
        </ReviewRow>

        <ReviewRow label="DATE & TIME" onEdit={() => edit(3, "/report/when")} testID="review-when">
          {payload.occurredAt ? (
            <Text variant="label" color={colors.t0} style={{ fontSize: 13.5 }}>
              {payload.happeningNow
                ? "Happening now"
                : payload.occurredPrecision === "day_part" && payload.occurredDayPart
                  ? `${new Date(payload.occurredAt).toLocaleDateString(undefined, {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })} · ${payload.occurredDayPart}`
                  : absoluteTime(payload.occurredAt)}
            </Text>
          ) : (
            <Missing />
          )}
        </ReviewRow>

        <ReviewRow label="LOCATION" onEdit={() => edit(4, "/report/where")} testID="review-where">
          {payload.locationPrecision ? (
            <>
              <Text variant="label" color={colors.t0} style={{ fontSize: 13.5 }}>
                {payload.locationLabel?.trim() ||
                  (payload.locationPrecision === "hidden" ? "Not published" : "Area not named")}
              </Text>
              <Text variant="metaSm" color={colors.t3} style={{ marginTop: 3 }}>
                {payload.locationPrecision === "approximate"
                  ? "Approximate — about 500 m"
                  : payload.locationPrecision === "exact"
                    ? "Exact"
                    : "Hidden — no location is published"}
              </Text>
            </>
          ) : (
            <Missing />
          )}
        </ReviewRow>

        <ReviewRow
          label="EVIDENCE"
          onEdit={() => edit(5, "/report/evidence")}
          testID="review-evidence"
        >
          <Text variant="label" color={colors.t0} style={{ fontSize: 13.5 }}>
            {attachments.length === 0
              ? "No files"
              : `${attachments.length} file${attachments.length === 1 ? "" : "s"}${
                  totalBytes > 0 ? ` · ${formatBytes(totalBytes)}` : ""
                }`}
          </Text>
          {!allSealed ? (
            <Text variant="metaSm" color={colors.warn} style={{ marginTop: 3 }}>
              {`${uploadingCount} still uploading`}
            </Text>
          ) : null}
        </ReviewRow>

        <ReviewRow label="FLAGS" onEdit={() => edit(6, "/report/flags")} last testID="review-flags">
          <Text variant="label" color={colors.t0} style={{ fontSize: 13.5 }}>
            {flags}
          </Text>
        </ReviewRow>
      </View>

      {/* "What happens when you file" — collapsed, as drawn. */}
      <View style={styles.explainer}>
        <Pressable
          onPress={() => setExpanded((open) => !open)}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
        >
          <Text variant="label" color={colors.t0} style={{ fontSize: 13.5 }}>
            What happens when you file
          </Text>
          <Chevron open={expanded} />
        </Pressable>

        {expanded ? (
          <Text variant="bodyXs" color={colors.t2} style={styles.explainerBody}>
            {attachments.length > 0
              ? `Your ${attachments.length} file${attachments.length === 1 ? "" : "s"} ${
                  attachments.length === 1 ? "is" : "are"
                } sealed, then the report is filed and enters review. A moderator reads it. Nothing is sent to any outside organisation unless you choose to dispatch it later.`
              : "The report is filed and enters review. A moderator reads it. Nothing is sent to any outside organisation unless you choose to dispatch it later."}
          </Text>
        ) : null}
      </View>

      <CheckboxRow
        checked={attested}
        onToggle={() => {
          setAttested((value) => !value);
          setProblem(null);
        }}
        title="Everything here is true to the best of my knowledge."
        style={{ marginTop: 14 }}
        testID="attestation"
      />
    </WizardShell>
  );
}

/** One labelled block with its Edit affordance. */
function ReviewRow({
  label,
  children,
  onEdit,
  last = false,
  testID,
}: {
  label: string;
  children: React.ReactNode;
  onEdit: () => void;
  last?: boolean;
  testID?: string;
}): React.ReactElement {
  return (
    <View style={[styles.row, last && { borderBottomWidth: 0 }]}>
      <View style={{ flex: 1, paddingRight: 14 }}>
        <Text variant="eyebrowSm" color={colors.t4}>
          {label}
        </Text>
        <View style={{ marginTop: 5 }}>{children}</View>
      </View>
      <Pressable
        onPress={onEdit}
        hitSlop={11}
        accessibilityRole="button"
        accessibilityLabel={`Edit ${label.toLowerCase()}`}
        testID={testID}
      >
        <Text variant="labelSm" color={colors.acc}>
          Edit
        </Text>
      </Pressable>
    </View>
  );
}

/** Shown when a step was skipped — the Edit beside it is the recovery. */
function Missing(): React.ReactElement {
  return (
    <Text variant="label" color={colors.bad2} style={{ fontSize: 13.5 }}>
      Still needed
    </Text>
  );
}

const styles = {
  row: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: cardHairline,
  },
  explainer: {
    backgroundColor: colors.s3,
    borderRadius: radius.lg,
    padding: 14,
    marginTop: 14,
  },
  explainerBody: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: cardHairline,
    lineHeight: 19,
  },
};
