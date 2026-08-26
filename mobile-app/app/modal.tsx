import React from "react";
import { StyleSheet, View } from "react-native";
import { colors, radius } from "@/constants/theme";
import Text from "@/components/ui/Text";
import Button from "@/components/ui/Button";
import { safeBack } from "@/utils/navigation";

export default function ModalScreen(): React.ReactElement {
  return (
    <View style={styles.root}>
      <View style={styles.titleRow}>
        <Text variant="displaySm" color={colors.t0}>BlackNexa</Text>
        <Text variant="eyebrowSm" color={colors.acc} style={styles.tm}>TM</Text>
      </View>
      <Text variant="body" color={colors.t2} center style={styles.text}>
        Secure, privacy-first community platform.
      </Text>
      <Text variant="metaSm" color={colors.t4} center style={styles.legal}>
        BlackNexa™ · Trademark pending with the USPTO. All intellectual
        property and platform content are protected.
      </Text>
      <Button label="Close" onPress={() => safeBack()} style={styles.btn} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 4,
    marginBottom: 8,
  },
  tm: {
    marginTop: 4,
  },
  legal: {
    marginTop: 14,
    marginBottom: 24,
    paddingHorizontal: 12,
  },
  text: {
    marginBottom: 10,
  },
  btn: {
    minWidth: 140,
    borderRadius: radius.lg,
  },
});
