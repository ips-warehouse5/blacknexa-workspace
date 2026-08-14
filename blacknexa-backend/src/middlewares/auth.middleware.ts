/**
 * Authentication guards and role-based access control.
 *
 * `adminAuthGuard` protects the destructive and operational routes that were
 * completely open in the Worker — daily refresh, backfills, duplicate pruning,
 * cache/queue admin, payout status transitions, and persistence restore.
 *
 * `userAuthGuard` is implemented and ready but is not currently attached to any
 * route: the mobile apps hold no token for this API (they authenticate against a
 * separate Rork OAuth host), so guarding a public read such as `/news/feed` would
 * break both apps on the next request. When the apps start issuing backend
 * tokens, attaching it is a one-line change per route.
 */

import type { NextFunction, Request, RequestHandler, Response } from "express";
import authService, { AuthError } from "@/services/auth.service";
import { legacyError } from "@/utils/response.util";
import responseMessage from "@/utils/response_message.util";
import logger from "@/utils/logger.util";
import type { AdminRole, TokenAudience } from "@/types/admin.interface";

/** Pull a bearer token out of the Authorization header. */
function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (!scheme || scheme.toLowerCase() !== "bearer" || !token) return null;
  return token.trim() || null;
}

/** Build a guard for a given audience. */
function buildGuard(audience: TokenAudience): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
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
      req.user = {
        id: payload.sub,
        email: payload.email,
        role: payload.role,
        audience: payload.aud,
      };
      next();
    } catch (err) {
      const status = err instanceof AuthError ? err.status : 401;
      const message = err instanceof AuthError ? err.message : responseMessage("unauthorized");
      legacyError(res, message, status);
    }
  };
}

/** Require a valid admin access token; attaches `req.user`. */
export const adminAuthGuard: RequestHandler = buildGuard("admin");

/** Require a valid app-user access token; attaches `req.user`. */
export const userAuthGuard: RequestHandler = buildGuard("user");

/**
 * Require one of the given roles. Must run after an auth guard.
 *
 * `super-admin` is not implicitly granted every permission — a route that should
 * allow it must list it, so the permitted set is always readable at the route.
 */
export function checkRole(allowed: AdminRole[]): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      legacyError(res, responseMessage("unauthorized"), 401);
      return;
    }
    if (!allowed.includes(req.user.role)) {
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
    };
  } catch {
    // An invalid token is treated as no token on an optional route.
  }
  next();
};
