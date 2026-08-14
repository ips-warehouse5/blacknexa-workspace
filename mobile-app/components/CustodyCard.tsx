import { Platform, StyleSheet, Text, View } from "react-native";
import { Fingerprint, Link2, Lock, ShieldCheck } from "lucide-react-native";
import Colors from "@/constants/colors";
import {
  type CustodyEvent,
  CUSTODY_ACTION_LABELS,
  formatCustodyTimestamp,
} from "@/constants/security";

type Props = {
  events: CustodyEvent[];
  rootHash?: string;
  integrityVerified?: boolean;
  testID?: string;
};

export default function CustodyCard({ events, rootHash, integrityVerified, testID }: Props) {
  if (events.length === 0) return null;

  return (
    <View style={styles.card} testID={testID}>
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Fingerprint size={15} color={Colors.gold} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Chain of Custody</Text>
          <Text style={styles.subtitle}>
            Cryptographic audit trail · SHA-256 · AES-256-GCM sealed
          </Text>
        </View>
      </View>

      <View style={styles.integrityRow}>
        <View style={[styles.integrityBadge, integrityVerified !== false && styles.integrityOk]}>
          <ShieldCheck size={11} color={integrityVerified !== false ? Colors.emerald : Colors.crimson} />
          <Text style={[styles.integrityText, { color: integrityVerified !== false ? Colors.emerald : Colors.crimson }]}>
            {integrityVerified !== false ? "Integrity verified" : "Tamper detected"}
          </Text>
        </View>
        <View style={styles.aesBadge}>
          <Lock size={10} color={Colors.violet} />
          <Text style={styles.aesText}>AES-256</Text>
        </View>
      </View>

      <View style={styles.timeline}>
        {events.map((event, i) => {
          const last = i === events.length - 1;
          return (
            <View key={`custody-${i}`} style={styles.tlRow}>
              <View style={styles.tlCol}>
                <View style={styles.tlDot} />
                {!last && <View style={styles.tlLine} />}
              </View>
              <View style={{ flex: 1, paddingBottom: last ? 0 : 12 }}>
                <Text style={styles.tlLabel}>
                  {CUSTODY_ACTION_LABELS[event.action] ?? event.action}
                </Text>
                <Text style={styles.tlTime}>{formatCustodyTimestamp(event.timestamp)}</Text>
                <Text style={styles.tlActor}>{event.actor}</Text>
                {event.eventHash && (
                  <View style={styles.hashRow}>
                    <Link2 size={9} color={Colors.textMute} />
                    <Text style={styles.hashText}>
                      {event.eventHash.slice(0, 16)}…
                    </Text>
                  </View>
                )}
              </View>
            </View>
          );
        })}
      </View>

      {rootHash && (
        <View style={styles.rootRow}>
          <Text style={styles.rootLabel}>Root hash</Text>
          <Text style={styles.rootValue}>{rootHash.slice(0, 24)}…</Text>
        </View>
      )}

      <Text style={styles.disclaimer}>
        Immutable, tamper-evident log. Each event is hash-chained to the previous.
        BlackNexa™ preserves cryptographic proof for legal admissibility.
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
    marginBottom: 12,
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
  integrityRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 14,
  },
  integrityBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: Colors.crimson + "18",
  },
  integrityOk: {
    backgroundColor: Colors.emerald + "18",
  },
  integrityText: {
    fontSize: 10.5,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  aesBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: Colors.violet + "18",
  },
  aesText: {
    fontSize: 10.5,
    fontWeight: "800",
    color: Colors.violet,
    letterSpacing: 0.3,
  },
  timeline: {
    marginTop: 4,
  },
  tlRow: { flexDirection: "row", gap: 12 },
  tlCol: { alignItems: "center", width: 14 },
  tlDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.gold,
    marginTop: 3,
  },
  tlLine: {
    flex: 1,
    width: 2,
    backgroundColor: Colors.border,
    marginTop: 2,
  },
  tlLabel: { fontSize: 13, fontWeight: "700", color: Colors.text },
  tlTime: { fontSize: 11, color: Colors.textDim, marginTop: 1 },
  tlActor: { fontSize: 10.5, color: Colors.textMute, marginTop: 1 },
  hashRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  hashText: {
    fontSize: 9.5,
    color: Colors.textMute,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  rootRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    marginTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  rootLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.textDim,
  },
  rootValue: {
    fontSize: 10.5,
    color: Colors.textMute,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  disclaimer: {
    fontSize: 10.5,
    color: Colors.textMute,
    lineHeight: 15,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
});
