/**
 * C2's "Record audio instead" row.
 *
 * The caption is unusually specific, and every clause is a constraint:
 *
 *   "Saved as an audio file with the report. It is not transcribed or turned into
 *    text." … "Typing and recording are separate acts. Recording attaches an audio
 *    file to the report — there is no transcription and no live waveform in the
 *    text field."
 *
 * So this component records to a file and hands it to the draft's upload queue.
 * It never touches the body text. The previous build's `VoiceInputButton` ran
 * speech-to-text into the field, which is the opposite behaviour — a transcription
 * puts words the app chose into a document the person may later rely on.
 *
 * There is no waveform either. A level meter would be a live read of the mic, and
 * the design deliberately keeps this row quiet: a duration and a stop button.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Platform, View, type StyleProp, type ViewStyle } from "react-native";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from "expo-audio";
import * as FileSystem from "expo-file-system/legacy";
import * as Haptics from "expo-haptics";
import { colors, radius } from "@/constants/theme";
import Text from "@/components/ui/Text";
import Button from "@/components/ui/Button";
import { useReportDraft } from "@/providers/ReportDraftProvider";

function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function AudioRecorderRow({
  style,
}: {
  style?: StyleProp<ViewStyle>;
}): React.ReactElement {
  const { addAttachment } = useReportDraft();
  /**
   * `useAudioRecorder` returns one long-lived recorder for the component's whole
   * life, rather than the per-take `new Audio.Recording()` this used to build. So
   * "am I recording" is no longer "do I hold an object" — it is tracked here.
   * `recorder.isRecording` exists but is a native read that does not re-render.
   */
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** Read by the unmount cleanup, which must not re-subscribe on every tick. */
  const isRecordingRef = useRef(false);

  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  /** Stop the tick and release the recorder if the screen goes away mid-take. */
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      // Deliberately not awaited: an unmount cannot wait. Guarded because
      // stopping a recorder that never started throws on Android.
      if (isRecordingRef.current) void recorder.stop().catch(() => {});
    };
  }, [recorder]);

  const start = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setError("Microphone access is off. You can still type what happened.");
        return;
      }
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });

      // Required by expo-audio before every take, not once per recorder.
      await recorder.prepareToRecordAsync();
      recorder.record();

      setIsRecording(true);
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((value) => value + 250), 250);
      if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
    } catch {
      setError("Recording could not start. You can still type what happened.");
    } finally {
      setBusy(false);
    }
  }, [recorder]);

  const stop = useCallback(async () => {
    if (!isRecording) return;
    setBusy(true);
    if (timerRef.current) clearInterval(timerRef.current);

    try {
      // Read the duration *before* stopping: `stop()` tears the session down and
      // the reported duration goes to 0, which would attach a file claiming to be
      // zero seconds long.
      const durationMs = recorder.getStatus().durationMillis || elapsed;
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) throw new Error("no uri");

      const info = await FileSystem.getInfoAsync(uri);
      const bytes = info.exists && "size" in info ? (info.size as number) : 0;

      addAttachment({
        kind: "audio",
        // Still m4a on both platforms: expo-audio's HIGH_QUALITY preset keeps the
        // `.m4a` extension with MPEG4/AAC, same as the expo-av preset it replaces.
        mime: "audio/m4a",
        uri,
        bytes,
        durationMs,
        capturedAt: new Date().toISOString(),
      });

      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
    } catch {
      setError("That recording could not be saved. Try again.");
    } finally {
      setIsRecording(false);
      setElapsed(0);
      setBusy(false);
      await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
    }
  }, [addAttachment, elapsed, isRecording, recorder]);

  return (
    <View style={style}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          backgroundColor: colors.s3,
          borderRadius: radius.lg,
          paddingVertical: 13,
          paddingHorizontal: 14,
        }}
      >
        <View
          style={{
            width: 38,
            height: 38,
            borderRadius: 12,
            backgroundColor: isRecording ? colors.bad : colors.s6,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <MicGlyph color={isRecording ? colors.onAcc : colors.acc} />
        </View>

        <View style={{ flex: 1 }}>
          <Text variant="label" color={colors.t0} style={{ fontSize: 13.5 }}>
            {isRecording ? `Recording · ${formatElapsed(elapsed)}` : "Record audio instead"}
          </Text>
          <Text variant="metaSm" color={colors.t4} style={{ marginTop: 2, lineHeight: 16 }}>
            {isRecording
              ? "Tap Stop to attach it to this report."
              : "Saved as an audio file with the report. It is not transcribed or turned into text."}
          </Text>
        </View>

        <Button
          label={isRecording ? "Stop" : "Record"}
          variant={isRecording ? "destructive" : "secondary"}
          block={false}
          height={34}
          loading={busy}
          onPress={isRecording ? stop : start}
          style={{ paddingHorizontal: 14, borderRadius: 12 }}
          testID="record-audio"
        />
      </View>

      {error ? (
        <Text variant="metaSm" color={colors.bad2} style={{ marginTop: 8 }}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

/** The 18px microphone from the C2 / C5 artboards. */
export function MicGlyph({
  color = colors.acc,
  size = 18,
}: {
  color?: string;
  size?: number;
}): React.ReactElement {
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <View
        style={{
          width: size * 0.31,
          height: size * 0.52,
          borderRadius: size * 0.16,
          borderWidth: 1.7,
          borderColor: color,
          marginBottom: size * 0.16,
        }}
      />
      <View
        style={{
          position: "absolute",
          bottom: size * 0.14,
          width: size * 0.62,
          height: size * 0.3,
          borderBottomLeftRadius: size * 0.31,
          borderBottomRightRadius: size * 0.31,
          borderWidth: 1.7,
          borderTopWidth: 0,
          borderColor: color,
        }}
      />
      <View
        style={{
          position: "absolute",
          bottom: 0,
          width: 1.7,
          height: size * 0.14,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

export default AudioRecorderRow;
