/**
 * The centred confirmation dialog, generalised from C11.
 *
 * C11's caption explains both of its distinguishing choices: "A centred dialog, not
 * a sheet, so it doesn't look like the step it interrupts. **The safe choice is the
 * wider target.**"
 *
 * So the cancel row is full-width and sits below the destructive button — the
 * opposite of the platform default, and deliberate. A thumb reaching the bottom of
 * the screen finds "keep", not "delete".
 */

import React from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { alpha, colors, radius, scrim } from "@/constants/theme";
import Text from "@/components/ui/Text";
import Button, { TextButton } from "@/components/ui/Button";

export function ConfirmDialog({
  visible,
  title,
  body,
  confirmLabel,
  cancelLabel = "Cancel",
  destructive = true,
  busy = false,
  onConfirm,
  onCancel,
  icon,
}: {
  visible: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  icon?: React.ReactNode;
}): React.ReactElement {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.root}>
        {/* Tapping outside cancels: the safe outcome is always the easy one. */}
        <Pressable
          style={styles.backdrop}
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel={cancelLabel}
        />

        <View style={styles.dialog} accessibilityViewIsModal accessibilityRole="alert">
          {icon ? <View style={styles.mark}>{icon}</View> : null}

          <Text variant="sectionTitle" color={colors.t0} center style={{ marginTop: icon ? 16 : 0 }}>
            {title}
          </Text>
          <Text variant="bodySm" color={colors.t2} center style={styles.body}>
            {body}
          </Text>

          <Button
            label={confirmLabel}
            variant={destructive ? "destructive" : "primary"}
            onPress={onConfirm}
            loading={busy}
            // The haptic belongs to the outcome, not to committing to it.
            noHaptics={destructive}
            style={{ marginTop: 18 }}
            testID="dialog-confirm"
          />
          <TextButton
            label={cancelLabel}
            color={colors.t1}
            height={48}
            onPress={onCancel}
            testID="dialog-cancel"
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: "center", justifyContent: "center" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: alpha(colors.deep, scrim.dialog) },
  dialog: {
    // Inset 26px, per the C11 artboard.
    marginHorizontal: 26,
    alignSelf: "stretch",
    backgroundColor: colors.s5,
    borderRadius: radius.dialog,
    padding: 22,
  },
  mark: {
    alignSelf: "center",
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    backgroundColor: alpha(colors.bad, 0.14),
    alignItems: "center",
    justifyContent: "center",
  },
  body: { marginTop: 9, lineHeight: 20 },
});

export default ConfirmDialog;
