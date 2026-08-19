import {
  Bell,
  ChevronRight,
  Download,
  EyeOff,
  FileText,
  Fingerprint,
  HelpCircle,
  KeyRound,
  LogOut,
  MapPinOff,
  ScrollText,
  ShieldCheck,
  Stamp,
  UserCog,
} from "lucide-react-native";
import { router } from "expo-router";
import React from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import BrandMark from "@/components/BrandMark";
import TippingDashboard from "@/components/TippingDashboard";
import { useIncidents } from "@/providers/IncidentsProvider";
import { useSettings, type Settings } from "@/providers/SettingsProvider";
import { useAuth } from "@/providers/AuthProvider";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQueryClient } from "@tanstack/react-query";
import { fontFamily } from "@/constants/theme";

export default function ProfileScreen(): React.ReactElement {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { signOut: authSignOut } = useAuth();
  const { myIncidents, incidents } = useIncidents();
  const { settings, update, updateMany } = useSettings();

  const setupVaultPin = React.useCallback(() => {
    Alert.prompt?.(
      settings.vaultPinSet ? "Change vault PIN" : "Set vault PIN",
      settings.vaultPinSet
        ? "Enter a new PIN to re-encrypt your vault. Previous evidence sealed with the old PIN will remain encrypted with it."
        : "Create a PIN to enable zero-knowledge encryption. Your evidence will be sealed with AES-256-GCM. Neither BlackNexa nor any server can decrypt without this PIN.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Save",
          onPress: (val?: string) => {
            const pin = (val ?? "").trim();
            if (pin.length < 4) {
              Alert.alert("PIN too short", "Use at least 4 characters for adequate security.");
              return;
            }
            updateMany({ vaultPin: pin, vaultPinSet: true });
            Alert.alert(
              "Vault secured",
              settings.vaultPinSet
                ? "Your vault PIN has been updated. New evidence will be sealed with this PIN."
                : "Your vault is now encrypted. Evidence will be sealed with AES-256-GCM on capture. Keep your PIN safe — it cannot be recovered."
            );
          },
        },
      ],
      "secure-text",
      ""
    );
    if (!Alert.prompt) {
      Alert.alert(
        "Vault PIN",
        "PIN setup requires a secure text input. This will be available in the next release."
      );
    }
  }, [settings.vaultPinSet, updateMany]);

  const editProfile = React.useCallback(() => {
    Alert.prompt?.(
      "Edit display name",
      "How should the community see you?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Save",
          onPress: (val?: string) => {
            const next = (val ?? "").trim();
            if (next.length > 0) update("displayName", next);
          },
        },
      ],
      "plain-text",
      settings.displayName
    );
    if (!Alert.prompt) {
      Alert.alert(
        "Edit profile",
        "Profile editing will be available in the next release."
      );
    }
  }, [settings.displayName, update]);

  const exportData = React.useCallback(async () => {
    const payload = {
      brand: "BlackNexa\u2122",
      exportedAt: new Date().toISOString(),
      profile: { displayName: settings.displayName },
      reports: myIncidents.length,
    };
    try {
      await Share.share({
        title: "BlackNexa data export",
        message: `BlackNexa\u2122 archive\n\n${JSON.stringify(payload, null, 2)}`,
      });
    } catch (e) {
      console.log("[Profile] export error", e);
    }
  }, [settings.displayName, myIncidents.length]);

  const helpSafety = React.useCallback(() => {
    Alert.alert(
      "Help & Safety",
      "Need urgent help? Call 911 if life is in danger. For community support, visit the Support tab for verified legal aid and crisis lines.",
      [{ text: "OK" }]
    );
  }, []);

  const signOut = React.useCallback(() => {
    Alert.alert(
      "Sign out?",
      "Signing out will clear all local records, vault data, cached reports, and preferences. You will need to re-accept the Terms of Service to continue.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign out",
          style: "destructive",
          onPress: async () => {
            try {
              // 1. Instantly navigate to onboarding so no intermediate tab or feed renders
              router.replace("/onboarding");

              // 2. Wipe secure OAuth tokens from SecureStore
              await authSignOut();

              // 3. Clear every single item stored in AsyncStorage
              await AsyncStorage.clear();

              // 4. Reset settings in provider to pristine default state
              await updateMany({
                consentTos: false,
                consentPrivacy: false,
                consentVersion: 0,
                consentTimestamp: null,
                dataProcessingAgreed: false,
                vaultPin: "",
                vaultPinSet: false,
                displayName: "Morgan Thompson",
                preferredLanguage: "en",
              });

              // 5. Purge React Query in-memory cache completely
              qc.clear();
            } catch (e) {
              console.error("[Profile] signOut error:", e);
              await AsyncStorage.clear().catch(() => {});
              qc.clear();
            }
          },
        },
      ]
    );
  }, [authSignOut, updateMany, qc]);

  const totalSupporters = myIncidents.reduce(
    (s, i) => s + i.supporters,
    0
  );
  const reviewedCount = incidents.filter((i) => i.verifications > 0).length;
  const initials = settings.displayName
    .split(/\s+/)
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.background }}
      contentContainerStyle={{
        paddingTop: insets.top + 16,
        paddingBottom: 120 + insets.bottom,
        paddingHorizontal: 16,
      }}
    >
      <BrandMark variant="chip" style={styles.brandChip} testID="profile-brand" />
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials || "BN"}</Text>
        </View>
        <Text style={styles.name}>{settings.displayName}</Text>
        <View style={styles.handleRow}>
          <ShieldCheck size={13} color={Colors.success} />
          <Text style={styles.handle}>Verified · Community Member</Text>
        </View>
      </View>

      <View style={styles.statsRow}>
        <Stat label="Reports" value={myIncidents.length.toString()} />
        <View style={styles.vsep} />
        <Stat label="Supporters" value={totalSupporters.toString()} />
        <View style={styles.vsep} />
        <Stat label="Reviewed" value={reviewedCount.toString()} />
      </View>

      <SectionTitle>Creator Wallet</SectionTitle>
      <TippingDashboard />

      <SectionTitle>Privacy & Security</SectionTitle>
      <View style={styles.card}>
        <LinkRow
          icon={<KeyRound size={18} color={settings.vaultPinSet ? Colors.success : Colors.error} />}
          title="Vault PIN"
          subtitle={
            settings.vaultPinSet
              ? "Configured · AES-256-GCM encryption active"
              : "NOT SET · evidence is unencrypted"
          }
          titleColor={settings.vaultPinSet ? Colors.text : Colors.error}
          onPress={setupVaultPin}
        />
        <Divider />
        <ToggleRow
          icon={<Fingerprint size={18} color={Colors.gold} />}
          title="Biometric unlock"
          subtitle="Require Face ID / fingerprint to open vault"
          value={settings.biometrics}
          settingKey="biometrics"
          onChange={update}
        />
        <Divider />
        <ToggleRow
          icon={<MapPinOff size={18} color={Colors.gold} />}
          title="Redact exact location"
          subtitle="Approximate GPS for all public posts"
          value={settings.redactGps}
          settingKey="redactGps"
          onChange={update}
        />
        <Divider />
        <ToggleRow
          icon={<EyeOff size={18} color={Colors.gold} />}
          title="Anonymous by default"
          subtitle="New reports hide your handle unless changed"
          value={settings.anonymousByDefault}
          settingKey="anonymousByDefault"
          onChange={update}
        />
        <Divider />
        <ToggleRow
          icon={<Stamp size={18} color={Colors.gold} />}
          title="Auto-seal evidence"
          subtitle="Cryptographically timestamp on capture"
          value={settings.autoSeal}
          settingKey="autoSeal"
          onChange={update}
        />
        <Divider />
        <ToggleRow
          icon={<Bell size={18} color={Colors.gold} />}
          title="Push notifications"
          subtitle="Support updates, verifications, advocacy"
          value={settings.notifs}
          settingKey="notifs"
          onChange={update}
        />
      </View>

      <SectionTitle>Account</SectionTitle>
      <View style={styles.card}>
        <LinkRow
          icon={<UserCog size={18} color={Colors.textSecondary} />}
          title="Edit profile"
          onPress={editProfile}
        />
        <Divider />
        <LinkRow
          icon={<Download size={18} color={Colors.textSecondary} />}
          title="Export my data"
          subtitle="Download your full record archive"
          onPress={exportData}
        />
        <Divider />
        <LinkRow
          icon={<HelpCircle size={18} color={Colors.textSecondary} />}
          title="Help & safety"
          onPress={helpSafety}
        />
        <Divider />
        <LinkRow
          icon={<LogOut size={18} color={Colors.error} />}
          title="Sign out"
          titleColor={Colors.error}
          onPress={signOut}
        />
      </View>

      <SectionTitle>Legal</SectionTitle>
      <View style={styles.card}>
        <LinkRow
          icon={<ScrollText size={18} color={Colors.textSecondary} />}
          title="Terms of Service"
          subtitle="How BlackNexa works and your rights"
          onPress={() => router.push("/legal/terms")}
        />
        <Divider />
        <LinkRow
          icon={<FileText size={18} color={Colors.textSecondary} />}
          title="Privacy Policy"
          subtitle="What we collect and how it’s protected"
          onPress={() => router.push("/legal/privacy")}
        />
      </View>

      <Text style={styles.footer}>
        BlackNexa™ v1.0 · Privacy-first by design
      </Text>
      <Text style={styles.legal} testID="legal-tm">
        BlackNexa™ is a trademark of BlackNexa, with an application pending
        before the United States Patent and Trademark Office (USPTO). All
        intellectual property, brand assets, and platform content are
        protected. © {new Date().getFullYear()} BlackNexa. All rights reserved.
      </Text>
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statVal}>{value}</Text>
      <Text style={styles.statLbl}>{label}</Text>
    </View>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

