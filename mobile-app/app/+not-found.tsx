import React from "react";
import { Link, Stack } from "expo-router";
import { Compass } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { alpha, colors, radius } from "@/constants/theme";
import Text from "@/components/ui/Text";

export default function NotFoundScreen(): React.ReactElement {
  return (
    <>
      <Stack.Screen options={{ title: "Not found" }} />
      <View style={styles.container}>
        <View style={styles.iconWrap}>
          <Compass size={28} color={colors.acc} />
        </View>
        <Text variant="cardTitle" color={colors.t0} center style={styles.title}>
          We couldn&apos;t find that page.
        </Text>
        <Text variant="body" color={colors.t2} center style={styles.subtitle}>
          The record may have been moved or sealed.
        </Text>
        <Link href="/" style={styles.link}>
          <Text variant="buttonSm" color={colors.onAcc}>Back to feed</Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: colors.s5,
    borderWidth: 1,
    borderColor: alpha(colors.acc, 0.3),
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  title: {
    marginBottom: 6,
  },
  subtitle: {
    marginBottom: 24,
  },
  link: {
    backgroundColor: colors.acc,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: radius.lg,
  },
});
