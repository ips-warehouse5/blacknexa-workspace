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
  note,
  safeActionPrimary = false,
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
  note?: string;
  safeActionPrimary?: boolean;
}): React.ReactElement {
  const confirmAction = safeActionPrimary ? (
    <TextButton
      label={confirmLabel}
      color={destructive ? colors.bad2 : colors.t1}
      height={42}
      onPress={onConfirm}
      testID="dialog-confirm"
    />
  ) : (
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
  );
  const cancelAction = safeActionPrimary ? (
    <Button
      label={cancelLabel}
      variant="primary"
      onPress={onCancel}
      height={50}
      style={{ marginTop: 18 }}
      testID="dialog-cancel"
    />
  ) : (
    <TextButton
      label={cancelLabel}
      color={colors.t1}
      height={48}
      onPress={onCancel}
      testID="dialog-cancel"
    />
  );

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

          {note ? (
            <View style={styles.note}>
              <View style={styles.noteIcon}>
                <Text variant="metaSm" color={colors.warn} style={styles.noteIconText}>
                  !
                </Text>
              </View>
              <Text variant="metaSm" color={colors.t2} center style={styles.noteText}>
                {note}
              </Text>
            </View>
          ) : null}

          {safeActionPrimary ? (
            <>
              {cancelAction}
              {confirmAction}
            </>
          ) : (
            <>
              {confirmAction}
              {cancelAction}
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: "center", justifyContent: "center" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: alpha(colors.deep, scrim.dialog) },
  dialog: {
    width: "86%",
    maxWidth: 340,
    backgroundColor: colors.s3,
    borderRadius: radius.dialog,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 18,
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
  body: { marginTop: 9, lineHeight: 19 },
  note: {
    marginTop: 18,
    minHeight: 54,
    borderRadius: radius.md,
    backgroundColor: colors.s0,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  noteIcon: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.3,
    borderColor: colors.warn,
    alignItems: "center",
    justifyContent: "center",
  },
  noteIconText: {
    fontSize: 11,
    lineHeight: 13,
  },
  noteText: {
    flex: 1,
    lineHeight: 16,
  },
});

export default ConfirmDialog;
