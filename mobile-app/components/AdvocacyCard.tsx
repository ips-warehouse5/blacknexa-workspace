import { Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronRight, Megaphone, Phone, ShieldCheck } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import {
  ADVOCACY_ACTION_META,
  type AdvocacyRoute,
} from "@/constants/advocacy";

type Props = {
  routes: AdvocacyRoute[];
  testID?: string;
};

const TONE_BG: Record<string, string> = {
  gold: Colors.gold + "1A",
  crimson: Colors.crimson + "1A",
  emerald: Colors.emerald + "1A",
  sky: Colors.sky + "1A",
};

const TONE_TEXT: Record<string, string> = {
  gold: Colors.gold,
  crimson: Colors.crimson,
  emerald: Colors.emerald,
  sky: Colors.sky,
};

const TONE_BORDER: Record<string, string> = {
  gold: Colors.gold + "55",
  crimson: Colors.crimson + "55",
  emerald: Colors.emerald + "55",
  sky: Colors.sky + "55",
};

function openContact(contact: string) {
  if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
  if (/^1?[-\s]?\d{3}/.test(contact) && !contact.includes(".")) {
    const tel = contact.replace(/[^\d]/g, "");
    Linking.openURL(`tel:${tel}`).catch(() => {});
  } else {
    const url = contact.startsWith("http") ? contact : `https://${contact}`;
    Linking.openURL(url).catch(() => {});
  }
}

export default function AdvocacyCard({ routes, testID }: Props) {
  if (routes.length === 0) return null;

  return (
    <View style={styles.card} testID={testID}>
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Megaphone size={15} color={Colors.gold} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Advocacy routing</Text>
          <Text style={styles.subtitle}>
            BlackNexa™ maps this report to trusted organizations on your behalf.
          </Text>
        </View>
      </View>

      {routes.map((route) => {
        const meta = ADVOCACY_ACTION_META[route.action];
        const tone = meta.tone;
        const canContact = !!route.contact;
        return (
          <Pressable
            key={route.id}
            onPress={() => canContact && openContact(route.contact!)}
            disabled={!canContact}
            style={({ pressed }) => [
              styles.routeRow,
              pressed && canContact && { opacity: 0.85 },
            ]}
            testID={`advocacy-route-${route.id}`}
          >
            <View style={styles.routeLeft}>
              <View
                style={[
                  styles.actionPill,
                  { backgroundColor: TONE_BG[tone], borderColor: TONE_BORDER[tone] },
                ]}
              >
                {route.action === "SEND_CRISIS_ALERT" ? (
                  <ShieldCheck size={12} color={TONE_TEXT[tone]} />
                ) : canContact && /^1?[-\s]?\d{3}/.test(route.contact!) ? (
                  <Phone size={12} color={TONE_TEXT[tone]} />
                ) : (
                  <Megaphone size={12} color={TONE_TEXT[tone]} />
                )}
                <Text style={[styles.actionPillText, { color: TONE_TEXT[tone] }]}>
                  {meta.label}
                </Text>
              </View>
              <Text style={styles.triggerTag}>{route.triggerTag}</Text>
            </View>

            <View style={styles.routeBody}>
              <Text style={styles.targetOrg}>{route.targetOrg}</Text>
              <Text style={styles.rationale}>{route.rationale}</Text>
              {canContact && (
                <Text style={styles.contact}>{route.contact}</Text>
              )}
            </View>

            {canContact && (
              <View style={styles.chevron}>
                <ChevronRight size={16} color={Colors.textMute} />
              </View>
            )}
          </Pressable>
        );
      })}

      <Text style={styles.disclaimer}>
        Routing is opt-in. No data leaves your device until you approve a contact.
        BlackNexa™ is a trademark pending with the USPTO.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
  },
  headerIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: Colors.gold + "1A",
    borderWidth: 1,
    borderColor: Colors.gold + "44",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 14,
    fontWeight: "800",
    color: Colors.text,
    letterSpacing: 0.2,
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 11.5,
    color: Colors.textDim,
    lineHeight: 16,
  },
  routeRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  routeLeft: {
    width: 96,
    gap: 6,
    paddingRight: 4,
  },
  actionPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  actionPillText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  triggerTag: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.textMute,
    letterSpacing: 0.6,
  },
  routeBody: {
    flex: 1,
  },
  targetOrg: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.text,
    marginBottom: 3,
  },
  rationale: {
    fontSize: 12,
    color: Colors.textDim,
    lineHeight: 17,
    marginBottom: 4,
  },
  contact: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.gold,
  },
  chevron: {
    paddingTop: 2,
  },
  disclaimer: {
    fontSize: 10.5,
    color: Colors.textMute,
    lineHeight: 15,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
});
