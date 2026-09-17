/**
 * Profile → Delete account. `DERIVED`.
 *
 * Required by both app stores and by GDPR, and not in the design at all.
 *
 * ── The one real product question ──────────────────────────────────────────
 * What happens to the reports someone filed? Erasing them destroys community
 * record that other people have corroborated and stood with; keeping them attached
 * to a deleted account is not deletion at all. So the owner chooses, and the choice
 * is presented as two consequences rather than as a checkbox:
 *
 *   • Keep them as anonymous record — the identity link is severed, the account is
 *     gone, and what the community built stays.
 *   • Erase them — everything goes, including corroborations.
 *
 * The first is offered first because it preserves the thing the app exists for, but
 * neither is preselected: this is not a decision to make on someone's behalf.
 *
 * ── Two gates, not one ────────────────────────────────────────────────────
 * A typed confirmation *and* re-authentication. The typed word stops a mis-tap; it
 * does nothing against a borrowed unlocked phone, which is exactly the threat this
 * app's users live with. So the account's own credential is asked for again —
 * a password where there is one, an emailed code where sign-in is Apple or Google.
 *
 * ── Afterwards ────────────────────────────────────────────────────────────
 * The server returns a receipt, and the screen shows it before signing out. "Done"
 * would leave someone who chose to keep their reports wondering whether they
 * actually survived.
 */

import React, { useCallback, useState } from "react";
import { Keyboard, View } from "react-native";
import { router } from "expo-router";
import { alpha, colors, radius, screenPadding, useThemeSync } from "@/constants/theme";
import Text from "@/components/ui/Text";
import Button, { TextButton } from "@/components/ui/Button";
import TextField, { PasswordField } from "@/components/ui/TextField";
import OtpInput, { ResendTimer, useCountdown } from "@/components/ui/OtpInput";
import { ScrollScreen, BackHeader } from "@/components/ui/Screen";
import { ConsequenceCard, SectionLabel } from "@/components/report/WizardShell";
import { useAuth } from "@/providers/AuthProvider";
import { useSnackbar } from "@/providers/SnackbarProvider";
import authApi, { type DeletionReceipt } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";

type Disposition = "sever" | "erase";

const CONFIRM_WORD = "DELETE";

