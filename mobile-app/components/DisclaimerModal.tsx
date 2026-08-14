import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Check, ShieldAlert, X } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import Colors from "@/constants/colors";
import { type Disclaimer, type DisclaimerType } from "@/constants/disclaimers";

type Props = {
  visible: boolean;
  /** Disclaimers to display in this modal. */
  disclaimers: Disclaimer[];
  /** Currently acknowledged disclaimer IDs. */
  acknowledged: Record<DisclaimerType, boolean>;
  /** Called when user toggles a disclaimer acknowledgment. */
  onToggle: (id: DisclaimerType) => void;
  /** Called when user confirms all acknowledgments. */
  onConfirm: () => void;
  /** Called when user dismisses without acknowledging. */
  onDismiss: () => void;
  testID?: string;
};

export default function DisclaimerModal({
  visible,
  disclaimers,
  acknowledged,
  onToggle,
  onConfirm,
  onDismiss,
  testID,
}: Props) {
  const allAcknowledged = disclaimers.every((d) => acknowledged[d.id]);

  const handleToggle = (id: DisclaimerType) => {
    if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
    onToggle(id);
  };

  const handleConfirm = () => {
    if (!allAcknowledged) return;
    if (Platform.OS !== "web")
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    onConfirm();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onDismiss}>
      <View style={styles.container} testID={testID}>
        <View style={styles.header}>
          <View style={styles.headerIcon}>
            <ShieldAlert size={20} color={Colors.gold} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Legal Acknowledgments</Text>
            <Text style={styles.headerSubtitle}>
              Required before dispatch. Please review each section carefully.
            </Text>
          </View>
          <Pressable onPress={onDismiss} hitSlop={10} testID="disclaimer-dismiss">
            <X size={22} color={Colors.textDim} />
          </Pressable>
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {disclaimers.map((disclaimer) => {
            const isAck = acknowledged[disclaimer.id];
            return (
              <View key={disclaimer.id} style={styles.disclaimerCard}>
                <Text style={styles.disclaimerTitle}>{disclaimer.title}</Text>
                <Text style={styles.disclaimerBody}>{disclaimer.body}</Text>
                <Pressable
                  onPress={() => handleToggle(disclaimer.id)}
                  style={styles.ackRow}
                  testID={`ack-${disclaimer.id}`}
                >
                  <View style={[styles.checkBox, isAck && styles.checkBoxOn]}>
                    {isAck && <Check size={14} color={Colors.bg} strokeWidth={3} />}
                  </View>
                  <Text style={[styles.ackText, isAck && styles.ackTextOn]}>
                    I have read and acknowledge this
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </ScrollView>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            {allAcknowledged
              ? "All acknowledgments complete. You can proceed with dispatch."
              : `${disclaimers.filter((d) => !acknowledged[d.id]).length} remaining acknowledgment(s) required.`}
          </Text>
          <Pressable
            onPress={handleConfirm}
            disabled={!allAcknowledged}
            style={[styles.confirmBtn, !allAcknowledged && styles.confirmBtnDisabled]}
            testID="disclaimer-confirm"
          >
            <Text style={[styles.confirmText, !allAcknowledged && styles.confirmTextDisabled]}>
              Confirm & Continue
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.gold + "1A",
    borderWidth: 1,
    borderColor: Colors.gold + "44",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: Colors.text,
    marginBottom: 2,
  },
  headerSubtitle: {
    fontSize: 12,
    color: Colors.textDim,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 18,
  },
  disclaimerCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  disclaimerTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: Colors.gold,
    marginBottom: 10,
  },
  disclaimerBody: {
    fontSize: 12.5,
    color: Colors.text,
    lineHeight: 19,
    marginBottom: 14,
  },
  ackRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  checkBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  checkBoxOn: {
    backgroundColor: Colors.emerald,
    borderColor: Colors.emerald,
  },
  ackText: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.textDim,
    flex: 1,
  },
  ackTextOn: {
    color: Colors.emerald,
  },
  footer: {
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    gap: 12,
  },
  footerText: {
    fontSize: 12,
    color: Colors.textDim,
    textAlign: "center",
  },
  confirmBtn: {
    backgroundColor: Colors.gold,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  confirmBtnDisabled: {
    backgroundColor: Colors.surface3,
  },
  confirmText: {
    fontSize: 15,
    fontWeight: "800",
    color: Colors.bg,
    letterSpacing: 0.3,
  },
  confirmTextDisabled: {
    color: Colors.textMute,
  },
});
