import { Audio } from "expo-av";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Speech from "expo-speech";
import { Platform } from "react-native";
import { type LanguageCode } from "@/constants/i18n";

const TOOLKIT_URL = process.env.GEMINI_BASE_URL ?? "";
const TOOLKIT_SECRET = process.env.GEMINI_API_KEY ?? "";

const SPEECH_CACHE_PREFIX = "blacknexa_tts_";

export type TTSResult = {
  uri: string;
  durationMs: number;
};

export type TranscriptionResult = {
  text: string;
};

/**
 * Generate natural text-to-speech audio for a short text via the Vercel AI
 * Gateway (Rork Toolkit proxy). Returns a playable data URI.
 *
 * NOTE: Some versions of Expo Go on iOS cannot play data URIs directly through
 * expo-av. The article-detail player prefers the device's native TTS engine on
 * mobile because it is fast, offline-capable, and supports every language the
 * app translates into. This AI endpoint is kept for web and for future
 * high-fidelity voice playback if expo-av support improves.
 */
export async function synthesizeSpeech(text: string): Promise<TTSResult> {
  if (!text.trim()) throw new Error("No text to speak");
  if (!TOOLKIT_URL || !TOOLKIT_SECRET) {
    throw new Error("Missing Toolkit configuration for TTS");
  }

  const cacheKey = `${SPEECH_CACHE_PREFIX}${hashText(text)}`;
  const cached = await AsyncStorage.getItem(cacheKey);
  if (cached) {
    return { uri: cached, durationMs: 0 };
  }

  const response = await fetch(`${TOOLKIT_URL}/v2/vercel/v4/ai/speech-model`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOOLKIT_SECRET}`,
      "Content-Type": "application/json",
      "ai-model-id": "xai/grok-tts",
      "ai-gateway-protocol-version": "0.0.1",
    },
    body: JSON.stringify({
      text: text.trim(),
      voice: "eve",
      outputFormat: "mp3",
    }),
  });

  if (!response.ok) {
    throw new Error(`TTS request failed: ${response.status}`);
  }

  const result = await response.json();
  if (!result.audio || typeof result.audio !== "string") {
    throw new Error("TTS response did not contain audio");
  }

  const uri = `data:audio/mpeg;base64,${result.audio}`;
  await AsyncStorage.setItem(cacheKey, uri).catch(() => {});
  return { uri, durationMs: result.durationMs ?? 0 };
}

/**
 * Start a microphone recording suitable for sending to speech-to-text.
 */
export async function startVoiceRecording(): Promise<Audio.Recording> {
  try {
    const { status } = await Audio.requestPermissionsAsync();
    if (status !== "granted") {
      throw new Error("Microphone permission was denied");
    }

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });

    const recording = new Audio.Recording();
    await recording.prepareToRecordAsync({
      android: {
        extension: ".m4a",
        outputFormat: Audio.AndroidOutputFormat.MPEG_4,
        audioEncoder: Audio.AndroidAudioEncoder.AAC,
        sampleRate: 16000,
        numberOfChannels: 1,
        bitRate: 128000,
      },
      ios: {
        extension: ".m4a",
        outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
        audioQuality: Audio.IOSAudioQuality.MEDIUM,
        sampleRate: 16000,
        numberOfChannels: 1,
        bitRate: 128000,
        linearPCMBitDepth: 16,
        linearPCMIsBigEndian: false,
        linearPCMIsFloat: false,
      },
      web: {
        mimeType: "audio/webm",
        bitsPerSecond: 128000,
      },
    });
    await recording.startAsync();
    return recording;
  } catch (err) {
    // Comprehensive catch: rethrow permission errors as-is so the UI can
    // show the right alert; wrap everything else in a clean message.
    const message = err instanceof Error ? err.message : String(err);
    if (
      message.toLowerCase().includes("denied") ||
      message.toLowerCase().includes("permission")
    ) {
      throw new Error("Microphone permission was denied");
    }
    throw new Error(`Recording could not start: ${message}`);
  }
}

/**
 * Stop a recording and transcribe the captured audio using the Vercel AI
 * Gateway (Rork Toolkit proxy).
 */
export async function stopVoiceRecordingAndTranscribe(
  recording: Audio.Recording,
): Promise<TranscriptionResult> {
  try {
    await recording.stopAndUnloadAsync();
  } catch (err) {
    throw new Error(
      `Failed to stop recording: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const uri = recording.getURI();
  if (!uri) throw new Error("Recording produced no audio");

  try {
    const base64 = await uriToBase64(uri);
    return transcribeAudio(base64, "audio/mp4");
  } catch (err) {
    throw new Error(
      `Transcription failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Transcribe base64 audio via the Gateway transcription endpoint.
 */
export async function transcribeAudio(
  base64Audio: string,
  mediaType: string,
): Promise<TranscriptionResult> {
  if (!TOOLKIT_URL || !TOOLKIT_SECRET) {
    throw new Error("Missing Toolkit configuration for transcription");
  }

  const response = await fetch(
    `${TOOLKIT_URL}/v2/vercel/v4/ai/transcription-model`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TOOLKIT_SECRET}`,
        "Content-Type": "application/json",
        "ai-model-id": "xai/grok-stt",
        "ai-gateway-protocol-version": "0.0.1",
      },
      body: JSON.stringify({ audio: base64Audio, mediaType }),
    },
  );

  if (!response.ok) {
    throw new Error(`Transcription failed: ${response.status}`);
  }

  const result = await response.json();
  const text =
    result.text ??
    result.transcript ??
    (typeof result === "string" ? result : "");
  return { text: String(text).trim() };
}

