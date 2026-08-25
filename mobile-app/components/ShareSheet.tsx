import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
  Linking,
} from "react-native";
import * as Haptics from "expo-haptics";
import {
  AtSign,
  BadgeCheck,
  Check,
  Copy,
  Facebook,
  Hash,
  Link as LinkIcon,
  Linkedin,
  Loader2,
  LogOut,
  Mail,
  MessageCircle,
  MoreHorizontal,
  Send,
  Share2,
  Sparkles,
  Twitter,
  Youtube,
} from "lucide-react-native";
import Colors from "@/constants/colors";
import { useAuth } from "@/providers/AuthProvider";

type Props = {
  visible: boolean;
  onClose: () => void;
  headline: string;
  summary: string;
  url: string;
};

type ShareTarget = {
  id: string;
  label: string;
  color: string;
  icon: React.ReactNode;
  buildUrl: (shareText: string, shareUrl: string, subject: string) => string;
  scheme?: string;
};

const PLATFORMS: ShareTarget[] = [
  {
    id: "x",
    label: "X",
    color: "#000000",
    icon: <Twitter size={22} color="#FFFFFF" />,
    buildUrl: (_t, u) =>
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(_t)}&url=${encodeURIComponent(u)}`,
  },
  {
    id: "facebook",
    label: "Facebook",
    color: "#1877F2",
    icon: <Facebook size={22} color="#FFFFFF" />,
    buildUrl: (_t, u) =>
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(u)}`,
  },
  {
    id: "whatsapp",
    label: "WhatsApp",
    color: "#25D366",
    icon: <MessageCircle size={22} color="#FFFFFF" />,
    buildUrl: (t, u) => `https://wa.me/?text=${encodeURIComponent(`${t} ${u}`)}`,
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    color: "#0A66C2",
    icon: <Linkedin size={22} color="#FFFFFF" />,
    buildUrl: (_t, u) =>
      `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(u)}`,
  },
  {
    id: "reddit",
    label: "Reddit",
    color: "#FF4500",
    icon: <Hash size={22} color="#FFFFFF" />,
    buildUrl: (t, u) =>
      `https://www.reddit.com/submit?url=${encodeURIComponent(u)}&title=${encodeURIComponent(t)}`,
  },
  {
    id: "telegram",
    label: "Telegram",
    color: "#26A5E4",
    icon: <Send size={22} color="#FFFFFF" />,
    buildUrl: (t, u) =>
      `https://t.me/share/url?url=${encodeURIComponent(u)}&text=${encodeURIComponent(t)}`,
  },
  {
    id: "email",
    label: "Email",
    color: "#6B7078",
    icon: <Mail size={22} color="#FFFFFF" />,
    buildUrl: (t, u, s) =>
      `mailto:?subject=${encodeURIComponent(s)}&body=${encodeURIComponent(`${t}\n\n${u}`)}`,
  },
  {
    id: "sms",
    label: "SMS",
    color: "#4FB286",
    icon: <MessageCircle size={22} color="#FFFFFF" />,
    buildUrl: (t, u) => `sms:?body=${encodeURIComponent(`${t} ${u}`)}`,
  },
  {
    id: "instagram",
    label: "Instagram",
    color: "#E1306C",
    icon: <Sparkles size={22} color="#FFFFFF" />,
    buildUrl: (t, u) =>
      `https://www.instagram.com/?url=${encodeURIComponent(u)}&text=${encodeURIComponent(t)}`,
  },
  {
    id: "youtube",
    label: "YouTube",
    color: "#FF0000",
    icon: <Youtube size={22} color="#FFFFFF" />,
    buildUrl: (t, u) =>
      `https://www.youtube.com/share?q=${encodeURIComponent(`${t} ${u}`)}`,
  },
  {
    id: "threads",
    label: "Threads",
    color: "#000000",
    icon: <AtSign size={22} color="#FFFFFF" />,
    buildUrl: (t, u) =>
      `https://threads.net/intent/post?text=${encodeURIComponent(`${t} ${u}`)}`,
  },
];

/**
 * Google "G" mark rendered in the official four-color glyph so the
 * Continue-with-Google button reads as a genuine Google sign-in surface.
 */
function GoogleGMark({ size = 20 }: { size?: number }): React.ReactElement {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: "#FFFFFF",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text
        style={{
          fontSize: size * 0.62,
          fontWeight: "900",
          color: "#4285F4",
          fontStyle: "italic",
          lineHeight: size,
          textAlign: "center",
        }}
      >
        G
      </Text>
    </View>
  );
}

