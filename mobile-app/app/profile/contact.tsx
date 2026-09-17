/**
 * H3b · Contact support.
 *
 * No support-ticket API exists in the backend (checked: no route/service
 * for inquiries beyond the unrelated public website's `ContactInquiry`
 * model, which this app has no access to). Rather than fake a "message
 * sent" success for a network call that doesn't exist, "Send" opens the
 * device's own mail client via `Linking` — a real action with a real
 * outcome the user can see (their own mail app), not a simulated one.
 *
 * TODO: `SUPPORT_EMAIL` below is a placeholder inbox, not confirmed against
 * a real BlackNexa support address — replace once product/ops confirms it.
 */

import React, { useCallback, useRef, useState } from "react";
import { Linking, Pressable, StyleSheet, TextInput, View } from "react-native";
import type { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { ChevronDown } from "lucide-react-native";
import { router } from "expo-router";
import { alpha, colors, radius, screenPadding, useThemeSync } from "@/constants/theme";
import Text from "@/components/ui/Text";
import Button from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { Checkbox } from "@/components/ui/Controls";
import { ScrollScreen, BackHeader } from "@/components/ui/Screen";
import { useSnackbar } from "@/providers/SnackbarProvider";
import { useAuth } from "@/providers/AuthProvider";

const SUPPORT_EMAIL = "support@blacknexa.com";
const MIN_MESSAGE = 10;
const MAX_MESSAGE = 1000;
const SUBJECTS = [
  "Something isn’t working",
  "General enquiry",
  "Partnership",
  "Press",
  "Report a problem",
  "Legal",
] as const;

export default function ContactScreen(): React.ReactElement {
  useThemeSync();
  const { user } = useAuth();
  const { showSnackbar } = useSnackbar();
  const [message, setMessage] = useState("");
  const [subject, setSubject] = useState<(typeof SUBJECTS)[number]>(
    SUBJECTS[0],
  );
  const [subjectsOpen, setSubjectsOpen] = useState(false);
  const [attachDiagnostics, setAttachDiagnostics] = useState(true);
  const [opening, setOpening] = useState(false);
  const [messageError, setMessageError] = useState<string | null>(null);
  const scrollRef =
    useRef<React.ComponentRef<typeof KeyboardAwareScrollView>>(null);
  const messageRef = useRef<TextInput>(null);
  const messageY = useRef(0);

  const send = useCallback(async () => {
    const trimmed = message.trim();
    if (!trimmed) {
      setMessageError("Tell us what happened before sending.");
      scrollRef.current?.scrollTo({
        y: Math.max(0, messageY.current - 24),
        animated: true,
      });
      messageRef.current?.focus();
      return;
    }
    if (trimmed.length < MIN_MESSAGE) {
      setMessageError(
        `Write at least ${MIN_MESSAGE} characters so support has enough context.`,
      );
      scrollRef.current?.scrollTo({
        y: Math.max(0, messageY.current - 24),
        animated: true,
      });
      messageRef.current?.focus();
      return;
    }

    setMessageError(null);
    setOpening(true);
    const encodedSubject = encodeURIComponent(`BlackNexa support: ${subject}`);
    const body = encodeURIComponent(
      `${trimmed}\n\n—\nSubject: ${subject}\nAccount: ${
        user?.email ?? "unknown"
      }\nAttach diagnostics: ${attachDiagnostics ? "yes" : "no"}`,
    );
    const url = `mailto:${SUPPORT_EMAIL}?subject=${encodedSubject}&body=${body}`;
    try {
      const can = await Linking.canOpenURL(url);
      if (!can) {
        showSnackbar({
          message: "No email app is set up on this device.",
          type: "error",
        });
        return;
      }
      await Linking.openURL(url);
    } catch {
      showSnackbar({
        message: "Couldn't open your email app. Please try again.",
        type: "error",
      });
    } finally {
      setOpening(false);
    }
  }, [attachDiagnostics, message, showSnackbar, subject, user?.email]);

  return (
    <ScrollScreen
      padding={screenPadding.detail}
      testID="profile-contact"
      scrollRef={scrollRef}
      bottomSpace={36}
      footer={
        <Button
          label="Send"
          onPress={send}
          loading={opening}
          testID="contact-send"
        />
      }
    >
      <BackHeader
        title="Contact support"
        onBack={() => router.back()}
        padding={0}
      />

      <Text variant="bodySm" color={colors.t2} style={styles.intro}>
        Tell us what happened. Nothing from your reports or your Vault is
        attached unless you tick the box.
      </Text>

      <Text variant="fieldLabel" color={colors.t3} style={styles.fieldLabel}>
        WHAT IS THIS ABOUT
      </Text>
      <View style={styles.subjectWrap}>
        <Pressable
          onPress={() => setSubjectsOpen((open) => !open)}
          accessibilityRole="button"
          accessibilityState={{ expanded: subjectsOpen }}
          testID="contact-subject"
          style={({ pressed }) => [
            styles.subjectButton,
            { backgroundColor: colors.s3 },
            subjectsOpen && {
              borderWidth: 1.2,
              borderColor: colors.acc,
              backgroundColor: colors.s0,
            },
            pressed && { opacity: 0.9 },
          ]}
        >
          <Text variant="label" color={colors.t0} style={{ flex: 1 }}>
            {subject}
          </Text>
          <ChevronDown
            size={18}
            color={colors.t3}
            style={{
              transform: [{ rotate: subjectsOpen ? "180deg" : "0deg" }],
            }}
          />
        </Pressable>
        {subjectsOpen ? (
          <View
            style={[
              styles.subjectMenu,
              {
                backgroundColor: colors.s3,
                borderColor: alpha(colors.t0, 0.07),
              },
            ]}
          >
            {SUBJECTS.map((option, index) => {
              const selected = option === subject;
              return (
                <Pressable
                  key={option}
                  onPress={() => {
                    setSubject(option);
                    setSubjectsOpen(false);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={({ pressed }) => [
                    styles.subjectOption,
                    index === SUBJECTS.length - 1 && { borderBottomWidth: 0 },
                    {
                      borderBottomColor: alpha(colors.t0, 0.07),
                    },
                    selected && { backgroundColor: alpha(colors.acc, 0.07) },
                    pressed && { opacity: 0.88 },
                  ]}
                >
                  <Text
                    variant="label"
                    color={selected ? colors.acc : colors.t1}
                  >
                    {option}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </View>

      <TextField
        ref={messageRef}
        label="MESSAGE"
        value={message}
        onChangeText={(text) => {
          setMessage(text.slice(0, MAX_MESSAGE));
          if (messageError) setMessageError(null);
        }}
        placeholder="The upload bar sticks at 62% when I add a video over about twenty seconds."
        error={messageError}
        multiline
        multilineHeight={140}
        containerStyle={styles.messageField}
        textAlignVertical="top"
        returnKeyType="default"
        blurOnSubmit={false}
        onLayoutY={(y) => {
          messageY.current = y;
        }}
        testID="contact-message"
      />
      <View style={styles.messageMeta}>
        <Text variant="metaSm" color={colors.t4}>
          We reply to {user?.email ?? "your account email"}
        </Text>
        <Text variant="metaSm" color={colors.t4}>
          {message.length} / {MAX_MESSAGE}
        </Text>
      </View>

      <Pressable
        onPress={() => setAttachDiagnostics((value) => !value)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: attachDiagnostics }}
        style={({ pressed }) => [
          styles.diagnosticsRow,
          pressed && { opacity: 0.9 },
        ]}
      >
        <View pointerEvents="none">
          <Checkbox
            checked={attachDiagnostics}
            onToggle={() => setAttachDiagnostics((value) => !value)}
          />
        </View>
        <Text variant="bodyXs" color={colors.t2} style={styles.diagnosticsText}>
          Attach diagnostics — app version, device and error logs. No report
          content, ever.
        </Text>
      </Pressable>
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  intro: {
    marginTop: 14,
    lineHeight: 20,
  },
  fieldLabel: {
    marginTop: 22,
  },
  subjectWrap: {
    marginTop: 8,
    position: "relative",
    zIndex: 20,
  },
  subjectButton: {
    minHeight: 50,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  subjectMenu: {
    position: "absolute",
    top: 57,
    left: 0,
    right: 0,
    zIndex: 30,
    elevation: 8,
    borderRadius: radius.md,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
  },
  subjectOption: {
    minHeight: 44,
    paddingHorizontal: 14,
    justifyContent: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  messageField: {
    marginTop: 18,
    zIndex: 0,
  },
  messageMeta: {
    marginTop: 4,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  diagnosticsRow: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  diagnosticsText: {
    flex: 1,
    lineHeight: 18,
  },
});
