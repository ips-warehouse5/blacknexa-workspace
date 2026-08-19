import { Pressable, StyleSheet, Text, View } from "react-native";
import Colors from "@/constants/colors";
import { safeBack } from "@/utils/navigation";
import { fontFamily } from "@/constants/theme";

export default function ModalScreen(): React.ReactElement {
  return (
    <View style={styles.root}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>BlackNexa</Text>
        <Text style={styles.tm}>TM</Text>
      </View>
      <Text style={styles.text}>
        Secure, privacy-first community platform.
      </Text>
      <Text style={styles.legal}>
        BlackNexa™ · Trademark pending with the USPTO. All intellectual
        property and platform content are protected.
      </Text>
      <Pressable style={styles.btn} onPress={() => safeBack()}>
        <Text style={styles.btnText}>Close</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
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
  title: {
    fontSize: 22,
    fontWeight: "700", fontFamily: fontFamily.bold,
    color: Colors.text,
  },
  tm: {
    fontSize: 10,
    fontWeight: "700", fontFamily: fontFamily.bold,
    color: Colors.gold,
    marginTop: 3,
    letterSpacing: 0.5,
  },
  legal: {
    fontSize: 10,
    color: Colors.textMuted,
    textAlign: "center",
    marginTop: 14,
    marginBottom: 18,
    paddingHorizontal: 12,
    lineHeight: 14,
  },
  text: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
    marginBottom: 20,
  },
  btn: {
    backgroundColor: Colors.gold,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 999,
  },
  btnText: { color: Colors.background, fontWeight: "700", fontFamily: fontFamily.bold },
});
