/**
 * Request logging and correlation ids.
 *
 * `logUrl` assigns a short id to every request, echoes it in the
 * `X-Request-Id` response header, and logs method, path, status and duration on
 * completion. The same id appears in any error logged by the error handler, so a
 * client-reported failure can be traced to one line in the log.
 *
 * Query strings are logged with sensitive keys masked — `?userId=` and friends
 * appear in this API's query strings and should not be written to disk verbatim.
 */

import type { RequestHandler } from "express";
import logger from "@/utils/logger.util";
import { uuid } from "@/utils/id.util";

/** Query parameters whose values are masked in logs. */
const SENSITIVE_QUERY_KEYS = new Set(["userid", "token", "key", "secret", "password", "email"]);

/** Headers whose presence is worth logging but whose values never are. */
const SENSITIVE_HEADERS = new Set(["authorization", "idempotency-key", "cookie"]);

/** Render a query object with sensitive values masked. */
function maskedQuery(query: unknown): string {
  if (!query || typeof query !== "object") return "";
  const entries = Object.entries(query as Record<string, unknown>);
  if (entries.length === 0) return "";
  const parts = entries.map(([k, v]) => {
    if (SENSITIVE_QUERY_KEYS.has(k.toLowerCase())) return `${k}=***`;
    const value = Array.isArray(v) ? v.join(",") : String(v ?? "");
    return `${k}=${value.length > 64 ? `${value.slice(0, 64)}…` : value}`;
  });
  return `?${parts.join("&")}`;
}

export const logUrl: RequestHandler = (req, res, next) => {
  const requestId = uuid().slice(0, 8);
  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);

  const startedAt = process.hrtime.bigint();

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const authPresent = SENSITIVE_HEADERS.has("authorization")
      ? Boolean(req.headers.authorization)
      : false;

    const payload = {
      requestId,
      method: req.method,
      path: `${req.path}${maskedQuery(req.query)}`,
      status: res.statusCode,
      durationMs: Number(durationMs.toFixed(1)),
      ip: req.ip,
      authenticated: authPresent,
      actor: req.user?.id,
    };

    // 5xx is an operational problem; 4xx is usually a client problem worth seeing.
    if (res.statusCode >= 500) {
      logger.error("[http] <-", payload);
    } else if (res.statusCode >= 400) {
      logger.warn("[http] <-", payload);
    } else {
      logger.http("[http] <-", payload);
    }
  });

  next();
};

export default logUrl;
