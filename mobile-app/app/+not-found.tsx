import { Link, Stack } from "expo-router";
import { Compass } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";
import Colors from "@/constants/colors";
import { fontFamily } from "@/constants/theme";

export default function NotFoundScreen(): React.ReactElement {
  return (
    <>
      <Stack.Screen options={{ title: "Not found" }} />
      <View style={styles.container}>
        <View style={styles.iconWrap}>
          <Compass size={28} color={Colors.gold} />
        </View>
        <Text style={styles.title}>We couldn&apos;t find that page.</Text>
        <Text style={styles.subtitle}>
          The record may have been moved or sealed.
        </Text>
        <Link href="/" style={styles.link}>
          <Text style={styles.linkText}>Back to feed</Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: Colors.gold + "18",
    borderWidth: 1,
    borderColor: Colors.gold + "44",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  title: {
    fontSize: 18,
    fontWeight: "700", fontFamily: fontFamily.bold,
    color: Colors.text,
    marginBottom: 6,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: "center",
    marginBottom: 24,
  },
  link: {
    backgroundColor: Colors.gold,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 999,
  },
  linkText: { color: Colors.background, fontWeight: "700", fontFamily: fontFamily.bold, fontSize: 14 },
});
