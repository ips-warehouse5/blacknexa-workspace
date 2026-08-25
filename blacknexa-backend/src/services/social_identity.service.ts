/**
 * Verification of Apple and Google identity tokens.
 *
 * Screen A5 offers "Continue with Apple" and "Continue with Google". Today the
 * app routes both through an external Rork OAuth host, which means a third party
 * holds the identity and this backend never sees it — incompatible with the
 * design, where every report has an owner in *our* database.
 *
 * So the app performs the native sign-in and sends us the provider's signed
 * identity token; this service verifies it. The rules that matter:
 *
 *   • **Never trust the token's contents before checking its signature.** The
 *     token arrives from a client and is attacker-controlled until verified
 *     against the provider's published keys.
 *   • **Check the audience.** A valid Google token issued for a *different*
 *     application is still a valid Google token. Without an `aud` check, anyone
 *     with any Google app could mint logins here.
 *   • **Require a verified email**, or treat the address as absent. An
 *     unverified provider email is not proof of anything, and it must not be
 *     allowed to match an existing account.
 *
 * Keys are fetched from each provider's JWKS endpoint and cached: the endpoints
 * rate-limit, and a sign-in should not depend on a network round trip per call.
 */

import crypto from "crypto";
import jwt, { type JwtHeader } from "jsonwebtoken";
import env from "@/config/env.config";
import logger from "@/utils/logger.util";
import { AuthError } from "@/services/auth.service";
import type { SocialProvider } from "@/types/user.interface";

const APPLE_ISSUER = "https://appleid.apple.com";
const APPLE_JWKS = "https://appleid.apple.com/auth/keys";
/** Google issues both spellings; either is legitimate. */
const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];
const GOOGLE_JWKS = "https://www.googleapis.com/oauth2/v3/certs";

/** Providers rotate keys slowly; an hour is well inside the safe window. */
const JWKS_TTL_MS = 60 * 60 * 1000;
const JWKS_TIMEOUT_MS = 5_000;

/** One RSA key from a JWKS document. */
interface Jwk {
  kid: string;
  kty: string;
  n: string;
  e: string;
  alg?: string;
  use?: string;
}

interface JwksCacheEntry {
  keys: Jwk[];
  fetchedAt: number;
}

/** What the caller gets back — the only two facts we need from a provider. */
export interface VerifiedIdentity {
  /** The provider's stable user id. Never changes, unlike an email. */
  subject: string;
  /** Present only when the provider asserts the address is verified. */
  email: string | null;
}

class SocialIdentityService {
  private readonly jwksCache = new Map<string, JwksCacheEntry>();

