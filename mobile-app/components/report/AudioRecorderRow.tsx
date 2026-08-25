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
import { Audio } from "expo-av";
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
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /** Stop the tick and release the recorder if the screen goes away mid-take. */
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      // Deliberately not awaited: an unmount cannot wait, and a stranded
      // recording is released by the OS when the audio session ends.
      void recording?.stopAndUnloadAsync().catch(() => {});
    };
  }, [recording]);

  const start = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        setError("Microphone access is off. You can still type what happened.");
        return;
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const created = new Audio.Recording();
      await created.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await created.startAsync();

      setRecording(created);
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((value) => value + 250), 250);
      if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
    } catch {
      setError("Recording could not start. You can still type what happened.");
    } finally {
      setBusy(false);
    }
  }, []);

  const stop = useCallback(async () => {
    if (!recording) return;
    setBusy(true);
    if (timerRef.current) clearInterval(timerRef.current);

    try {
      await recording.stopAndUnloadAsync();
      const status = await recording.getStatusAsync();
      const uri = recording.getURI();
      if (!uri) throw new Error("no uri");

      const info = await FileSystem.getInfoAsync(uri);
      const bytes = info.exists && "size" in info ? (info.size as number) : 0;

      addAttachment({
        kind: "audio",
        // The recorder writes m4a on both platforms with the HIGH_QUALITY preset.
        mime: "audio/m4a",
        uri,
        bytes,
        durationMs: status.durationMillis ?? elapsed,
        capturedAt: new Date().toISOString(),
      });

      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
    } catch {
      setError("That recording could not be saved. Try again.");
    } finally {
      setRecording(null);
      setElapsed(0);
      setBusy(false);
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false }).catch(() => {});
    }
  }, [addAttachment, elapsed, recording]);

  const isRecording = recording !== null;

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
