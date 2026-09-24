/**
 * Wizard entry.
 *
 * Resumes an unfinished draft at the step it stopped on, rather than always
 * starting at C1 — A12 promises the wizard "saves a draft as you go, so you can
 * stop at any step", which is only true if coming back honours it.
 *
 * ── F1 → Resume (docs/INCIDENT_MODULE_PLAN.md §10 "Vault F1") ──────────────
 * A draft row in the Vault opens `/report?draftId=<id>`. That draft may not be the
 * one on this device — it can come from another phone, or from before a
 * reinstall — so once the local restore has settled this screen:
 *
 *   • resumes the local draft when it *is* that draft (the local copy is at least
 *     as new as the server's);
 *   • otherwise fetches the server draft first, so a draft that is gone is
 *     reported before anything on the device is touched;
 *   • then, if a *different* local draft has content, offers C10 — save it or
 *     discard it — before the server draft replaces it (the device holds one
 *     draft at a time), and opens the server draft directly when there is nothing
 *     local to lose.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { colors, screenPadding, useThemeSync } from "@/constants/theme";
import Text from "@/components/ui/Text";
import Button from "@/components/ui/Button";
import { Screen } from "@/components/ui/Screen";
import { stepRoute } from "@/components/report/WizardShell";
import { useReportDraft } from "@/providers/ReportDraftProvider";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type EntryState =
  | { kind: "routing" }
  | { kind: "loading" }
  | { kind: "gone" }
  | { kind: "failed"; message: string };

export default function ReportEntryScreen(): React.ReactElement {
  useThemeSync();
  const params = useLocalSearchParams<{ draftId?: string }>();
  const { ready, step, hasContent, draftId, stageServerDraft, adoptStagedDraft } =
    useReportDraft();
  const [state, setState] = useState<EntryState>({ kind: "routing" });
  const routed = useRef(false);

  const requested =
    typeof params.draftId === "string" && UUID.test(params.draftId) ? params.draftId : null;

  const openServerDraft = useCallback(
    async (id: string, localHasContent: boolean) => {
      setState({ kind: "loading" });
      const outcome = await stageServerDraft(id);
      if (outcome.status === "gone") {
        setState({ kind: "gone" });
        return;
      }
      if (outcome.status === "failed") {
        setState({ kind: "failed", message: outcome.message });
        return;
      }
      if (localHasContent) {
        // C10 first — the sheet saves or discards the local draft, then adopts.
        setState({ kind: "routing" });
        router.push({ pathname: "/report/save-or-discard", params: { switchTo: id } });
        return;
      }
      const nextStep = await adoptStagedDraft();
      router.replace(stepRoute(nextStep ?? 1));
    },
    [adoptStagedDraft, stageServerDraft],
  );

  useEffect(() => {
    if (!ready || routed.current) return;
    routed.current = true;

    if (!requested || requested === draftId) {
      // A restored draft with nothing in it is not a draft worth resuming.
      router.replace(hasContent ? stepRoute(step) : stepRoute(1));
      return;
    }
    void openServerDraft(requested, hasContent);
  }, [draftId, hasContent, openServerDraft, ready, requested, step]);

  if (state.kind === "loading") {
    return (
      <Screen padding={screenPadding.detail} testID="wizard-entry-loading">
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 14 }}>
          <ActivityIndicator color={colors.acc} />
          <Text variant="bodySm" color={colors.t3} center>
            Opening your draft…
          </Text>
        </View>
      </Screen>
    );
  }

  if (state.kind === "gone" || state.kind === "failed") {
    return (
      <Screen padding={screenPadding.detail} testID="wizard-entry-error">
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 22 }}>
          <Text variant="sectionTitle" color={colors.t0} center>
            {state.kind === "gone" ? "That draft is no longer here" : "That draft did not open"}
          </Text>
          <Text variant="bodySm" color={colors.t2} center style={{ marginTop: 9, lineHeight: 21 }}>
            {state.kind === "gone"
              ? "It may have been filed or discarded on another device. Anything filed is in your Vault."
              : state.message}
          </Text>
          {state.kind === "failed" && requested ? (
            <Button
              label="Try again"
              onPress={() => void openServerDraft(requested, hasContent)}
              block={false}
              style={{ marginTop: 22, paddingHorizontal: 22 }}
              testID="wizard-entry-retry"
            />
          ) : null}
          {/* The only screen in the wizard's stack: going back closes the wizard. */}
          <Button
            label="Back to the Vault"
            variant="quiet"
            onPress={() => router.back()}
            block={false}
            style={{ marginTop: 9, paddingHorizontal: 22 }}
            testID="wizard-entry-back"
          />
        </View>
      </Screen>
    );
  }

  // Deliberately blank: the redirect fires on the first committed frame, and a
  // spinner here would flash for one frame on every open of the wizard.
  return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
}