function ToggleRow({
  icon,
  title,
  subtitle,
  value,
  settingKey,
  onChange,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  value: boolean;
  settingKey: keyof Settings;
  onChange: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowIcon}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        {subtitle && <Text style={styles.rowSub}>{subtitle}</Text>}
      </View>
      <Switch
        value={value}
        onValueChange={(v) => onChange(settingKey, v as never)}
        trackColor={{ false: Colors.surface3, true: Colors.gold }}
        thumbColor={Colors.text}
        testID={`toggle-${title}`}
      />
    </View>
  );
}

function LinkRow({
  icon,
  title,
  subtitle,
  titleColor,
  onPress,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  titleColor?: string;
  onPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.row} testID={`link-${title}`}>
      <View style={styles.rowIcon}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowTitle, titleColor && { color: titleColor }]}>
          {title}
        </Text>
        {subtitle && <Text style={styles.rowSub}>{subtitle}</Text>}
      </View>
      <ChevronRight size={18} color={Colors.textMuted} />
    </Pressable>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  brandChip: { alignSelf: "center", marginTop: 4 },
  header: { alignItems: "center", paddingVertical: 20 },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: 24,
    backgroundColor: Colors.surface3,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: Colors.gold,
    marginBottom: 12,
  },
  avatarText: {
    fontSize: 26,
    fontWeight: "700", fontFamily: fontFamily.bold,
    color: Colors.gold,
    letterSpacing: -0.5,
  },
  name: {
    fontSize: 22,
    fontWeight: "700", fontFamily: fontFamily.bold,
    color: Colors.text,
    letterSpacing: -0.4,
    marginBottom: 4,
  },
  handleRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  handle: { fontSize: 12, color: Colors.textSecondary, fontWeight: "600", fontFamily: fontFamily.semiBold },
  statsRow: {
    flexDirection: "row",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingVertical: 16,
    marginVertical: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  stat: { flex: 1, alignItems: "center" },
  statVal: {
    fontSize: 22,
    fontWeight: "700", fontFamily: fontFamily.bold,
    color: Colors.text,
    letterSpacing: -0.4,
  },
  statLbl: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: "600", fontFamily: fontFamily.semiBold,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginTop: 2,
  },
  vsep: { width: 1, backgroundColor: Colors.border },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "700", fontFamily: fontFamily.bold,
    color: Colors.textMuted,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    marginTop: 16,
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  rowTitle: { fontSize: 14, fontWeight: "700", fontFamily: fontFamily.bold, color: Colors.text },
  rowSub: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
    marginLeft: 66,
  },
  footer: {
    textAlign: "center",
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 24,
    fontWeight: "500", fontFamily: fontFamily.medium,
    letterSpacing: 0.3,
  },
  legal: {
    textAlign: "center",
    fontSize: 10,
    lineHeight: 15,
    color: Colors.textMuted,
    marginTop: 10,
    paddingHorizontal: 12,
    fontWeight: "500", fontFamily: fontFamily.medium,
  },
});