export default function DeleteAccountScreen(): React.ReactElement {
  useThemeSync();
  const { user, forgetSession } = useAuth();
  const { showSnackbar } = useSnackbar();

  /*
   * An account created through Apple or Google has no password to re-type, so it
   * confirms with a code instead. `hasPassword` comes from the profile rather than
   * being guessed from the sign-in method, because someone can set a password on a
   * social account later and then genuinely has one.
   */
  const usesCode = user?.hasPassword === false;

  const [disposition, setDisposition] = useState<Disposition | null>(null);
  const [typed, setTyped] = useState("");
  const [wordError, setWordError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const { secondsRemaining, restart } = useCountdown(0);
  const [sendingCode, setSendingCode] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<DeletionReceipt | null>(null);

  const sendCode = useCallback(async () => {
    Keyboard.dismiss();
    setSendingCode(true);
    setProblem(null);
    try {
      await authApi.requestDeletionCode();
      setCodeSent(true);
      restart(30);
    } catch (err) {
      showSnackbar({
        message: err instanceof ApiError ? err.message : "We could not send that code. Please try again.",
        type: "error",
      });
    } finally {
      setSendingCode(false);
    }
  }, [restart, showSnackbar]);

  const submit = useCallback(async () => {
    Keyboard.dismiss();
    setProblem(null);
    setWordError(null);

    if (!disposition) {
      setProblem("Please choose what happens to the reports you filed.");
      return;
    }
    // Case-sensitive on purpose: the label asks for capital letters
    // specifically, so lowercase or mixed-case input should not pass.
    // Shown on the field itself (not the bottom banner) so the error sits
    // next to the exact input it's about.
    if (typed.trim() !== CONFIRM_WORD) {
      setWordError(
        typed.trim().length === 0
          ? `Please type ${CONFIRM_WORD} in capital letters to confirm.`
          : `That doesn't match. Please type ${CONFIRM_WORD} in capital letters to confirm.`,
      );
      return;
    }
    if (usesCode ? code.length < 6 : password.length === 0) {
      setProblem(
        usesCode
          ? "Please enter the six-digit code we emailed you."
          : "Please enter your password to confirm it's you.",
      );
      return;
    }

    setBusy(true);
    try {
      const result = await authApi.deleteAccount({
        disposition,
        ...(usesCode ? { code } : { password }),
      });
      // Shown before the sign-out, so the receipt is not lost behind a redirect.
      setReceipt(result);
    } catch (err) {
      showSnackbar({
        message:
          err instanceof ApiError
            ? err.message
            : "Something went wrong and nothing was deleted. Please try again.",
        type: "error",
      });
    } finally {
      setBusy(false);
    }
  }, [disposition, typed, usesCode, code, password, showSnackbar]);

  const finishDeletion = useCallback(() => {
    // forgetSession() clears auth state, but navigation from there depends
    // on AuthGate's own effect reacting to that state change — an extra
    // AsyncStorage read and a segment-string match away. Driving the
    // destination directly here means "Close" always lands on Welcome, not
    // whatever AuthGate happens to resolve to.
    forgetSession();
    router.replace("/(auth)/welcome");
  }, [forgetSession]);

  if (receipt) {
    return <DeletionReceiptScreen receipt={receipt} onDone={finishDeletion} />;
  }

  return (
    <ScrollScreen
      padding={screenPadding.detail}
      testID="profile-account"
      footer={
        <View>
          {problem ? (
            <Text variant="metaSm" color={colors.bad2} style={{ marginBottom: 10, lineHeight: 18 }}>
              {problem}
            </Text>
          ) : null}
          <Button
            label="Delete my account"
            variant="destructive"
            onPress={submit}
            loading={busy}
            noHaptics
            testID="confirm-delete-account"
          />
        </View>
      }
    >
      <BackHeader title="Delete account" onBack={() => router.back()} padding={0} />

      <View style={styles.warning}>
        <Text variant="labelSm" color={colors.bad2}>
          This cannot be undone
        </Text>
        <Text variant="bodyXs" color={colors.t2} style={{ marginTop: 5, lineHeight: 19 }}>
          {`Your account (${user?.email ?? ""}), your drafts, your comments and your saved settings are deleted. Every device is signed out.`}
        </Text>
      </View>

      <SectionLabel style={{ marginTop: 22 }}>THE REPORTS YOU FILED</SectionLabel>
      <View style={{ gap: 9, marginTop: 10 }}>
        <ConsequenceCard
          title="Keep them as anonymous record"
          consequence="The link to you is severed and cannot be restored. The reports stay in the community feed, with the corroborations and comments other people added."
          selected={disposition === "sever"}
          onPress={() => {
            setDisposition("sever");
            setProblem(null);
          }}
          testID="disposition-sever"
        />
        <ConsequenceCard
          title="Erase them too"
          consequence="Every report you filed is removed from the feed, along with its comments and corroborations. Sealed files are destroyed after 30 days."
          selected={disposition === "erase"}
          onPress={() => {
            setDisposition("erase");
            setProblem(null);
          }}
          testID="disposition-erase"
        />
      </View>

      <TextField
        label={`TYPE ${CONFIRM_WORD} TO CONFIRM`}
        value={typed}
        onChangeText={(next) => {
          setTyped(next);
          setProblem(null);
        }}
        autoCapitalize="characters"
        autoCorrect={false}
        placeholder={CONFIRM_WORD}
        height={50}
        error={wordError}
        hint={`Use capital letters, exactly as shown: ${CONFIRM_WORD}`}
        containerStyle={{ marginTop: 22 }}
        testID="delete-confirm-word"
      />

      {/* The second gate. See the header. */}
      <SectionLabel style={{ marginTop: 24 }}>CONFIRM IT IS YOU</SectionLabel>

      {usesCode ? (
        <View style={{ marginTop: 10 }}>
          <Text variant="bodyXs" color={colors.t2} style={{ lineHeight: 19 }}>
            {codeSent
              ? `We sent a six-digit code to ${user?.email ?? "your email"}.`
              : "You sign in with Apple or Google, so there is no password to re-type. We will email you a code instead."}
          </Text>
          {codeSent ? (
            <View style={{ marginTop: 14 }}>
              <OtpInput
                value={code}
                onChange={(next) => {
                  setCode(next);
                  setProblem(null);
                }}
                length={6}
                testID="delete-confirm-code"
              />
              <ResendTimer
                secondsRemaining={secondsRemaining}
                onResend={sendCode}
                testID="delete-code-resend"
              />
            </View>
          ) : (
            <Button
              label="Email me a code"
              variant="secondary"
              onPress={sendCode}
              loading={sendingCode}
              style={{ marginTop: 12 }}
              testID="request-deletion-code"
            />
          )}
        </View>
      ) : (
        <PasswordField
          label="YOUR PASSWORD"
          value={password}
          onChangeText={(next) => {
            setPassword(next);
            setProblem(null);
          }}
          placeholder="••••••••"
          containerStyle={{ marginTop: 10 }}
          testID="delete-confirm-password"
        />
      )}

      <Text variant="bodyXs" color={colors.t3} style={{ marginTop: 20, lineHeight: 19 }}>
        Prefer to keep the account and just stop using it? Signing out from Profile
        leaves everything intact and nothing is published on your behalf while you
        are away.
      </Text>
    </ScrollScreen>
  );
}

/**
 * The receipt.
 *
 * A separate screen rather than a toast, and with no back route: there is nothing
 * to go back to. The only action closes it and drops the session.
 */
function DeletionReceiptScreen({
  receipt,
  onDone,
}: {
  receipt: DeletionReceipt;
  onDone: () => void;
}): React.ReactElement {
  const kept = receipt.disposition === "sever";
  const total = kept ? receipt.reportsSevered : receipt.reportsErased;

  const lines: string[] = [];
  if (total === 0) {
    lines.push("You had not filed any reports.");
  } else if (kept) {
    lines.push(
      `${total} ${total === 1 ? "report stays" : "reports stay"} in the community feed as anonymous record. The link to you is gone and cannot be restored.`,
    );
  } else {
    lines.push(
      `${total} ${total === 1 ? "report has" : "reports have"} been removed from the feed.`,
    );
    if (receipt.filesPurgedAfter) {
      lines.push("The sealed files are destroyed after 30 days.");
    }
  }
  if (receipt.commentsRemoved > 0) {
    lines.push(
      `${receipt.commentsRemoved} ${receipt.commentsRemoved === 1 ? "comment" : "comments"} removed.`,
    );
  }
  if (receipt.supportsRemoved + receipt.corroborationsRemoved > 0) {
    lines.push("Everything you stood with or corroborated has been withdrawn.");
  }

  return (
    <ScrollScreen
      padding={screenPadding.hero}
      testID="delete-account-receipt"
      footer={
        <Button label="Close" onPress={onDone} testID="deletion-receipt-done" />
      }
    >
      <View style={{ paddingTop: 40 }}>
        <Text variant="displaySm">Your account is gone</Text>
        <View style={{ gap: 10, marginTop: 18 }}>
          {lines.map((line) => (
            <Text key={line} variant="bodySm" color={colors.t2} style={{ lineHeight: 22 }}>
              {line}
            </Text>
          ))}
        </View>
        <View style={styles.receiptNote}>
          <Text variant="bodyXs" color={colors.t2} style={{ lineHeight: 19 }}>
            We have emailed you a copy of this. Your address is not on any list, and
            nothing further is needed from you.
          </Text>
        </View>
        <View style={{ marginTop: 14 }}>
          <TextButton
            label="Read our privacy commitment"
            onPress={() => router.replace("/(auth)/intro")}
          />
        </View>
      </View>
    </ScrollScreen>
  );
}

const styles = {
  warning: {
    backgroundColor: alpha(colors.bad, 0.1),
    borderRadius: radius.md,
    paddingVertical: 13,
    paddingHorizontal: 14,
    marginTop: 18,
  },
  receiptNote: {
    backgroundColor: colors.s3,
    borderRadius: radius.md,
    paddingVertical: 13,
    paddingHorizontal: 14,
    marginTop: 24,
  },
};
