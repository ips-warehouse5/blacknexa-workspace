/**
 * LiveChatSheet — real-time community chat connected to the BlackNexa
 * WebSocket endpoint (/api/v1/blacknexa/live-chat). Messages are broadcast
 * to all connected clients. Uses the native WebSocket API for low-latency
 * messaging with auto-reconnect.
 */
import { Hash, Loader2, Send, Users, X } from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useAuth } from "@/providers/AuthProvider";

const FUNCTIONS_URL = process.env.EXPO_PUBLIC_RORK_FUNCTIONS_URL ?? "";

type ChatMessage = {
  id: string;
  userId: string;
  displayName: string;
  text: string;
  timestamp: string;
  isSelf: boolean;
};

type Props = {
  visible: boolean;
  onClose: () => void;
};

/** Parse an incoming WebSocket message into a ChatMessage. */
function parseIncoming(data: string, selfUserId: string): ChatMessage | null {
  try {
    const parsed = JSON.parse(data) as {
      userId?: string;
      displayName?: string;
      text?: string;
      timestamp?: string;
      type?: string;
    };
    // The backend broadcasts raw text — try to parse as JSON, fall back to plain text.
    const userId = parsed.userId ?? "unknown";
    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      userId,
      displayName: parsed.displayName ?? "Community Member",
      text: parsed.text ?? data,
      timestamp: parsed.timestamp ?? new Date().toISOString(),
      isSelf: userId === selfUserId,
    };
  } catch {
    // Plain text broadcast — create a generic message.
    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      userId: "unknown",
      displayName: "Community Member",
      text: data,
      timestamp: new Date().toISOString(),
      isSelf: false,
    };
  }
}

