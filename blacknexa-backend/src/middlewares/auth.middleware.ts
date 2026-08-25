/**
 * Authentication guards and role-based access control.
 *
 * `adminAuthGuard` protects the destructive and operational routes that were
 * completely open in the Worker — daily refresh, backfills, duplicate pruning,
 * cache/queue admin, payout status transitions, and persistence restore.
 *
 * `userAuthGuard` protects the member surface — `/api/v1/auth/*`,
 * `/api/v1/users/me/*` and every report write. It carries the `sid` claim through
 * to `req.user.sessionId`, which is what makes two things in the design possible:
 * revoking one device from Profile → Security, and screen A15's promise that a
 * password reset keeps *this* session and ends the others.
 *
 * A member access token is checked against its session row on every request that
 * needs one, so a revoked device stops working within one access-token lifetime
 * rather than one refresh cycle.
 */

import type { NextFunction, Request, RequestHandler, Response } from "express";
import authService, { AuthError } from "@/services/auth.service";
import { legacyError } from "@/utils/response.util";
import responseMessage from "@/utils/response_message.util";
import logger from "@/utils/logger.util";
import type { AdminRole, TokenAudience } from "@/types/admin.interface";
import type { UserRole } from "@/types/user.interface";

/** Pull a bearer token out of the Authorization header. */
function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (!scheme || scheme.toLowerCase() !== "bearer" || !token) return null;
  return token.trim() || null;
}

/**
 * Build a guard for a given audience.
 *
 * ── Why a member token costs a database read ───────────────────────────────
 * A JWT is valid until it expires, and nothing about signing out or deleting an
 * account changes a token already in someone's hands. With a 15-minute access
 * lifetime that leaves a quarter of an hour in which a revoked device can still
 * write — which makes two things printed on screen false rather than approximate:
 * A15's "every other device has been signed out", and the deletion screen's "every
 * device is signed out".
 *
 * So a member token is checked against its `user_sessions` row on every request.
 * That is one indexed lookup per authenticated call, and it buys the difference
 * between a promise that holds and one that holds in a few minutes. Signing out,
 * revoking a device from Profile → Security, resetting a password and deleting an
 * account all remove rows, so all four take effect on the next request.
 *
 * Operator tokens are not checked this way: `admin_users` has no per-device session
 * table, and the operator surface is a handful of accounts rather than a device
 * fleet.
 */
function buildGuard(audience: TokenAudience): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const token = extractBearerToken(req);
    if (!token) {
      legacyError(res, responseMessage("unauthorized"), 401);
      return;
    }

    try {
      const payload = authService.verifyAccessToken(token);
      if (payload.aud !== audience) {
        // An admin token must not satisfy a user guard, or vice versa.
        legacyError(res, responseMessage("forbidden"), 403);
        return;
      }

      const sessionId = (payload as { sid?: string }).sid;

      if (audience === "user") {
        /*
         * A member token with no session claim cannot be tied to a device, so it
         * cannot be revoked either. Refused rather than trusted.
         */
        if (!sessionId || !(await isSessionLive(sessionId, payload.sub))) {
          legacyError(res, "Your session has ended. Please log in again.", 401);
          return;
        }
      }

      req.user = {
        id: payload.sub,
        email: payload.email,
        role: payload.role,
        audience: payload.aud,
        // Present on member tokens only. Identifies the `user_sessions` row, so a
        // single device can be signed out without touching the others.
        sessionId,
      };
      next();
    } catch (err) {
      const status = err instanceof AuthError ? err.status : 401;
      const message = err instanceof AuthError ? err.message : responseMessage("unauthorized");
      legacyError(res, message, status);
    }
  };
}

/**
 * Whether a session row is still live, and still belongs to this member.
 *
 * The `user_id` is part of the lookup rather than assumed: without it, a session id
 * lifted from one token would authenticate against another account's row.
 *
 * Imported lazily so this middleware does not pull the model layer in at module
 * load — `auth.middleware` is imported by every route file, and several of those
 * are loaded before the database connection is established.
 */
async function isSessionLive(sessionId: string, userId: string): Promise<boolean> {
  const { UserSession } = await import("@/models/app_user.model");
  const session = await UserSession.findOne({
    where: { id: sessionId, user_id: userId, revoked_at: null },
    attributes: ["id"],
  });
  return session !== null;
}

/** Require a valid admin access token; attaches `req.user`. */
export const adminAuthGuard: RequestHandler = buildGuard("admin");

/** Require a valid app-user access token; attaches `req.user`. */
export const userAuthGuard: RequestHandler = buildGuard("user");

/**
 * Require one of the given operator roles. Must run after `adminAuthGuard`.
 *
 * `super-admin` is not implicitly granted every permission — a route that should
 * allow it must list it, so the permitted set is always readable at the route.
 *
 * The audience is re-checked here even though `adminAuthGuard` already did it.
 * `req.user.role` is now an `ActorRole`, so without this a member role would be
 * compared against an operator list and quietly fall through to a 403 — which is
 * the right answer by luck rather than by construction. Checking the audience
 * makes it right on purpose, and turns a mis-ordered middleware stack into a
 * clear 401 instead of a confusing 403.
 */
export function checkRole(allowed: AdminRole[]): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || req.user.audience !== "admin") {
      legacyError(res, responseMessage("unauthorized"), 401);
      return;
    }
    if (!allowed.includes(req.user.role as AdminRole)) {
      logger.warn("[rbac] role denied", {
        id: req.user.id,
        role: req.user.role,
        required: allowed,
        path: req.originalUrl,
      });
      legacyError(res, responseMessage("forbidden"), 403);
      return;
    }
    next();
  };
}

/**
 * Require one of the given member roles. Must run after `userAuthGuard`.
 *
 * Kept separate from `checkRole` rather than widening it: the two role sets are
 * disjoint, and a single function taking either would make it possible to write
 * `checkRole(["moderator"])` on an operator route and have it silently never
 * match. Two functions make the audience explicit at the call site.
 */
export function checkUserRole(allowed: UserRole[]): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || req.user.audience !== "user") {
      legacyError(res, responseMessage("unauthorized"), 401);
      return;
    }
    if (!allowed.includes(req.user.role as UserRole)) {
      logger.warn("[rbac] member role denied", {
        id: req.user.id,
        role: req.user.role,
        required: allowed,
        path: req.originalUrl,
      });
      legacyError(res, responseMessage("forbidden"), 403);
      return;
    }
    next();
  };
}

/**
 * Attach `req.user` when a valid token is present, but never reject.
 *
 * For routes whose behaviour is richer for a known caller yet must stay open —
 * useful when the apps begin sending tokens, without a flag day.
 */
export const optionalAuth: RequestHandler = (req, _res, next) => {
  const token = extractBearerToken(req);
  if (!token) return next();
  try {
    const payload = authService.verifyAccessToken(token);
    req.user = {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      audience: payload.aud,
      sessionId: (payload as { sid?: string }).sid,
    };
  } catch {
    // An invalid token is treated as no token on an optional route.
  }
  next();
};
