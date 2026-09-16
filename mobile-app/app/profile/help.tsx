/**
 * H3 · Help & FAQ.
 *
 * The board specifies a searchable, categorised FAQ. No backend content
 * API exists for this, and none is warranted for what is fundamentally
 * static help copy — this is the honest "static details pass" case from
 * the task's own instruction: real UI, real (if fixed) content, no fake
 * network round-trip pretending to fetch what is actually hardcoded.
 */

import React, { useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { ChevronDown } from "lucide-react-native";
import { alpha, colors, radius, screenPadding } from "@/constants/theme";
import Text from "@/components/ui/Text";
import Button from "@/components/ui/Button";
import { ScrollScreen, BackHeader } from "@/components/ui/Screen";

const FAQS: { question: string; answer: string }[] = [
  {
    question: "Who can see a report I file?",
    answer:
      "Whatever you chose under Privacy & sharing at the time you filed it — Public, Trusted Circle, or Private. Changing the setting later doesn't change reports you've already filed.",
  },
  {
    question: "Can I file a report anonymously?",
    answer:
      "Yes. Turn on \"Stay anonymous\" under Privacy & sharing, or per-report while filing. Your name is withheld from anyone who isn't a moderator.",
  },
  {
    question: "What happens to my evidence?",
    answer:
      "Photos, video and audio are sealed the moment they're uploaded, so a later change would show. Only you and a moderator reviewing that specific report can open the originals.",
  },
  {
    question: "How do I delete my account?",
    answer:
      "Settings → Account → Delete account. You'll choose whether reports you filed stay as anonymous public records or are fully removed, and you'll need to confirm with your password (or an emailed code for Google/Apple-only accounts).",
  },
  {
    question: "Does BlackNexa work without a signal?",
    answer:
      "Crisis line listings are cached for offline use. Filing a new report, and most other network activity, needs a connection.",
  },
  {
    question: "How accurate is my location in a report?",
    answer:
      "You choose per report: Exact, ~500 m, or hidden entirely. The default for new reports is set under Privacy & sharing.",
  },
];

export default function HelpScreen(): React.ReactElement {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <ScrollScreen padding={screenPadding.detail} testID="profile-help">
      <BackHeader title="Help & FAQ" onBack={() => router.back()} padding={0} />

      <View style={{ marginTop: 18, gap: 10 }}>
        {FAQS.map((item, index) => {
          const open = openIndex === index;
          return (
            <View
              key={item.question}
              style={{
                backgroundColor: colors.s3,
                borderRadius: radius.xl,
                padding: 15,
              }}
            >
              <Pressable
                onPress={() => setOpenIndex(open ? null : index)}
                accessibilityRole="button"
                accessibilityLabel={item.question}
                accessibilityState={{ expanded: open }}
                style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
              >
                <Text variant="labelLg" color={colors.t0} style={{ flex: 1 }}>
                  {item.question}
                </Text>
                <ChevronDown
                  size={16}
                  color={colors.t3}
                  style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }}
                />
              </Pressable>
              {open ? (
                <Text
                  variant="bodySm"
                  color={colors.t2}
                  style={{ marginTop: 10, lineHeight: 20 }}
                >
                  {item.answer}
                </Text>
              ) : null}
            </View>
          );
        })}
      </View>

      <View
        style={{
          marginTop: 22,
          padding: 16,
          borderRadius: radius.xl,
          backgroundColor: colors.s2,
          borderWidth: 1,
          borderColor: alpha(colors.t0, 0.08),
        }}
      >
        <Text variant="labelLg" color={colors.t0}>
          Still stuck?
        </Text>
        <Text variant="bodySm" color={colors.t2} style={{ marginTop: 6 }}>
          Reach out and we&rsquo;ll get back to you.
        </Text>
        <Button
          label="Contact us"
          variant="secondary"
          onPress={() => router.push("/profile/contact")}
          style={{ marginTop: 14 }}
          testID="help-contact"
        />
      </View>
    </ScrollScreen>
  );
}
