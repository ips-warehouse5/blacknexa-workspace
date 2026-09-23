import AsyncStorage from "@react-native-async-storage/async-storage";

export const LOCATION_PROMPT_SEEN_KEY = "blacknexa.locationPrompt.seen.v1";

export async function markLocationPromptSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(LOCATION_PROMPT_SEEN_KEY, "true");
  } catch {
    /* best effort */
  }
}

export async function hasSeenLocationPrompt(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(LOCATION_PROMPT_SEEN_KEY)) === "true";
  } catch {
    return false;
  }
}