  /** Fetch and cache a JWKS document. */
  private async loadKeys(url: string): Promise<Jwk[]> {
    const cached = this.jwksCache.get(url);
    if (cached && Date.now() - cached.fetchedAt < JWKS_TTL_MS) {
      return cached.keys;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), JWKS_TIMEOUT_MS);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`JWKS request failed with ${response.status}`);
      }
      const body = (await response.json()) as { keys?: Jwk[] };
      const keys = Array.isArray(body.keys) ? body.keys : [];
      if (keys.length === 0) throw new Error("JWKS document contained no keys");

      this.jwksCache.set(url, { keys, fetchedAt: Date.now() });
      return keys;
    } catch (err) {
      // Serve a stale cache rather than failing sign-in over a transient blip:
      // the keys are still the provider's, just older than we would like.
      if (cached) {
        logger.warn("[social] JWKS refresh failed, using cached keys", {
          url,
          message: err instanceof Error ? err.message : String(err),
        });
        return cached.keys;
      }
      logger.error("[social] JWKS fetch failed with no cache to fall back on", {
        url,
        message: err instanceof Error ? err.message : String(err),
      });
      throw new AuthError("Could not verify that sign-in. Please try again.", 503);
    } finally {
      clearTimeout(timer);
    }
  }

  /** Convert a JWK into a PEM public key for `jsonwebtoken`. */
  private toPem(jwk: Jwk): string {
    return crypto
      .createPublicKey({ key: jwk as unknown as crypto.JsonWebKey, format: "jwk" })
      .export({ type: "spki", format: "pem" })
      .toString();
  }

  /**
   * Verify a token against a JWKS, an issuer set and an audience set.
   *
   * The `kid` from the *unverified* header is used only to select a candidate key
   * — it decides nothing on its own, and the signature check is what establishes
   * trust.
   */
  private async verifyToken(
    token: string,
    jwksUrl: string,
    issuers: string[],
    audiences: string[],
  ): Promise<Record<string, unknown>> {
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded || typeof decoded === "string") {
      throw new AuthError("That sign-in token is not readable.", 400);
    }

    const header = decoded.header as JwtHeader;
    const keys = await this.loadKeys(jwksUrl);
    const jwk = keys.find((candidate) => candidate.kid === header.kid);
    if (!jwk) {
      throw new AuthError("That sign-in token was not signed by a known key.", 401);
    }

    // `jsonwebtoken` types issuer and audience as non-empty tuples, and it is
    // right to insist: passing an empty array would silently skip the check
    // rather than reject everything, which is the difference between "verified
    // for this app" and "verified for any app on the internet".
    if (audiences.length === 0) {
      throw new AuthError("That sign-in provider is not configured on this server.", 503);
    }
    const audienceTuple = audiences as [string, ...string[]];
    const issuerTuple = issuers as [string, ...string[]];

    try {
      return jwt.verify(token, this.toPem(jwk), {
        algorithms: ["RS256"],
        issuer: issuerTuple,
        audience: audienceTuple,
      }) as Record<string, unknown>;
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) {
        throw new AuthError("That sign-in has expired. Please try again.", 401);
      }
      logger.warn("[social] identity token rejected", {
        message: err instanceof Error ? err.message : String(err),
      });
      throw new AuthError("That sign-in could not be verified.", 401);
    }
  }

  /**
   * Read the email only when the provider says it is verified.
   *
   * Apple sends `email_verified` as a boolean or the string `"true"` depending on
   * the flow, which is exactly the kind of detail that turns into a silent
   * security hole if it is coerced loosely.
   */
  private verifiedEmail(claims: Record<string, unknown>): string | null {
    const email = typeof claims.email === "string" ? claims.email.trim().toLowerCase() : "";
    if (!email) return null;
    const flag = claims.email_verified;
    const verified = flag === true || flag === "true";
    return verified ? email : null;
  }

  /** Verify an identity token and reduce it to a subject plus a verified email. */
  async verify(provider: SocialProvider, identityToken: string): Promise<VerifiedIdentity> {
    if (provider === "apple") {
      if (!env.social.appleEnabled) {
        throw new AuthError("Apple sign-in is not configured on this server.", 503);
      }
      // Both the app bundle id and the web service id are legitimate audiences —
      // which one appears depends on whether the sign-in came from the native
      // dialog or a web flow.
      const audiences = [env.social.appleBundleId, env.social.appleServiceId].filter(Boolean);
      const claims = await this.verifyToken(
        identityToken,
        APPLE_JWKS,
        [APPLE_ISSUER],
        audiences,
      );
      const subject = typeof claims.sub === "string" ? claims.sub : "";
      if (!subject) throw new AuthError("That sign-in did not identify an account.", 400);
      return { subject, email: this.verifiedEmail(claims) };
    }

    if (!env.social.googleEnabled) {
      throw new AuthError("Google sign-in is not configured on this server.", 503);
    }
    const claims = await this.verifyToken(
      identityToken,
      GOOGLE_JWKS,
      GOOGLE_ISSUERS,
      env.social.googleClientIds,
    );
    const subject = typeof claims.sub === "string" ? claims.sub : "";
    if (!subject) throw new AuthError("That sign-in did not identify an account.", 400);
    return { subject, email: this.verifiedEmail(claims) };
  }
}

export const socialIdentityService = new SocialIdentityService();
export default socialIdentityService;
