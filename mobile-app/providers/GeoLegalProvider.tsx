/**
 * BlackNexa™ Geo-Legal Provider — context hook wrapping the geo-legal API.
 *
 * Exposes: lookupJurisdiction, validateReport, confirmAndDispatch, createIncident.
 * Uses React Query for caching and the existing NewsProvider pattern.
 *
 * Trademark pending with the USPTO. BlackNexa™ — By the people, for the people.
 */

import { useQuery, useMutation } from "@tanstack/react-query";
import createContextHook from "@nkzw/create-context-hook";
import { useState, useCallback } from "react";
import type {
  JurisdictionProfile,
  ReportDraft,
  ValidationResult,
  DispatchChannel,
  DispatchResult,
  CreateIncidentResponse,
} from "@/constants/geo-legal";

/** Backend base URL — same env var used by NewsProvider. */
function backendBase(): string {
  return process.env.EXPO_PUBLIC_RORK_FUNCTIONS_URL ?? "";
}

export type LookupParams = {
  country: string;
  lat?: number;
  lng?: number;
  lang?: string;
};

export type ValidateParams = {
  reportDraft: ReportDraft;
  countryCode: string;
  lat?: number;
  lng?: number;
};

export type DispatchParams = {
  reportDraft: ReportDraft;
  validation: ValidationResult;
  humanConfirmed: boolean;
  channels: DispatchChannel[];
  incidentId?: string;
};

export type CreateIncidentParams = {
  userId: string;
  countryCode: string;
  category: ReportDraft["category"];
  privacyLevel: "private" | "trusted" | "public";
  reportDraft: ReportDraft;
  validation: ValidationResult;
  sealedEvidence?: {
    incidentId: string;
    sealedPayload: string;
    mediaType: string;
    contentHash: string;
    metadataScrubbed: boolean;
  };
  humanConfirmed: boolean;
};

function useGeoLegalInternal() {
  const [currentProfile, setCurrentProfile] = useState<JurisdictionProfile | null>(null);
  const [currentValidation, setCurrentValidation] = useState<ValidationResult | null>(null);

  const lookupJurisdiction = useCallback(async (params: LookupParams): Promise<JurisdictionProfile | null> => {
    const base = backendBase();
    if (!base) return null;
    const url = new URL(`${base}/api/v1/geo-legal/lookup`);
    url.searchParams.set("country", params.country.toUpperCase());
    if (params.lat != null) url.searchParams.set("lat", String(params.lat));
    if (params.lng != null) url.searchParams.set("lng", String(params.lng));
    if (params.lang) url.searchParams.set("lang", params.lang);

    const res = await fetch(url.toString(), { method: "GET" });
    if (!res.ok) return null;
    const data = (await res.json()) as { success: boolean; profile?: JurisdictionProfile; error?: string };
    if (!data.success || !data.profile) return null;
    setCurrentProfile(data.profile);
    return data.profile;
  }, []);

  const validateReport = useCallback(async (params: ValidateParams): Promise<ValidationResult | null> => {
    const base = backendBase();
    if (!base) return null;
    const res = await fetch(`${base}/api/v1/geo-legal/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reportDraft: params.reportDraft,
        countryCode: params.countryCode,
        lat: params.lat,
        lng: params.lng,
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { success: boolean; validation?: ValidationResult; error?: string };
    if (!data.success || !data.validation) return null;
    setCurrentValidation(data.validation);
    return data.validation;
  }, []);

  const confirmAndDispatch = useCallback(async (params: DispatchParams): Promise<DispatchResult | null> => {
    const base = backendBase();
    if (!base) return null;
    const res = await fetch(`${base}/api/v1/geo-legal/dispatch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reportDraft: params.reportDraft,
        validation: params.validation,
        humanConfirmed: params.humanConfirmed,
        channels: params.channels,
        incidentId: params.incidentId,
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as DispatchResult & { success: boolean };
    return data;
  }, []);

  const createIncident = useCallback(async (params: CreateIncidentParams): Promise<CreateIncidentResponse | null> => {
    const base = backendBase();
    if (!base) return null;
    const res = await fetch(`${base}/api/v1/geo-legal/incident/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as CreateIncidentResponse;
    return data;
  }, []);

  // React Query wrapper for lookup with caching.
  const lookupQuery = useQuery({
    queryKey: ["geo-legal", currentProfile?.countryCode] as const,
    queryFn: async () => currentProfile,
    enabled: !!currentProfile,
    staleTime: 5 * 60 * 1000,
  });

  const validateMutation = useMutation({
    mutationFn: validateReport,
  });

  const dispatchMutation = useMutation({
    mutationFn: confirmAndDispatch,
  });

  const createIncidentMutation = useMutation({
    mutationFn: createIncident,
  });

  const clearState = useCallback(() => {
    setCurrentProfile(null);
    setCurrentValidation(null);
  }, []);

  return {
    currentProfile,
    currentValidation,
    lookupJurisdiction,
    validateReport,
    confirmAndDispatch,
    createIncident,
    lookupQuery,
    validateMutation,
    dispatchMutation,
    createIncidentMutation,
    clearState,
  };
}

export const [GeoLegalProvider, useGeoLegal] = createContextHook(useGeoLegalInternal);
