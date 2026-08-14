/**
 * ArtistTippingSheet — a modal sheet for sending micro-tips to creators
 * via the BlackNexa Artist Tipping engine. Supports low-minimum thresholds,
 * preset amounts, custom amounts, and an optional message.
 *
 * Calls POST /api/v1/blacknexa/artists/tip on the backend ledger.
 */
import { useMutation } from "@tanstack/react-query";
import { Coins, Heart, Loader2, Send, X } from "lucide-react-native";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useAuth } from "@/providers/AuthProvider";

const FUNCTIONS_URL = process.env.EXPO_PUBLIC_RORK_FUNCTIONS_URL ?? "";

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Creator/artist ID to tip. */
  artistId: string;
  /** Display name of the artist. */
  artistName: string;
};

const PRESET_AMOUNTS = [1, 2, 5, 10, 25] as const;
const MIN_TIP_USD = 0.50;

type TipResponse = {
  success: boolean;
  message?: string;
  record?: {
    id: number;
    tipAmountUsd: number;
    timestamp: string;
  };
};

async function sendTip(
  artistId: string,
  supporterUserId: string,
  amount: number,
  message: string
): Promise<TipResponse> {
  const params = new URLSearchParams({
    artist_id: artistId,
    supporter_user_id: supporterUserId,
    tip_amount_usd: String(amount),
    message,
  });
  const res = await fetch(
    `${FUNCTIONS_URL}/api/v1/blacknexa/artists/tip?${params.toString()}`,
    { method: "POST" }
  );
  const json = (await res.json()) as TipResponse;
  if (!res.ok || !json.success) {
    throw new Error(json.message ?? `Tip failed (${res.status}).`);
  }
  return json;
}

