import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import {
  Eye,
  EyeOff,
  Fingerprint,
  KeyRound,
  Lock,
  ShieldCheck,
  Zap,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import Colors from "@/constants/colors";
import { CIPHER_SPEC, KDF_SPEC } from "@/constants/crypto";
import { fontFamily } from "@/constants/theme";

type Props = {
  /** Whether the vault PIN has been set up. */
  vaultPinSet: boolean;
  /** Whether auto-seal is enabled. */
  autoSeal: boolean;
  /** Whether biometric lock is enabled. */
  biometrics: boolean;
  /** Number of sealed evidence files (if viewing an incident). */
  sealedCount?: number;
  /** Cipher spec label. */
  cipherSpec?: string;
  testID?: string;
};

export default function SecurityCard({
  vaultPinSet,
  autoSeal,
  biometrics,
  sealedCount,
  cipherSpec = CIPHER_SPEC,
  testID,
}: Props) {
  const [showPinHint, setShowPinHint] = useState(false);

  const handleTogglePinHint = () => {
    if (Platform.OS !== "web")
      Haptics.selectionAsync().catch(() => {});
    setShowPinHint((v) => !v);
  };

  return (
    <View style={styles.card} testID={testID}>
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Zap size={15} color={Colors.violet} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Zero-Trust Security</Text>
          <Text style={styles.subtitle}>
            Client-side encryption · Server cannot decrypt your evidence
          </Text>
        </View>
      </View>

      <View style={styles.specRow}>
        <View style={styles.specBadge}>
          <Lock size={10} color={Colors.violet} />
          <Text style={styles.specText}>{cipherSpec}</Text>
        </View>
        <View style={styles.specBadge}>
          <KeyRound size={10} color={Colors.gold} />
          <Text style={styles.specText}>{KDF_SPEC}</Text>
        </View>
        <View style={styles.specBadge}>
          <Fingerprint size={10} color={Colors.success} />
          <Text style={styles.specText}>SHA-256</Text>
        </View>
      </View>

      <View style={styles.featureRow}>
        <ShieldCheck
          size={13}
          color={autoSeal ? Colors.success : Colors.textMuted}
        />
        <Text
          style={[
            styles.featureText,
            { color: autoSeal ? Colors.text : Colors.textMuted },
          ]}
        >
          Auto-seal evidence on capture {autoSeal ? "✓" : "(off)"}
        </Text>
      </View>

      <View style={styles.featureRow}>
        <Lock
          size={13}
          color={biometrics ? Colors.success : Colors.textMuted}
        />
        <Text
          style={[
            styles.featureText,
            { color: biometrics ? Colors.text : Colors.textMuted },
          ]}
        >
          Biometric vault lock {biometrics ? "✓" : "(off)"}
        </Text>
      </View>

      <View style={styles.featureRow}>
        <KeyRound
          size={13}
          color={vaultPinSet ? Colors.success : Colors.error}
        />
        <Text
          style={[
            styles.featureText,
            { color: vaultPinSet ? Colors.text : Colors.error },
          ]}
        >
          Vault PIN {vaultPinSet ? "configured ✓" : "NOT SET — evidence not encrypted"}
        </Text>
      </View>

      {!vaultPinSet && (
        <Pressable
          onPress={handleTogglePinHint}
          style={styles.pinHint}
          testID="security-pin-hint"
        >
          <Text style={styles.pinHintTitle}>
            {showPinHint ? "Hide" : "Why do I need a PIN?"}
          </Text>
          {showPinHint && (
            <Text style={styles.pinHintText}>
              Your vault PIN is the key to your encrypted evidence. Without it,
              neither BlackNexa™ nor any server can decrypt your files. Set one
              in Profile → Vault Security. If you forget it, sealed evidence
              cannot be recovered — by design.
            </Text>
          )}
        </Pressable>
      )}

      {sealedCount !== undefined && sealedCount > 0 && (
        <View style={styles.sealedRow}>
          <View style={styles.sealedBadge}>
            <Lock size={11} color={Colors.success} />
            <Text style={styles.sealedText}>
              {sealedCount} file{sealedCount === 1 ? "" : "s"} sealed
            </Text>
          </View>
          <Text style={styles.sealedSubtext}>
            AES-256-GCM · PBKDF2 · Zero-knowledge
          </Text>
        </View>
      )}

      <Text style={styles.disclaimer}>
        Zero-knowledge architecture: encryption keys are derived on-device and
        never transmitted. BlackNexa™ servers store only ciphertext. Even a
        server breach cannot expose your evidence.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
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
    backgroundColor: Colors.violet + "1A",
    borderWidth: 1,
    borderColor: Colors.violet + "44",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 14,
    fontWeight: "700", fontFamily: fontFamily.bold,
    color: Colors.text,
    letterSpacing: 0.2,
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 11.5,
    color: Colors.textSecondary,
    lineHeight: 16,
  },
  specRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 14,
  },
  specBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: Colors.surfaceSecondary,
  },
  specText: {
    fontSize: 10,
    fontWeight: "700", fontFamily: fontFamily.bold,
    color: Colors.textSecondary,
    letterSpacing: 0.3,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 5,
  },
  featureText: {
    fontSize: 12.5,
    fontWeight: "600", fontFamily: fontFamily.semiBold,
    flex: 1,
  },
  pinHint: {
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: Colors.gold + "12",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.gold + "33",
  },
  pinHintTitle: {
    fontSize: 12,
    fontWeight: "700", fontFamily: fontFamily.bold,
    color: Colors.gold,
  },
  pinHintText: {
    fontSize: 11,
    color: Colors.textSecondary,
    lineHeight: 16,
    marginTop: 6,
  },
  sealedRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    marginTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  sealedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: Colors.success + "26",
  },
  sealedText: {
    fontSize: 11,
    fontWeight: "700", fontFamily: fontFamily.bold,
    color: Colors.success,
  },
  sealedSubtext: {
    fontSize: 10,
    color: Colors.textMuted,
    fontWeight: "600", fontFamily: fontFamily.semiBold,
  },
  disclaimer: {
    fontSize: 10.5,
    color: Colors.textMuted,
    lineHeight: 15,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
});