/** True if the device has a native TTS engine available. */
export function isNativeTtsAvailable(): boolean {
  return Platform.OS !== "web";
}

/**
 * Speak a script using the device's native TTS engine in the requested
 * language. This is the primary playback path on mobile because it is always
 * available, works offline, and supports every language the app translates into.
 *
 * Android note: expo-speech's `onDone` callback is unreliable on some Android
 * devices — it may never fire, leaving the promise pending forever. We guard
 * with a generous timeout based on estimated speech duration so the caller
 * always gets a resolution and can update the UI accordingly.
 */
export function speakWithNativeTTS(
  script: string,
  language: LanguageCode = "en",
): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      if (Platform.OS === "web") {
        reject(new Error("Native TTS is not available on web"));
        return;
      }
      if (!script || !script.trim()) {
        reject(new Error("No text to speak"));
        return;
      }

      // Estimate speech duration: ~150 words per minute = 2.5 words/sec.
      // Add a 5-second buffer. Used as a safety timeout for Android.
      const wordCount = script.split(/\s+/).length;
      const estimatedMs = Math.max(
        8000,
        Math.ceil((wordCount / 2.5) * 1000) + 5000,
      );

      let resolved = false;
      let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

      const cleanup = () => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
          timeoutHandle = null;
        }
      };

      const handleDone = () => {
        if (resolved) return;
        resolved = true;
        cleanup();
        resolve();
      };

      const handleError = (err: Error) => {
        if (resolved) return;
        resolved = true;
        cleanup();
        // On error, resolve instead of reject so the UI never hangs —
        // the caller can show a fallback message but won't crash.
        console.warn("[TTS] onError:", err?.message ?? String(err));
        resolve();
      };

      // Safety timeout: if onDone never fires (known Android issue), resolve
      // anyway so the UI doesn't hang indefinitely.
      timeoutHandle = setTimeout(() => {
        if (resolved) return;
        resolved = true;
        resolve();
      }, estimatedMs);

      // Cancel any ongoing speech to prevent overlap glitches (bulletproof pattern).
      try {
        Speech.stop();
      } catch {
        /* nothing was playing */
      }

      // Some Android devices need a brief delay after stop() before speak().
      const speakNow = () => {
        try {
          Speech.speak(script, {
            language: bcp47ForLanguage(language),
            pitch: 1.0,
            rate: 0.95,
            onDone: handleDone,
            onError: handleError,
            onStart: () => {
              // Speaking started — the timeout will handle the end.
            },
          });
        } catch (speakErr) {
          if (resolved) return;
          resolved = true;
          cleanup();
          console.warn(
            "[TTS] Speech.speak threw:",
            speakErr instanceof Error ? speakErr.message : String(speakErr),
          );
          resolve();
        }
      };

      // Small delay on Android to let the TTS engine fully reset after stop().
      if (Platform.OS === "android") {
        setTimeout(speakNow, 100);
      } else {
        speakNow();
      }
    } catch (outerErr) {
      // Comprehensive catch-all so the caller never gets an unhandled exception.
      console.warn(
        "[TTS] outer error:",
        outerErr instanceof Error ? outerErr.message : String(outerErr),
      );
      resolve();
    }
  });
}

/** Stop any native TTS playback currently in progress. */
export function stopNativeTTS(): void {
  if (Platform.OS !== "web") {
    Speech.stop();
  }
}

/**
 * Play a generated audio URI using expo-av. Returns the sound object so the
 * caller can stop or pause it. The caller is responsible for catching errors
 * and falling back to native TTS when the URI is unsupported.
 */
export async function playAudioUri(uri: string): Promise<Audio.Sound> {
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
    });

    const { sound } = await Audio.Sound.createAsync(
      { uri },
      { shouldPlay: true },
    );
    return sound;
  } catch (err) {
    throw new Error(
      `Audio playback failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

async function uriToBase64(uri: string): Promise<string> {
  const response = await fetch(uri);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = (reader.result as string)?.split(",")[1] ?? "";
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function hashText(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

/**
 * Build a spoken version of a news article suitable for TTS. Includes the
 * headline, summary, and the first portion of the content so the audio
 * briefing delivers substantive information — not just a two-sentence teaser.
 * The script is capped at ~600 words so TTS stays fast and reliable.
 */
export function buildArticleSpokenScript(
  headline: string,
  summary: string,
  content?: string,
): string {
  const lead = `${headline}. ${summary}`;
  if (content && content.trim()) {
    // Take the first ~800 words of the content for a meaningful audio briefing
    // that covers the who, what, where, when, and why of the story.
    const contentWords = content.trim().split(/\s+/);
    const excerpt = contentWords.slice(0, 800).join(" ");
    const full = `${lead}. ${excerpt}`;
    return full.replace(/\s+/g, " ").trim();
  }
  return lead.replace(/\s+/g, " ").trim();
}

/** Map the app's LanguageCode to a BCP-47 locale that the OS TTS engine understands. */
function bcp47ForLanguage(language: LanguageCode): string {
  const map: Record<LanguageCode, string> = {
    en: "en-US",
    es: "es-ES",
    pt: "pt-BR",
    fr: "fr-FR",
    de: "de-DE",
    it: "it-IT",
    nl: "nl-NL",
    ru: "ru-RU",
    tr: "tr-TR",
    ar: "ar-SA",
    zh: "zh-CN",
    ja: "ja-JP",
    ko: "ko-KR",
    hi: "hi-IN",
    vi: "vi-VN",
    id: "id-ID",
    sw: "sw-KE",
    yo: "yo-NG",
    am: "am-ET",
  };
  return map[language] ?? "en-US";
}
