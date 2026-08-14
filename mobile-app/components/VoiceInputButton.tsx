import { Mic, Loader2, X } from "lucide-react-native";
import React, { useCallback, useRef, useState } from "react";
import { Alert, Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Audio } from "expo-av";
import Colors from "@/constants/colors";
import {
  startVoiceRecording,
  stopVoiceRecordingAndTranscribe,
} from "@/utils/audio";

export type VoiceInputButtonProps = {
  onTranscript: (text: string) => void;
  placeholder?: string;
  /** Larger, more prominent variant for the generation modal. */
  prominent?: boolean;
};

export default function VoiceInputButton({
  onTranscript,
  placeholder = "Tap to speak",
  prominent = false,
}: VoiceInputButtonProps): React.ReactElement {
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isTranscribing, setIsTranscribing] = useState<boolean>(false);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const webRecognitionRef = useRef<{ stop: () => void; abort: () => void } | null>(null);

  const start = useCallback(async () => {
    // Web platform: use the browser's built-in SpeechRecognition API.
    if (Platform.OS === "web") {
      const SR =
        (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition ??
        (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
      if (!SR) {
        Alert.alert(
          "Voice input unsupported",
          "Microphone voice search is not supported on this browser. Please update your browser or use the text field."
        );
        return;
      }
      const recognition = new (SR as new () => {
        lang: string;
        interimResults: boolean;
        maxAlternatives: number;
        onstart: (() => void) | null;
        onresult: ((e: unknown) => void) | null;
        onerror: ((e: { error: string }) => void) | null;
        onend: (() => void) | null;
        start: () => void;
        stop: () => void;
        abort: () => void;
      })();
      recognition.lang = "en-US";
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.onstart = () => setIsRecording(true);
      recognition.onresult = (event: unknown) => {
        const e = event as { results: ArrayLike<ArrayLike<{ transcript: string }>> };
        const transcript = e.results[0]?.[0]?.transcript ?? "";
        if (transcript) {
          onTranscript(transcript);
        } else {
          Alert.alert("Voice input", "No speech was detected. Please try again.");
        }
      };
      recognition.onerror = (event: { error: string }) => {
        setIsRecording(false);
        setIsTranscribing(false);
        if (event.error === "not-allowed") {
          Alert.alert(
            "Microphone permission denied",
            "Please enable microphone access in your browser settings to use voice input."
          );
        } else {
          Alert.alert("Voice input", `Microphone error: ${event.error}`);
        }
      };
      recognition.onend = () => {
        setIsRecording(false);
        setIsTranscribing(false);
        webRecognitionRef.current = null;
      };
      webRecognitionRef.current = recognition;
      try {
        recognition.start();
      } catch {
        Alert.alert("Voice input", "Failed to start speech recognition. Please try again.");
        setIsRecording(false);
        webRecognitionRef.current = null;
      }
      return;
    }

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      const recording = await startVoiceRecording();
      recordingRef.current = recording;
      setIsRecording(true);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Voice input failed";
      if (message.toLowerCase().includes("denied")) {
        Alert.alert(
          "Microphone access needed",
          "BlackNexa needs microphone permission to dictate your briefing topic. Please enable it in Settings.",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Open Settings", onPress: () => void Linking.openSettings() },
          ]
        );
      } else {
        Alert.alert("Microphone", message);
      }
      setIsRecording(false);
      recordingRef.current = null;
    }
  }, []);

  const stop = useCallback(async () => {
    // Web: stop the browser SpeechRecognition session.
    if (Platform.OS === "web") {
      const rec = webRecognitionRef.current;
      if (rec) {
        setIsRecording(false);
        setIsTranscribing(true);
        try {
          rec.stop();
        } catch {
          /* ignore */
        }
      }
      return;
    }

    const recording = recordingRef.current;
    if (!recording) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setIsRecording(false);
    setIsTranscribing(true);

    try {
      const result = await stopVoiceRecordingAndTranscribe(recording);
      if (result.text) {
        onTranscript(result.text);
      } else {
        Alert.alert("Voice input", "No speech was detected. Please try again.");
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Transcription failed";
      Alert.alert("Voice input", message);
    } finally {
      setIsTranscribing(false);
      recordingRef.current = null;
    }
  }, [onTranscript]);

  const cancel = useCallback(async () => {
    if (Platform.OS === "web") {
      const rec = webRecognitionRef.current;
      if (rec) {
        try {
          rec.abort();
        } catch {
          /* ignore */
        }
        webRecognitionRef.current = null;
      }
      setIsRecording(false);
      setIsTranscribing(false);
      return;
    }
    try {
      await recordingRef.current?.stopAndUnloadAsync();
    } catch {
      /* ignore */
    }
    recordingRef.current = null;
    setIsRecording(false);
  }, []);

  if (isTranscribing) {
    return (
      <View style={[styles.root, prominent && styles.rootProminent]}>
        <View style={[styles.iconBtn, prominent && styles.iconBtnProminent, styles.iconBtnBusy]}>
          <Loader2 size={prominent ? 22 : 18} color={Colors.gold} />
        </View>
        <Text style={[styles.label, prominent && styles.labelProminent]}>Transcribing…</Text>
      </View>
    );
  }

  if (isRecording) {
    return (
      <Pressable onPress={stop} style={[styles.root, prominent && styles.rootProminent]}>
        <View style={[styles.iconBtn, prominent && styles.iconBtnProminent, styles.iconBtnRecording]}>
          <X size={prominent ? 22 : 18} color={Colors.bg} />
        </View>
        <Text style={[styles.label, styles.labelRecording, prominent && styles.labelProminent]}>Listening… tap to stop</Text>
      </Pressable>
    );
  }

  return (
    <Pressable onPress={start} style={[styles.root, prominent && styles.rootProminent]}>
      <View style={[styles.iconBtn, prominent && styles.iconBtnProminent]}>
        <Mic size={prominent ? 22 : 18} color={Colors.gold} />
      </View>
      <Text style={[styles.label, prominent && styles.labelProminent]}>{placeholder}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    marginTop: 6,
  },
  rootProminent: {
    alignSelf: "stretch",
    justifyContent: "center",
    gap: 10,
    marginTop: 0,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: Colors.gold + "12",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.gold + "44",
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 999,
    backgroundColor: Colors.gold + "1A",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.gold + "44",
  },
  iconBtnProminent: {
    width: 44,
    height: 44,
    backgroundColor: Colors.gold + "22",
  },
  iconBtnRecording: {
    backgroundColor: Colors.crimson,
    borderColor: Colors.crimson,
  },
  iconBtnBusy: {
    backgroundColor: Colors.surface2,
    borderColor: Colors.gold + "44",
  },
  label: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.gold,
  },
  labelProminent: {
    fontSize: 14,
    fontWeight: "800",
  },
  labelRecording: {
    color: Colors.crimson,
  },
});
