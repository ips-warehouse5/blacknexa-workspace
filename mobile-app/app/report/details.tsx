/**
 * C2 · Step 2 of 7 — Details.
 *
 * From the caption: "Typing and recording are separate acts. Recording attaches an
 * audio file to the report — there is no transcription and no live waveform in the
 * text field."
 *
 * That is a product decision the client confirmed, and it is easy to erode: a
 * "helpful" transcription would put words in someone's mouth on a document they
 * may rely on later. The recorder produces a file and nothing else.
 */

import React, { useCallback, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import type { TextInput } from "react-native";
import { router } from "expo-router";
import type { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { colors, radius } from "@/constants/theme";
import Text from "@/components/ui/Text";
import TextField from "@/components/ui/TextField";
import { WizardShell, SectionLabel, cardHairline } from "@/components/report/WizardShell";
import { AudioRecorderRow } from "@/components/report/AudioRecorderRow";
import { useReportDraft } from "@/providers/ReportDraftProvider";
import { useWizardExit } from "@/components/report/useWizardExit";

/** C2's counter reads `44/70`, so the cap is 70. */
const TITLE_MAX = 70;

/** The four prompts behind "Not sure where to start?". */
const PROMPTS = [
  "Who was there, and what did they say?",
  "What did you do or say in response?",
  "Did anyone else see it?",
  "How did it end?",
];

export default function DetailsStep(): React.ReactElement {
  const { payload, patch, setStep, savedAt } = useReportDraft();
  const exit = useWizardExit();

  const [title, setTitle] = useState(payload.title ?? "");
  const [body, setBody] = useState(payload.body ?? "");
  const [problem, setProblem] = useState<string | null>(null);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [bodyError, setBodyError] = useState<string | null>(null);
  const [promptsOpen, setPromptsOpen] = useState(false);

  const scrollRef = useRef<React.ComponentRef<typeof KeyboardAwareScrollView>>(null);
  const bodyRef = useRef<TextInput>(null);
  const offsets = useRef({ title: 0, body: 0 });

  const commit = useCallback(
    (nextTitle: string, nextBody: string) => {
      patch({ title: nextTitle, body: nextBody });
    },
    [patch],
  );

  const next = useCallback(() => {
    setProblem(null);
    setTitleError(null);
    setBodyError(null);

    // Top-to-bottom, so "the first problem" is the first one on screen.
    if (!title.trim()) {
      setTitleError("Give the report a title — it is what people see first.");
      scrollRef.current?.scrollTo({ y: Math.max(0, offsets.current.title - 24), animated: true });
      return;
    }
    if (!body.trim()) {
      setBodyError("Write what happened, in your own words.");
      scrollRef.current?.scrollTo({ y: Math.max(0, offsets.current.body - 24), animated: true });
      bodyRef.current?.focus();
      return;
    }

    commit(title, body);
    setStep(3);
    router.push("/report/when");
  }, [body, commit, setStep, title]);

  return (
    <WizardShell
      step={2}
      stepName="Details"
      savedAt={savedAt}
      onClose={exit}
      onBack={() => router.back()}
      onNext={next}
      problem={problem}
      scrollRef={scrollRef}
      testID="wizard-details"
    >
      <TextField
        label="TITLE"
        value={title}
        onChangeText={(value) => {
          setTitle(value.slice(0, TITLE_MAX));
          commit(value.slice(0, TITLE_MAX), body);
        }}
        error={titleError}
        hint="One line. It is what people see first."
        counter={`${title.length}/${TITLE_MAX}`}
        maxLength={TITLE_MAX}
        height={50}
        returnKeyType="next"
        onSubmitEditing={() => bodyRef.current?.focus()}
        blurOnSubmit={false}
        onLayoutY={(y) => {
          offsets.current.title = y;
        }}
        testID="report-title"
      />

      <SectionLabel style={{ marginTop: 18 }}>WHAT HAPPENED</SectionLabel>
      <TextField
        ref={bodyRef}
        value={body}
        onChangeText={(value) => {
          setBody(value);
          commit(title, value);
        }}
        error={bodyError}
        multiline
        multilineHeight={230}
        placeholder="Two officers stopped me on the way out of the station…"
        onLayoutY={(y) => {
          offsets.current.body = y;
        }}
        containerStyle={{ marginTop: 8 }}
        testID="report-body"
      />

      {/* Separate act: attaches audio, never transcribes. */}
      <AudioRecorderRow style={{ marginTop: 12 }} />

      {/* "Not sure where to start?" — collapsed by default, as drawn. */}
      <View
        style={{
          backgroundColor: colors.s3,
          borderRadius: radius.lg,
          padding: 14,
          marginTop: 14,
        }}
      >
        <Pressable
          onPress={() => setPromptsOpen((open) => !open)}
          accessibilityRole="button"
          accessibilityState={{ expanded: promptsOpen }}
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
        >
          <Text variant="label" color={colors.t0} style={{ fontSize: 13.5 }}>
            Not sure where to start?
          </Text>
          <Chevron open={promptsOpen} />
        </Pressable>

        {promptsOpen ? (
          <View
            style={{
              gap: 9,
              marginTop: 12,
              paddingTop: 12,
              borderTopWidth: 1,
              borderTopColor: cardHairline,
            }}
          >
            {PROMPTS.map((prompt) => (
              <Text key={prompt} variant="bodySm" color={colors.t2} style={{ lineHeight: 19 }}>
                {prompt}
              </Text>
            ))}
          </View>
        ) : null}
      </View>
    </WizardShell>
  );
}

/** The 18px disclosure chevron used on C2, C7 and D1. */
export function Chevron({ open }: { open: boolean }): React.ReactElement {
  return (
    <View style={{ width: 18, height: 18, alignItems: "center", justifyContent: "center" }}>
      <View
        style={{
          width: 9,
          height: 9,
          borderRightWidth: 1.7,
          borderBottomWidth: 1.7,
          borderColor: colors.t1,
          transform: [{ rotate: open ? "-135deg" : "45deg" }, { translateY: open ? 2 : -2 }],
        }}
      />
    </View>
  );
}