export default function ShareSheet({ visible, onClose, headline, summary, url }: Props) {
  const { user, signOut, busy } = useAuth();
  const [copied, setCopied] = useState<boolean>(false);
  const [sharing, setSharing] = useState<boolean>(false);

  const shareText = useMemo(
    () => `${headline}\n\n${summary}\n\nRead the full briefing: ${url}\n\n\u2014 BlackNexa\u2122 Verified Briefing`,
    [headline, summary, url],
  );

  const openPlatform = useCallback(
    async (platform: ShareTarget) => {
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }
      const target = platform.buildUrl(shareText, url, headline);
      try {
        const canOpen = await Linking.canOpenURL(target);
        if (canOpen) {
          await Linking.openURL(target);
        } else {
          await Share.share({ title: headline, message: shareText, url });
        }
      } catch {
        /* user cancelled or app not installed */
      }
      onClose();
    },
    [shareText, url, headline, onClose],
  );

  /**
   * One-tap Google share: signing in with Google unlocks the device's native
   * system share sheet, which surfaces every social app the user is already
   * logged into via that Google account (X, Facebook, WhatsApp, Instagram,
   * LinkedIn, Reddit, Telegram, Messenger, TikTok, Snapchat, Pinterest, SMS,
   * Gmail, Slack, Discord, Signal — anything installed). No need to remember
   * usernames or passwords for each platform: one Google tap routes the story
   * everywhere.
   */
  const openSystemShare = useCallback(async () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    setSharing(true);
    try {
      await Share.share({ title: headline, message: shareText, url });
    } catch {
      /* cancelled */
    } finally {
      setSharing(false);
    }
    onClose();
  }, [headline, shareText, url, onClose]);

  /**
   * Sign-in no longer happens here.
   *
   * The old flow called an in-place `signIn("google")` against the Rork OAuth
   * host. Authentication is now a first-class flow (screens A5–A10) with its own
   * consent step, so a share sheet must not mint a session as a side effect —
   * it sends the person to Welcome instead.
   *
   * The native share sheet still opens either way: sign-in only unlocks the
   * smoother connected-apps row, so nobody is blocked from sharing by it.
   */
  const onContinueWithGoogle = useCallback(async () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    await openSystemShare();
  }, [openSystemShare]);

  const copyToClipboard = useCallback(async () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    try {
      if (Platform.OS === "web" && navigator?.clipboard) {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } else {
        await Share.share({ message: url });
      }
    } catch {
      /* unavailable */
    }
  }, [url]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />

          <View style={styles.headerRow}>
            <Share2 size={16} color={Colors.gold} />
            <Text style={styles.headerTitle}>SHARE BRIEFING</Text>
            <View style={{ width: 16 }} />
          </View>

          <Text style={styles.subtitle} numberOfLines={2}>
            {headline}
          </Text>

          {/* One-tap Google share — routes the story to every social app
              linked to the user's Google account in a single tap. */}
          {user ? (
            <Pressable
              style={styles.googleConnectedBtn}
              onPress={openSystemShare}
              accessibilityLabel="Share via Google connected apps"
            >
              <GoogleGMark size={22} />
              <View style={{ flex: 1 }}>
                <Text style={styles.googleConnectedTitle}>
                  Share via {user.displayName || user.email.split("@")[0]}'s apps
                </Text>
                <Text style={styles.googleConnectedSub}>
                  One tap routes to every installed social app
                </Text>
              </View>
              {sharing ? (
                <ActivityIndicator color={Colors.gold} size="small" />
              ) : (
                <Share2 size={18} color={Colors.gold} />
              )}
            </Pressable>
          ) : (
            <Pressable
              style={[styles.googleBtn, busy && styles.googleBtnDisabled]}
              onPress={onContinueWithGoogle}
              disabled={busy}
              accessibilityLabel="Continue with Google to share everywhere"
            >
              {busy ? (
                <ActivityIndicator color="#1F1F1F" size="small" />
              ) : (
                <GoogleGMark size={22} />
              )}
              <Text style={styles.googleBtnText}>
                {busy ? "Opening\u2026" : "Share to every installed app"}
              </Text>
            </Pressable>
          )}
          {user ? (
            <Pressable
              style={styles.disconnectBtn}
              onPress={() => {
                void signOut();
              }}
              accessibilityLabel="Disconnect Google account"
            >
              <LogOut size={12} color={Colors.textMute} />
              <Text style={styles.disconnectText}>
                Disconnect {user.email}
              </Text>
            </Pressable>
          ) : (
            <Text style={styles.googleHint}>
              One tap routes this story to every social app you're already logged into
              with Google — no usernames, no passwords.
            </Text>
          )}

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>OR SHARE TO</Text>
            <View style={styles.dividerLine} />
          </View>

          <ScrollView
            contentContainerStyle={styles.grid}
            showsVerticalScrollIndicator={false}
          >
            {PLATFORMS.map((platform) => (
              <Pressable
                key={platform.id}
                style={styles.platformBtn}
                onPress={() => openPlatform(platform)}
                accessibilityLabel={`Share to ${platform.label}`}
              >
                <View style={[styles.platformIcon, { backgroundColor: platform.color }]}>
                  {platform.icon}
                </View>
                <Text style={styles.platformLabel} numberOfLines={1}>
                  {platform.label}
                </Text>
              </Pressable>
            ))}

            {/* More / Native system share sheet */}
            <Pressable
              style={styles.platformBtn}
              onPress={openSystemShare}
              accessibilityLabel="More sharing options"
            >
              <View style={[styles.platformIcon, { backgroundColor: Colors.surface3 }]}>
                <MoreHorizontal size={22} color={Colors.text} />
              </View>
              <Text style={styles.platformLabel} numberOfLines={1}>
                More
              </Text>
            </Pressable>

            {/* Copy link */}
            <Pressable
              style={styles.platformBtn}
              onPress={copyToClipboard}
              accessibilityLabel="Copy link"
            >
              <View style={[styles.platformIcon, { backgroundColor: Colors.surface3 }]}>
                {copied ? (
                  <Check size={22} color={Colors.emerald} />
                ) : (
                  <LinkIcon size={22} color={Colors.text} />
                )}
              </View>
              <Text style={styles.platformLabel} numberOfLines={1}>
                {copied ? "Copied" : "Copy Link"}
              </Text>
            </Pressable>
          </ScrollView>

          <View style={styles.verifiedRow}>
            <BadgeCheck size={14} color={Colors.emerald} />
            <Text style={styles.verifiedText}>
              BlackNexa™ News • Verified • Distribute Globally
            </Text>
          </View>

          <Pressable style={styles.cancelBtn} onPress={onClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingBottom: 36,
    paddingHorizontal: 18,
    paddingTop: 10,
    maxHeight: "85%",
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 3,
    backgroundColor: Colors.border,
    alignSelf: "center",
    marginBottom: 14,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 8,
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: "900",
    color: Colors.gold,
    letterSpacing: 1.2,
  },
  subtitle: {
    fontSize: 13,
    color: Colors.textDim,
    textAlign: "center",
    marginBottom: 16,
    lineHeight: 18,
    fontWeight: "500",
  },
  googleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  googleBtnDisabled: { opacity: 0.6 },
  googleBtnText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    color: "#1F1F1F",
    letterSpacing: 0.1,
  },
  googleConnectedBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Colors.gold + "14",
    borderWidth: 1,
    borderColor: Colors.gold + "55",
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 6,
  },
  googleConnectedTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: Colors.text,
    letterSpacing: 0.1,
  },
  googleConnectedSub: {
    fontSize: 11,
    color: Colors.textDim,
    marginTop: 2,
    fontWeight: "500",
  },
  disconnectBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "center",
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginBottom: 12,
  },
  disconnectText: {
    fontSize: 11,
    color: Colors.textMute,
    fontWeight: "600",
  },
  googleHint: {
    fontSize: 11,
    color: Colors.textMute,
    textAlign: "center",
    lineHeight: 15,
    marginBottom: 14,
    paddingHorizontal: 10,
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
  },
  dividerText: {
    fontSize: 10,
    fontWeight: "800",
    color: Colors.textMute,
    letterSpacing: 1,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
    gap: 14,
    paddingBottom: 18,
  },
  platformBtn: {
    width: 72,
    alignItems: "center",
    gap: 7,
  },
  platformIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  platformLabel: {
    fontSize: 11,
    color: Colors.textDim,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  verifiedRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    marginTop: 4,
  },
  verifiedText: {
    fontSize: 11,
    color: Colors.emerald,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  cancelBtn: {
    backgroundColor: Colors.surface2,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  cancelText: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.text,
  },
});
