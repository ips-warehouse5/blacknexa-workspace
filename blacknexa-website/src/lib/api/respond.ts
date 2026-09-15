/**
 * Turning an `ApiError` into a response for this app's own `/api/*` routes.
 *
 * Kept out of `client.ts` because that module is pure transport and is also
 * used from Server Components, which have no `NextResponse` to return.
 *
 * The rule here is who is at fault. A 4xx from the platform API is something
 * about the submission — most often a rate limit — and its message is worth
 * showing, because it tells the visitor what to do. Anything else is about our
 * internals, and its message is not theirs to read.
 */

import { NextResponse } from "next/server";

import { ApiError } from "@/lib/api/client";

/** What the browser reads on failure. The forms render `error` directly. */
export interface ErrorBody {
  error: string;
}

const GENERIC = "Something went wrong on our end — try again.";

/** A validation failure this app caught before calling the API. */
export function badRequest(message: string): NextResponse<ErrorBody> {
  return NextResponse.json({ error: message }, { status: 400 });
}

/** A feature whose backend is not available — misconfigured, or not built yet. */
export function unavailable(message: string): NextResponse<ErrorBody> {
  return NextResponse.json({ error: message }, { status: 503 });
}

/**
 * Map a thrown value onto a response.
 *
 * @param error       Whatever was caught.
 * @param unconfigured Message for when `API_BASE_URL` is not set — worth
 *                     naming the feature, since this is read by whoever is
 *                     setting the environment up.
 */
export function respondToApiError(
  error: unknown,
  unconfigured: string,
): NextResponse<ErrorBody> {
  if (error instanceof ApiError) {
    if (error.isUnconfigured) return unavailable(unconfigured);

    // Pass the API's own words through only when the caller can act on them.
    if (error.isClientFault) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
  }

  // Unreachable API, 5xx, or something that was never an ApiError at all.
  return NextResponse.json({ error: GENERIC }, { status: 502 });
}