export default function LiveChatSheet({ visible, onClose }: Props): React.ReactElement {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState<string>("");
  const [connected, setConnected] = useState<boolean>(false);
  const [connecting, setConnecting] = useState<boolean>(false);
  const [moderationNotice, setModerationNotice] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flatListRef = useRef<FlatList<ChatMessage> | null>(null);
  const selfUserId = user?.id ?? `guest_${Date.now().toString(36)}`;
  const selfDisplayName = user?.name ?? "Member";

  /** Establish the WebSocket connection with auto-reconnect. */
  const connect = useCallback(() => {
    if (!FUNCTIONS_URL) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setConnecting(true);
    const wsUrl = FUNCTIONS_URL.replace(/^http/, "ws") + "/api/v1/blacknexa/live-chat";

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        setConnecting(false);
      };

      ws.onmessage = (event: WebSocketMessageEvent) => {
        const raw = typeof event.data === "string" ? event.data : "";
        if (!raw) return;

        // Check for moderation rejection notices from the server.
        try {
          const parsed = JSON.parse(raw) as { type?: string; text?: string };
          if (parsed.type === "moderation-rejected") {
            setModerationNotice(parsed.text ?? "Message blocked by community guidelines.");
            setTimeout(() => setModerationNotice(null), 4000);
            return;
          }
        } catch {
          // Not JSON — proceed as a regular message.
        }

        const msg = parseIncoming(raw, selfUserId);
        if (msg) {
          setMessages((prev) => [...prev.slice(-99), msg]);
        }
      };

      ws.onerror = () => {
        setConnected(false);
        setConnecting(false);
      };

      ws.onclose = () => {
        setConnected(false);
        setConnecting(false);
        // Auto-reconnect after 3 seconds if the sheet is still open.
        if (reconnectRef.current) clearTimeout(reconnectRef.current);
        reconnectRef.current = setTimeout(() => {
          connect();
        }, 3000);
      };
    } catch {
      setConnecting(false);
      setConnected(false);
    }
  }, [selfUserId]);

  // Connect when the sheet opens, disconnect when it closes.
  useEffect(() => {
    if (visible) {
      connect();
    } else {
      if (reconnectRef.current) {
        clearTimeout(reconnectRef.current);
        reconnectRef.current = null;
      }
      wsRef.current?.close();
      wsRef.current = null;
      setConnected(false);
    }
    return () => {
      if (reconnectRef.current) {
        clearTimeout(reconnectRef.current);
        reconnectRef.current = null;
      }
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [visible, connect]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }

    const payload = JSON.stringify({
      userId: selfUserId,
      displayName: selfDisplayName,
      text,
      timestamp: new Date().toISOString(),
    });

    wsRef.current.send(payload);

    // Optimistically add our own message.
    setMessages((prev) => [
      ...prev.slice(-99),
      {
        id: `${Date.now()}-self`,
        userId: selfUserId,
        displayName: selfDisplayName,
        text,
        timestamp: new Date().toISOString(),
        isSelf: true,
      },
    ]);
    setInput("");
  }, [input, selfUserId, selfDisplayName]);

  const renderItem = useCallback(({ item }: { item: ChatMessage }) => (
    <View style={[styles.msgRow, item.isSelf && styles.msgRowSelf]}>
      <View style={[styles.msgBubble, item.isSelf && styles.msgBubbleSelf]}>
        {!item.isSelf && (
          <Text style={styles.msgAuthor}>{item.displayName}</Text>
        )}
        <Text style={[styles.msgText, item.isSelf && styles.msgTextSelf]}>
          {item.text}
        </Text>
        <Text style={[styles.msgTime, item.isSelf && styles.msgTimeSelf]}>
          {new Date(item.timestamp).toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
          })}
        </Text>
      </View>
    </View>
  ), []);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom }]}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <Hash size={18} color={Colors.gold} />
              <View>
                <Text style={styles.title}>Community Live Chat</Text>
                <View style={styles.statusRow}>
                  <View style={[styles.statusDot, connected ? styles.statusDotOn : styles.statusDotOff]} />
                  <Text style={styles.statusText}>
                    {connecting ? "Connecting…" : connected ? "Live" : "Disconnected"}
                  </Text>
                  {connected && (
                    <View style={styles.usersPill}>
                      <Users size={9} color={Colors.emerald} />
                      <Text style={styles.usersText}>Online</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>
            <Pressable style={styles.closeBtn} onPress={onClose}>
              <X size={18} color={Colors.textDim} />
            </Pressable>
          </View>

          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.msgList}
            onContentSizeChange={() => {
              flatListRef.current?.scrollToEnd({ animated: true });
            }}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>No messages yet</Text>
                <Text style={styles.emptyText}>
                  Be the first to start the conversation.
                </Text>
              </View>
            }
          />

          {moderationNotice ? (
            <View style={styles.moderationBanner}>
              <Text style={styles.moderationText}>{moderationNotice}</Text>
            </View>
          ) : null}

          <View style={styles.inputRow}>
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder="Type a message…"
              placeholderTextColor={Colors.textMute}
              style={styles.textInput}
              editable={connected}
              returnKeyType="send"
              onSubmitEditing={handleSend}
            />
            <Pressable
              onPress={handleSend}
              disabled={!connected || !input.trim()}
              style={[styles.sendBtn, (!connected || !input.trim()) && styles.sendBtnDisabled]}
            >
              <Send size={16} color={Colors.bg} />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)" },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    flex: 0.85,
    paddingTop: 10,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: "center",
    marginBottom: 14,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  title: { fontSize: 17, fontWeight: "800", color: Colors.text },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 3,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusDotOn: { backgroundColor: Colors.emerald },
  statusDotOff: { backgroundColor: Colors.textMute },
  statusText: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.textDim,
  },
  usersPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: Colors.emerald + "1A",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  usersText: {
    fontSize: 9,
    fontWeight: "800",
    color: Colors.emerald,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: Colors.surface2,
    alignItems: "center",
    justifyContent: "center",
  },
  msgList: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    flexGrow: 1,
  },
  msgRow: {
    marginBottom: 10,
    alignItems: "flex-start",
  },
  msgRowSelf: {
    alignItems: "flex-end",
  },
  msgBubble: {
    maxWidth: "82%",
    backgroundColor: Colors.surface2,
    borderRadius: 16,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  msgBubbleSelf: {
    backgroundColor: Colors.gold + "1F",
    borderColor: Colors.gold + "44",
  },
  msgAuthor: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.gold,
    marginBottom: 4,
  },
  msgText: {
    fontSize: 14,
    color: Colors.text,
    lineHeight: 19,
    fontWeight: "500",
  },
  msgTextSelf: {
    color: Colors.text,
  },
  msgTime: {
    fontSize: 9,
    color: Colors.textMute,
    marginTop: 4,
    fontWeight: "500",
  },
  msgTimeSelf: {
    color: Colors.textMute,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    gap: 6,
  },
  emptyTitle: { fontSize: 15, fontWeight: "700", color: Colors.text },
  emptyText: { fontSize: 13, color: Colors.textDim },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  textInput: {
    flex: 1,
    backgroundColor: Colors.surface2,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: Colors.text,
    fontSize: 14,
    fontWeight: "500",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.gold,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: { opacity: 0.4 },
  moderationBanner: {
    backgroundColor: Colors.crimson + "1A",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginHorizontal: 16,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: Colors.crimson + "33",
  },
  moderationText: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.crimson,
    textAlign: "center",
  },
});
