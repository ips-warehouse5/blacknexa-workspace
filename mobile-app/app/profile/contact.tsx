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

import React, { useCallback, useState } from "react";
import { Linking, View } from "react-native";
import { router } from "expo-router";
import { colors, radius, screenPadding } from "@/constants/theme";
import Text from "@/components/ui/Text";
import Button from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { ScrollScreen, BackHeader } from "@/components/ui/Screen";
import { useSnackbar } from "@/providers/SnackbarProvider";
import { useAuth } from "@/providers/AuthProvider";

const SUPPORT_EMAIL = "support@blacknexa.com";
const MAX_MESSAGE = 500;

export default function ContactScreen(): React.ReactElement {
  const { user } = useAuth();
  const { showSnackbar } = useSnackbar();
  const [message, setMessage] = useState("");
  const [opening, setOpening] = useState(false);

  const send = useCallback(async () => {
    if (!message.trim()) return;
    setOpening(true);
    const subject = encodeURIComponent("BlackNexa support request");
    const body = encodeURIComponent(
      `${message.trim()}\n\n—\nAccount: ${user?.email ?? "unknown"}`,
    );
    const url = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
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
  }, [message, showSnackbar, user?.email]);

  return (
    <ScrollScreen padding={screenPadding.detail} testID="profile-contact">
      <BackHeader title="Contact support" onBack={() => router.back()} padding={0} />

      <Text variant="bodySm" color={colors.t2} style={{ marginTop: 14 }}>
        We reply to {user?.email ?? "your account email"}.
      </Text>

      <TextField
        label="Message"
        value={message}
        onChangeText={(text) => setMessage(text.slice(0, MAX_MESSAGE))}
        placeholder="What's going on?"
        multiline
        multilineHeight={140}
        containerStyle={{ marginTop: 14 }}
        testID="contact-message"
      />
      <Text variant="metaSm" color={colors.t4} style={{ marginTop: 4, textAlign: "right" }}>
        {message.length}/{MAX_MESSAGE}
      </Text>

      <View
        style={{
          marginTop: 18,
          padding: 14,
          borderRadius: radius.xl,
          backgroundColor: colors.s3,
        }}
      >
        <Text variant="bodyXs" color={colors.t3}>
          This opens your device&rsquo;s email app with the message above — no
          report content is ever included automatically.
        </Text>
      </View>

      <Button
        label="Send"
        onPress={send}
        loading={opening}
        disabled={!message.trim()}
        style={{ marginTop: 20 }}
        testID="contact-send"
      />
    </ScrollScreen>
  );
}
