/**
 * Place search for Profile → Your area.
 *
 * The lookup is proxied through our own backend rather than called from the
 * device. Two reasons, and the second is the one that decides it:
 *
 *   • the response shape stays under our control, so the geocoding provider can
 *     be swapped without an App Store release;
 *   • the query never leaves our infrastructure. "Which city is this person
 *     looking up" is exactly the sort of thing that should not be sent from a
 *     member's phone to a third party the app never named — and on this app, for
 *     this audience, that is not a theoretical concern.
 */

import api from "@/lib/api/client";

export interface LocationSearchResult {
  label: string;
  lat: number;
  lng: number;
  /** Stable per place. Safe to use as a list key. */
  placeId: string;
}

export const locationsApi = {
  /**
   * Search cities and postal codes.
   *
   * Resolves to an empty array rather than throwing when the lookup fails — the
   * server already answers 200 with no results when the upstream is unreachable,
   * and this catch covers the offline case. The screen shows "No areas match
   * that search" either way, which is honest: we genuinely have nothing to
   * offer, and an error banner on a screen whose GPS button still works would
   * overstate the problem.
   */
  async search(query: string): Promise<LocationSearchResult[]> {
    const q = query.trim();
    // Matches the server's floor. Saves a round trip that can only be rejected.
    if (q.length < 2) return [];
    try {
      const payload = await api.get<{ results: LocationSearchResult[] }>(
        `/locations/search?q=${encodeURIComponent(q)}`,
      );
      return payload?.results ?? [];
    } catch {
      return [];
    }
  },
};

export default locationsApi;
