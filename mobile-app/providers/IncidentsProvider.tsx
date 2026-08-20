import createContextHook from "@nkzw/create-context-hook";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import {
  MOCK_INCIDENTS,
  type Incident,
  type IncidentCategory,
  type PrivacyLevel,
} from "@/mocks/incidents";

type IncidentDraft = {
  title: string;
  summary: string;
  category: IncidentCategory;
  privacy: PrivacyLevel;
  area: string;
  hasEvidence: boolean;
  evidenceCount: number;
  redactLocation: boolean;
  /** Backend-issued incident id, when the server create succeeded. */
  serverId?: string;
};

const USER_INCIDENTS_KEY = "blacknexa.user_incidents.v2";
const SUPPORTED_KEY = "blacknexa.supported.v2";

async function loadUserIncidents(): Promise<Incident[]> {
  try {
    const raw = await AsyncStorage.getItem(USER_INCIDENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Incident[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.log("[Incidents] load error", e);
    return [];
  }
}

async function loadSupported(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(SUPPORTED_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export const [IncidentsProvider, useIncidents] = createContextHook(() => {
  const qc = useQueryClient();

  const userIncidentsQuery = useQuery({
    queryKey: ["user_incidents"],
    queryFn: loadUserIncidents,
  });

  const supportedQuery = useQuery({
    queryKey: ["supported"],
    queryFn: loadSupported,
  });

  const userIncidents = useMemo<Incident[]>(
    () => userIncidentsQuery.data ?? [],
    [userIncidentsQuery.data]
  );

  const supportedSet = useMemo<Set<string>>(
    () => new Set(supportedQuery.data ?? []),
    [supportedQuery.data]
  );

  const incidents = useMemo<Incident[]>(() => {
    // Sample incidents are development-only. They are fictional entries that are
    // visually indistinguishable from real reports (named authors, plausible
    // stories, supporter counts), so shipping them would imply a community feed
    // that does not exist — there is no incident list endpoint at all (R-024).
    const merged = __DEV__
      ? [...userIncidents, ...MOCK_INCIDENTS]
      : [...userIncidents];
    return merged.map((i) =>
      supportedSet.has(i.id)
        ? { ...i, supporters: i.supporters + 1 }
        : i
    );
  }, [userIncidents, supportedSet]);

  const createMutation = useMutation({
    mutationFn: async (draft: IncidentDraft): Promise<Incident[]> => {
      const newIncident: Incident = {
        id: `inc_${Date.now()}`,
        serverId: draft.serverId,
        title: draft.title,
        summary: draft.summary,
        category: draft.category,
        privacy: draft.privacy,
        area: draft.redactLocation
          ? draft.area.split(",").slice(-1)[0]?.trim() || draft.area
          : draft.area,
        timestamp: Date.now(),
        supporters: 0,
        verifications: 0,
        hasEvidence: draft.hasEvidence,
        evidenceCount: draft.evidenceCount,
        author: { handle: "You", anonymous: draft.privacy !== "public" },
      };
      const next = [newIncident, ...userIncidents];
      await AsyncStorage.setItem(USER_INCIDENTS_KEY, JSON.stringify(next));
      return next;
    },
    onSuccess: (next) => {
      qc.setQueryData(["user_incidents"], next);
    },
  });

  const supportMutation = useMutation({
    mutationFn: async (id: string): Promise<string[]> => {
      const current = supportedQuery.data ?? [];
      const next = current.includes(id)
        ? current.filter((s) => s !== id)
        : [...current, id];
      await AsyncStorage.setItem(SUPPORTED_KEY, JSON.stringify(next));
      return next;
    },
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey: ["supported"] });
      const previous = qc.getQueryData<string[]>(["supported"]) ?? [];
      const optimistic = previous.includes(id)
        ? previous.filter((s) => s !== id)
        : [...previous, id];
      qc.setQueryData(["supported"], optimistic);
      return { previous };
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.previous) qc.setQueryData(["supported"], ctx.previous);
    },
    onSuccess: (next) => {
      qc.setQueryData(["supported"], next);
    },
  });

  const isSupported = useCallback(
    (id: string) => supportedSet.has(id),
    [supportedSet]
  );

  const getById = useCallback(
    (id: string) => incidents.find((i) => i.id === id),
    [incidents]
  );

  const myIncidents = useMemo(
    () => incidents.filter((i) => i.author.handle === "You"),
    [incidents]
  );

  const privateIncidents = useMemo(
    () =>
      incidents.filter(
        (i) => i.author.handle === "You" && i.privacy === "private"
      ),
    [incidents]
  );

  return {
    incidents,
    isLoading: userIncidentsQuery.isLoading || supportedQuery.isLoading,
    createIncident: createMutation.mutate,
    isCreating: createMutation.isPending,
    toggleSupport: supportMutation.mutate,
    isSupported,
    getById,
    myIncidents,
    privateIncidents,
  };
});
