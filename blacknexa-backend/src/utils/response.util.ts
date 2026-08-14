/**
 * Centralised response layer.
 *
 * Two emitters live here, and every controller uses one of them so the response
 * surface is defined in exactly one file.
 *
 * 1. `responseData()` — the project's unified standard:
 *      { success: 1 | 0, message, result, pagination?, error? }
 *    Used by all endpoints introduced by this service (`/api/v1/admin/*`).
 *
 * 2. `legacyJson()` / `legacyError()` — byte-compatible with the Cloudflare
 *    Worker this service replaces. The shipped Expo and iOS apps read boolean
 *    `success` plus per-endpoint payload keys (`data`, `article`, `profile`,
 *    `balance`, `creator`, `tip`, `payout`, …). Migrating those 61 routes to
 *    `responseData()` would break every screen in both apps, and preserving the
 *    contract was the stated hard requirement for this migration, so the legacy
 *    shape is kept — but funnelled through here rather than hand-built per route.
 *
 * Flipping a migrated route onto the unified standard, once the apps are
 * revised, is a one-line change inside its controller.
 */

import type { Response } from "express";

// ─────────────────────────────────────────────────────────────────────────────
// Unified standard
// ─────────────────────────────────────────────────────────────────────────────

/** Pagination block for list endpoints using the unified standard. */
export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

export interface StandardResponse<T = unknown> {
  success: 1 | 0;
  message: string;
  result: T;
  pagination?: Pagination;
  error?: string;
}

export interface ResponseDataOptions<T> {
  res: Response;
  status?: number;
  message: string;
  result?: T;
  pagination?: Pagination;
  /** Client-safe error string. Never pass a stack trace or a driver message. */
  error?: string;
}

/**
 * Emit a response in the unified project standard.
 *
 * `success` is derived from the HTTP status so a controller cannot accidentally
 * return `success: 1` alongside a 4xx.
 */
export function responseData<T>({
  res,
  status = 200,
  message,
  result,
  pagination,
  error,
}: ResponseDataOptions<T>): Response {
  const ok = status >= 200 && status < 400;
  const body: StandardResponse<T | null> = {
    success: ok ? 1 : 0,
    message,
    result: (result ?? null) as T | null,
  };
  if (pagination) body.pagination = pagination;
  if (error) body.error = error;
  return res.status(status).json(body);
}

/** Build a pagination block from page/limit/total. */
export function buildPagination(page: number, limit: number, total: number): Pagination {
  const safeLimit = limit > 0 ? limit : 1;
  const totalPages = Math.max(1, Math.ceil(total / safeLimit));
  return {
    page,
    limit: safeLimit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrevious: page > 1,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Legacy (Worker-compatible) emitters
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Emit a legacy success payload: `{ success: true, ...payload }`.
 *
 * `success` is written first so a payload key of the same name cannot silently
 * override it — and if a route genuinely needs a different `success` value, it
 * must say so explicitly in the payload.
 */
export function legacyJson(res: Response, payload: object, status = 200): Response {
  return res.status(status).json({ success: true, ...payload });
}

/**
 * Emit a legacy error payload: `{ success: false, error }`.
 *
 * Matches the Worker's failure shape exactly — the clients read `body.error` for
 * their user-facing message (see NewsProvider.tsx and TippingDashboard.tsx).
 */
export function legacyError(res: Response, error: string, status = 400): Response {
  return res.status(status).json({ success: false, error });
}

/**
 * Emit a legacy `message`-keyed error. A handful of Worker routes used `message`
 * instead of `error` (`GET /news/:slug`, the 404 route list), and the clients
 * read that key, so the distinction is preserved.
 */
export function legacyMessage(res: Response, message: string, status = 404): Response {
  return res.status(status).json({ success: false, message });
}

/** Emit a bare (unwrapped) object, for routes whose payload has no envelope. */
export function rawJson(res: Response, payload: unknown, status = 200): Response {
  return res.status(status).json(payload);
}