export default function ArtistTippingSheet({
  visible,
  onClose,
  artistId,
  artistName,
}: Props): React.ReactElement {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [amount, setAmount] = useState<number>(2);
  const [customAmount, setCustomAmount] = useState<string>("");
  const [message, setMessage] = useState<string>("");
  const [tipError, setTipError] = useState<string | null>(null);

  const tipMutation = useMutation({
    mutationFn: () => {
      const finalAmount = customAmount.trim() ? parseFloat(customAmount) : amount;
      if (isNaN(finalAmount) || finalAmount < MIN_TIP_USD) {
        throw new Error(`Minimum tip is $${MIN_TIP_USD.toFixed(2)}.`);
      }
      const userId = user?.id ?? "anonymous";
      return sendTip(artistId, userId, finalAmount, message.trim());
    },
    onSuccess: (data) => {
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
      const amountStr = customAmount.trim() ? `$${customAmount}` : `$${amount}`;
      Alert.alert(
        "Tip sent!",
        `Your ${amountStr} tip to ${artistName} has been securely processed and credited.`,
        [{ text: "Done", onPress: () => { reset(); onClose(); } }]
      );
    },
    onError: (err: unknown) => {
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      }
      setTipError(err instanceof Error ? err.message : "Tip processing failed.");
    },
  });

  const reset = useCallback(() => {
    setAmount(2);
    setCustomAmount("");
    setMessage("");
    setTipError(null);
  }, []);

  const handleAmountSelect = useCallback((value: number) => {
    if (Platform.OS !== "web") {
      Haptics.selectionAsync().catch(() => {});
    }
    setAmount(value);
    setCustomAmount("");
    setTipError(null);
  }, []);

  const handleSend = useCallback(() => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    setTipError(null);

    const finalAmount = customAmount.trim() ? parseFloat(customAmount) : amount;
    if (isNaN(finalAmount) || finalAmount < MIN_TIP_USD) {
      setTipError(`Minimum tip is $${MIN_TIP_USD.toFixed(2)}.`);
      return;
    }

    const amountLabel = `$${finalAmount.toFixed(2)}`;

    Alert.alert(
      "Confirm Tip",
      `You're about to send ${amountLabel} to ${artistName}. This transaction will be securely processed and logged on the BlackNexa ledger.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm & Send",
          style: "default",
          onPress: () => tipMutation.mutate(),
        },
      ],
      { cancelable: true }
    );
  }, [tipMutation, customAmount, amount, artistName]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: 20 + insets.bottom }]}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <Heart size={18} color={Colors.gold} />
              <Text style={styles.title}>Tip {artistName}</Text>
            </View>
            <Pressable style={styles.closeBtn} onPress={onClose}>
              <X size={18} color={Colors.textDim} />
            </Pressable>
          </View>

          <Text style={styles.subtitle}>
            Support independent creators across the global diaspora. Minimum ${MIN_TIP_USD.toFixed(2)}.
          </Text>

          <Text style={styles.fieldLabel}>Amount (USD)</Text>
          <View style={styles.presetRow}>
            {PRESET_AMOUNTS.map((preset) => {
              const active = amount === preset && !customAmount.trim();
              return (
                <Pressable
                  key={`preset-${preset}`}
                  onPress={() => handleAmountSelect(preset)}
                  style={[styles.presetChip, active && styles.presetChipActive]}
                >
                  <Text style={[styles.presetText, active && styles.presetTextActive]}>
                    ${preset}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.customRow}>
            <Coins size={14} color={Colors.gold} />
            <TextInput
              value={customAmount}
              onChangeText={(text) => {
                const cleaned = text.replace(/[^0-9.]/g, "");
                setCustomAmount(cleaned);
                setAmount(0);
                setTipError(null);
              }}
              placeholder="Custom amount"
              placeholderTextColor={Colors.textMute}
              style={styles.customInput}
              keyboardType="decimal-pad"
              returnKeyType="done"
            />
            <Text style={styles.currencyLabel}>USD</Text>
          </View>

          <Text style={styles.fieldLabel}>Message (optional)</Text>
          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder="Add a word of encouragement…"
            placeholderTextColor={Colors.textMute}
            style={styles.messageInput}
            multiline
            maxLength={200}
            textAlignVertical="top"
          />

          {tipError ? (
            <Text style={styles.errorText}>{tipError}</Text>
          ) : null}

          <Pressable
            onPress={handleSend}
            disabled={tipMutation.isPending}
            style={[styles.sendBtn, tipMutation.isPending && styles.sendBtnDisabled]}
          >
            {tipMutation.isPending ? (
              <>
                <ActivityIndicator size="small" color={Colors.bg} />
                <Text style={styles.sendBtnText}>Processing…</Text>
              </>
            ) : (
              <>
                <Send size={16} color={Colors.bg} />
                <Text style={styles.sendBtnText}>
                  Send ${customAmount.trim() || amount} Tip
                </Text>
              </>
            )}
          </Pressable>

          <Text style={styles.disclaimer}>
            Transactions are logged on the BlackNexa secure ledger. Platform
            maintenance percentage is transparent and displayed in the creator
            dashboard.
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)" },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: "center",
    marginBottom: 14,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { fontSize: 18, fontWeight: "800", color: Colors.text },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: Colors.surface2,
    alignItems: "center",
    justifyContent: "center",
  },
  subtitle: {
    fontSize: 12,
    color: Colors.textDim,
    lineHeight: 17,
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.textDim,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    marginBottom: 8,
    marginTop: 6,
  },
  presetRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  presetChip: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
  },
  presetChipActive: {
    backgroundColor: Colors.gold,
    borderColor: Colors.gold,
  },
  presetText: { fontSize: 14, fontWeight: "700", color: Colors.textDim },
  presetTextActive: { color: Colors.bg, fontWeight: "800" },
  customRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.surface2,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    marginBottom: 6,
  },
  customInput: {
    flex: 1,
    color: Colors.text,
    fontSize: 15,
    fontWeight: "600",
    padding: 0,
  },
  currencyLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.textMute,
  },
  messageInput: {
    backgroundColor: Colors.surface2,
    borderRadius: 12,
    padding: 14,
    color: Colors.text,
    fontSize: 14,
    fontWeight: "500",
    minHeight: 60,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    marginBottom: 14,
  },
  errorText: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.crimson,
    marginBottom: 10,
  },
  sendBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.gold,
    borderRadius: 14,
    paddingVertical: 15,
    marginBottom: 10,
  },
  sendBtnDisabled: { opacity: 0.6 },
  sendBtnText: { fontSize: 15, fontWeight: "800", color: Colors.bg },
  disclaimer: {
    fontSize: 11,
    color: Colors.textMute,
    lineHeight: 15,
  },
});
