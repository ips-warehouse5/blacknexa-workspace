import createContextHook from "@nkzw/create-context-hook";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { isSupportedLanguage, type LanguageCode } from "@/constants/i18n";

export type Settings = {
  biometrics: boolean;
  redactGps: boolean;
  notifs: boolean;
  anonymousByDefault: boolean;
  autoSeal: boolean;
  displayName: string;
  consentVersion: number;
  consentTimestamp: number | null;
  consentTos: boolean;
  consentPrivacy: boolean;
  /** Default ISO-2 country code for compliance checks. */
  defaultCountry: string;
  /** Default state/province subdivision code. */
  defaultSubdivision: string;
  /** Whether the user agreed to GDPR/PIPEDA data processing terms. */
  dataProcessingAgreed: boolean;
  /** Whether to prompt for media consent on each evidence capture. */
  promptMediaConsent: boolean;
  /** Whether to redact sensitive details in public reports. */
  redactPublicDetails: boolean;
  /** User's vault PIN/passphrase for zero-knowledge encryption. Never logged. */
  vaultPin: string;
  /** Whether the user has set up a vault PIN. */
  vaultPinSet: boolean;
  /** Preferred reading language for news articles. Defaults to English. */
  preferredLanguage: LanguageCode;
};

const SETTINGS_KEY = "blacknexa.settings.v1";

const DEFAULTS: Settings = {
  biometrics: true,
  redactGps: true,
  notifs: true,
  anonymousByDefault: false,
  autoSeal: true,
  displayName: "Morgan Thompson",
  consentVersion: 0,
  consentTimestamp: null,
  consentTos: false,
  consentPrivacy: false,
  defaultCountry: "US",
  defaultSubdivision: "NY",
  dataProcessingAgreed: false,
  promptMediaConsent: true,
  redactPublicDetails: true,
  vaultPin: "",
  vaultPinSet: false,
  preferredLanguage: "en",
};

async function loadSettings(): Promise<Settings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    const merged = { ...DEFAULTS, ...parsed };
    // Guard against a stale or invalid language code stored on disk.
    if (!isSupportedLanguage(merged.preferredLanguage)) {
      merged.preferredLanguage = "en";
    }
    return merged;
  } catch (e) {
    console.log("[Settings] load error", e);
    return DEFAULTS;
  }
}

export const [SettingsProvider, useSettings] = createContextHook(() => {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["settings"],
    queryFn: loadSettings,
    staleTime: Infinity,
  });

  const settings = useMemo<Settings>(
    () => query.data ?? DEFAULTS,
    [query.data]
  );

  const mutation = useMutation({
    mutationFn: async (next: Settings): Promise<Settings> => {
      await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      return next;
    },
    onMutate: async (next) => {
      await qc.cancelQueries({ queryKey: ["settings"] });
      const previous = qc.getQueryData<Settings>(["settings"]) ?? DEFAULTS;
      qc.setQueryData(["settings"], next);
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(["settings"], ctx.previous);
    },
  });

  const update = useCallback(
    async <K extends keyof Settings>(key: K, value: Settings[K]): Promise<Settings> => {
      return await mutation.mutateAsync({ ...settings, [key]: value });
    },
    [mutation, settings]
  );

  const updateMany = useCallback(
    async (patch: Partial<Settings>): Promise<Settings> => {
      return await mutation.mutateAsync({ ...settings, ...patch });
    },
    [mutation, settings]
  );

  return { settings, update, updateMany, isLoading: query.isLoading };
});
