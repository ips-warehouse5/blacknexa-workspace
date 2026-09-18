/**
 * Place search for Profile → Your area.
 *
 * ── Why a proxy rather than a client-side call ──────────────────────────────
 * Same reasoning as `weather.service.ts`: the upstream is proxied so the response
 * shape stays ours and the provider can be swapped without a client release. It
 * also keeps the search query server-side, which matters more here than it does
 * for weather — "what city is this person looking up" is exactly the kind of
 * thing that should not be sent from a member's device to a third party the app
 * never told them about.
 *
 * ── Why Open-Meteo ─────────────────────────────────────────────────────────
 * It needs no API key, which means no secret to provision, rotate or leak, and
 * this codebase already depends on the same vendor for weather. Google Places and
 * Mapbox are better at fuzzy matching but both require a billable key before a
 * single search works, and neither is worth that for "type a city, get a
 * coordinate". If the matching proves too weak in testing, only this file changes.
 *
 * ── The cache ──────────────────────────────────────────────────────────────
 * Place names do not move. A repeated search for "Atlanta" should not cost a
 * round trip, and the type-ahead on the client makes repeats the common case
 * rather than the exception.
 */

import logger from "@/utils/logger.util";
import { fetchWithTimeout } from "@/utils/http.util";
import platformCacheService from "@/services/platform_cache.service";
import type { LocationSearchResult } from "@/types/user.interface";

const GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search";
const GEOCODE_TIMEOUT_MS = 6_000;

/** Cities do not move. A day is conservative. */
const CACHE_TTL_SECONDS = 86_400;

/** How many hits the screen can usefully show before it becomes a list to scroll. */
const MAX_RESULTS = 8;

/** One entry from Open-Meteo's geocoding response. */
interface GeocodeHit {
  id?: number;
  name?: string;
  latitude?: number;
  longitude?: number;
  country?: string;
  country_code?: string;
  /** First-level division — "Georgia" for Atlanta, "England" for Manchester. */
  admin1?: string;
}

class LocationService {
  /**
   * Compose the label the row actually prints.
   *
   * "Atlanta, GA" for the United States and "Manchester, England, United
   * Kingdom" elsewhere — the two-letter state abbreviation is a US convention,
   * and applying it globally produces labels no one recognises. Where the
   * division is unknown the country carries the row on its own, which is still
   * enough to tell two same-named cities apart.
   */
  private labelFor(hit: GeocodeHit): string {
    const parts = [hit.name, hit.admin1, hit.country].filter(
      (part): part is string => Boolean(part && part.trim()),
    );
    // Drop a division that merely repeats the city (Singapore, Gibraltar, and
    // every other city-state) rather than printing "Singapore, Singapore".
    const deduped = parts.filter(
      (part, index) => index === 0 || part.toLowerCase() !== parts[0].toLowerCase(),
    );
    if (hit.country_code === "US" && hit.admin1) {
      const state = US_STATE_ABBREVIATIONS[hit.admin1];
      if (state) return `${hit.name}, ${state}`;
    }
    return deduped.join(", ");
  }

  /**
   * Search for a place by name or postal code.
   *
   * Returns an empty list rather than throwing when the upstream is unreachable.
   * A search that finds nothing and a search that could not run look the same to
   * the person typing, and failing the request would turn a degraded type-ahead
   * into an error banner on a screen that still works — they can use the GPS
   * button or a recent area instead.
   */
  async search(query: string): Promise<LocationSearchResult[]> {
    const trimmed = query.trim();
    if (trimmed.length < 2) return [];

    const cacheKey = `geocode:${trimmed.toLowerCase()}`;
    const cached = await platformCacheService.get<LocationSearchResult[]>(cacheKey);
    if (cached) return cached;

    const url =
      `${GEOCODE_URL}?name=${encodeURIComponent(trimmed)}` +
      `&count=${MAX_RESULTS}&language=en&format=json`;

    const response = await fetchWithTimeout(url, { method: "GET" }, GEOCODE_TIMEOUT_MS);
    if (!response || !response.ok) {
      logger.warn("[location] geocoding upstream unavailable", {
        status: response?.status ?? null,
      });
      return [];
    }

    let body: { results?: GeocodeHit[] };
    try {
      body = (await response.json()) as { results?: GeocodeHit[] };
    } catch {
      logger.warn("[location] geocoding response was not JSON");
      return [];
    }

    const results: LocationSearchResult[] = (body.results ?? [])
      .filter(
        (hit): hit is GeocodeHit & { latitude: number; longitude: number } =>
          typeof hit.latitude === "number" && typeof hit.longitude === "number",
      )
      .map((hit) => ({
        label: this.labelFor(hit),
        lat: hit.latitude,
        lng: hit.longitude,
        // The upstream id is stable per place, which is what a placeId is for.
        // Falling back to the coordinate pair keeps the field non-empty for a
        // hit that arrives without one, so the client can always key a list row.
        placeId: hit.id ? String(hit.id) : `${hit.latitude},${hit.longitude}`,
      }))
      .filter((hit) => hit.label.length > 0);

    // Only cache a real answer. Caching an empty list would freeze a transient
    // upstream failure in place for a day.
    if (results.length > 0) {
      await platformCacheService.set(cacheKey, results, CACHE_TTL_SECONDS);
    }
    return results;
  }
}

/**
 * US state and territory names to their postal abbreviations.
 *
 * Here rather than in `data/` because it exists for one label format in one
 * function, and moving it would make the formatting rule harder to read, not
 * easier.
 */
const US_STATE_ABBREVIATIONS: Record<string, string> = {
  Alabama: "AL",
  Alaska: "AK",
  Arizona: "AZ",
  Arkansas: "AR",
  California: "CA",
  Colorado: "CO",
  Connecticut: "CT",
  Delaware: "DE",
  "District of Columbia": "DC",
  Florida: "FL",
  Georgia: "GA",
  Hawaii: "HI",
  Idaho: "ID",
  Illinois: "IL",
  Indiana: "IN",
  Iowa: "IA",
  Kansas: "KS",
  Kentucky: "KY",
  Louisiana: "LA",
  Maine: "ME",
  Maryland: "MD",
  Massachusetts: "MA",
  Michigan: "MI",
  Minnesota: "MN",
  Mississippi: "MS",
  Missouri: "MO",
  Montana: "MT",
  Nebraska: "NE",
  Nevada: "NV",
  "New Hampshire": "NH",
  "New Jersey": "NJ",
  "New Mexico": "NM",
  "New York": "NY",
  "North Carolina": "NC",
  "North Dakota": "ND",
  Ohio: "OH",
  Oklahoma: "OK",
  Oregon: "OR",
  Pennsylvania: "PA",
  "Puerto Rico": "PR",
  "Rhode Island": "RI",
  "South Carolina": "SC",
  "South Dakota": "SD",
  Tennessee: "TN",
  Texas: "TX",
  Utah: "UT",
  Vermont: "VT",
  Virginia: "VA",
  Washington: "WA",
  "West Virginia": "WV",
  Wisconsin: "WI",
  Wyoming: "WY",
};

export const locationService = new LocationService();
export default locationService;
