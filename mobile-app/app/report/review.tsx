/**
 * C7 · Step 7 of 7 — Review.
 *
 * From the caption: "Six labelled blocks, each with an Edit that jumps straight
 * back to its step and returns here."
 *
 * "And returns here" is the part worth implementing carefully: Edit opens the step
 * on top of Review with `?from=review`, so Back lands here, and the step's own Next
 * comes back here too rather than walking every later step again
 * (`useStepNavigation`).
 *
 * The attestation is a real gate — the server rejects a literal `false` — so it is
 * the one thing on this screen that blocks the primary action. A step still marked
 * "Still needed", or a file that is uploading or failed, blocks it too, with the
 * rule in words: the server would refuse the first on C8, and C8 cannot file
 * before every file is sealed.
 *
 * ── Revision 2 (docs/INCIDENT_MODULE_PLAN.md §10 "Copy") ──────────────────
 * "What happens when you file" now says what does: an automated safety check reads
 * a public or trusted report first, and it is published or a moderator checks it
 * (`filingExplainer`). The "dispatch it later" clause went with Dispatch (v7 D2).
 */

import React, { useCallback, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { colors, radius, useThemeSync } from "@/constants/theme";
import Text from "@/components/ui/Text";
import { CategoryDot, CheckboxRow } from "@/components/ui/Controls";
import {
  WizardShell,
  cardHairline,
  stepRoute,
  useStepNavigation,
} from "@/components/report/WizardShell";
import { Chevron } from "@/app/report/details";
import { stepIsComplete, useReportDraft } from "@/providers/ReportDraftProvider";
import { useWizardExit } from "@/components/report/useWizardExit";
import {
  CATEGORY_META,
  absoluteTime,
  formatBytes,
  type DraftPayload,
  type Visibility,
} from "@/lib/api/reports";
import { filingExplainer } from "@/lib/report/moderation";

const VISIBILITY_LABEL: Record<Visibility, string> = {
  public: "Public",
  trusted: "Trusted Circle",
  private: "Private",
};

/** What each required step is missing, in the words the problem line uses. */
const REQUIRED_STEPS: { step: number; missing: string }[] = [
  { step: 1, missing: "a category" },
  { step: 2, missing: "a title and what happened" },
  { step: 3, missing: "when it happened" },
  { step: 4, missing: "a location choice" },
  { step: 6, missing: "who can see it" },
];

/** "This report still needs a category and when it happened. …" — or null. */
function missingSentence(payload: DraftPayload): string | null {
  const missing = REQUIRED_STEPS.filter((entry) => !stepIsComplete(entry.step, payload)).map(
    (entry) => entry.missing,
  );
  if (missing.length === 0) return null;
  const list =
    missing.length === 1
      ? missing[0]
      : `${missing.slice(0, -1).join(", ")} and ${missing[missing.length - 1]}`;
  return `This report still needs ${list}. Tap Edit beside ${
    missing.length === 1 ? "it" : "each one"
  }.`;
}

export default function ReviewStep(): React.ReactElement {
  useThemeSync();
  const { payload, attachments, savedAt, setStep, allSealed, uploadingCount, failedCount } =
    useReportDraft();
  const exit = useWizardExit();
  const { back } = useStepNavigation(7);

  const [attested, setAttested] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const totalBytes = useMemo(
    () => attachments.reduce((sum, item) => sum + item.bytes, 0),
    [attachments],
  );

  /** Edit opens the step over Review; its Next and its Back both return here. */
  const edit = useCallback(
    (step: number) => {
      setStep(step);
      router.push({ pathname: stepRoute(step), params: { from: "review" } });
    },
    [setStep],
  );

  const file = useCallback(() => {
    setProblem(null);

    const missing = missingSentence(payload);
    if (missing) {
      setProblem(missing);
      return;
    }
    if (!attested) {
      setProblem("Confirm the report is true to the best of your knowledge.");
      return;
    }
    // Failed files first: they will not finish on their own, and counting them as
    // "still uploading" used to print "0 files are still uploading".
    if (failedCount > 0) {
      setProblem(
        failedCount === 1
          ? "One file did not upload. Try it again on the Evidence step, or remove it."
          : `${failedCount} files did not upload. Try them again on the Evidence step, or remove them.`,
      );
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
  }, [allSealed, attested, failedCount, payload, uploadingCount]);

  const flags = useMemo(() => {
    const parts: string[] = [];
    if (payload.urgent) parts.push("Urgent");
    parts.push(VISIBILITY_LABEL[payload.visibility ?? "trusted"]);
    if (payload.anonymous) parts.push("Anonymous");
    return parts.join(" · ");
  }, [payload]);

  const locationLabel = payload.locationLabel?.trim();

  return (
    <WizardShell
      step={7}
      stepName="Review"
      savedAt={savedAt}
      onClose={exit}
      onBack={back}
      onNext={file}
      nextLabel="File report"
      problem={problem}
      testID="wizard-review"
    >
      <View>
        <ReviewRow label="CATEGORY" onEdit={() => edit(1)} testID="review-category">
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

        <ReviewRow label="DETAILS" onEdit={() => edit(2)} testID="review-details">
          {stepIsComplete(2, payload) ? (
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

        <ReviewRow label="DATE & TIME" onEdit={() => edit(3)} testID="review-when">
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

        <ReviewRow label="LOCATION" onEdit={() => edit(4)} testID="review-where">
          {payload.locationPrecision ? (
            <>
              <Text variant="label" color={colors.t0} style={{ fontSize: 13.5 }}>
                {locationLabel ||
                  (payload.locationPrecision === "hidden" ? "Not published" : "Area not named")}
              </Text>
              <Text variant="metaSm" color={colors.t3} style={{ marginTop: 3 }}>
                {payload.locationPrecision === "approximate"
                  ? "Approximate — about 500 m"
                  : payload.locationPrecision === "exact"
                    ? "Exact"
                    : locationLabel
                      ? "Hidden — only the area name is shown"
                      : "Hidden — no location is published"}
              </Text>
            </>
          ) : (
            <Missing />
          )}
        </ReviewRow>

        <ReviewRow label="EVIDENCE" onEdit={() => edit(5)} testID="review-evidence">
          <Text variant="label" color={colors.t0} style={{ fontSize: 13.5 }}>
            {attachments.length === 0
              ? "No files"
              : `${attachments.length} file${attachments.length === 1 ? "" : "s"}${
                  totalBytes > 0 ? ` · ${formatBytes(totalBytes)}` : ""
                }`}
          </Text>
          {uploadingCount > 0 ? (
            <Text variant="metaSm" color={colors.warn} style={{ marginTop: 3 }}>
              {`${uploadingCount} still uploading`}
            </Text>
          ) : null}
          {failedCount > 0 ? (
            <Text variant="metaSm" color={colors.bad2} style={{ marginTop: 3 }}>
              {`${failedCount} did not upload`}
            </Text>
          ) : null}
        </ReviewRow>

        <ReviewRow label="FLAGS" onEdit={() => edit(6)} last testID="review-flags">
          <Text variant="label" color={colors.t0} style={{ fontSize: 13.5 }}>
            {flags}
          </Text>
        </ReviewRow>
      </View>

      {/* "What happens when you file" — collapsed, as drawn. */}
      <View
        style={{
          backgroundColor: colors.s3,
          borderRadius: radius.lg,
          padding: 14,
          marginTop: 14,
        }}
      >
        <Pressable
          onPress={() => setExpanded((open) => !open)}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
          testID="review-explainer"
        >
          <Text variant="label" color={colors.t0} style={{ fontSize: 13.5 }}>
            What happens when you file
          </Text>
          <Chevron open={expanded} />
        </Pressable>

        {expanded ? (
          <Text
            variant="bodyXs"
            color={colors.t2}
            style={{
              marginTop: 10,
              paddingTop: 10,
              borderTopWidth: 1,
              borderTopColor: cardHairline,
              lineHeight: 19,
            }}
          >
            {filingExplainer({ files: attachments.length, visibility: payload.visibility })}
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
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        paddingVertical: 11,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: cardHairline,
      }}
    >
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
