/**
 * Input sanitisation — prototype pollution and control-character stripping.
 *
 * Joi with `stripUnknown` handles shape and type. This middleware handles two
 * things Joi does not:
 *
 *   1. **Prototype pollution.** A JSON body containing `__proto__`,
 *      `constructor`, or `prototype` as a key can, once merged or spread into an
 *      object, alter `Object.prototype` for the whole process. Those keys are
 *      dropped before any handler sees the body.
 *   2. **Control characters and null bytes.** A NUL inside a string can truncate
 *      values in some drivers and corrupt log output; C0 control characters have
 *      no place in user-supplied text.
 *
 * HTML is deliberately *not* escaped here. This API stores article bodies and
 * incident reports where angle brackets and quotes are legitimate content, and
 * escaping on input would corrupt the stored data. Escaping happens on output
 * instead — `seo.service.ts` (`htmlEscape`) and `syndication.service.ts`
 * (`xmlEscape`) — which is the correct layer for it.
 */

import type { RequestHandler } from "express";
import logger from "@/utils/logger.util";

/** Keys that must never appear in a request payload. */
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

const CHAR_TAB = 0x09;
const CHAR_LF = 0x0a;
const CHAR_CR = 0x0d;
const CHAR_SPACE = 0x20;
const CHAR_DEL = 0x7f;

/**
 * True for C0 control characters and DEL, excluding tab, newline and carriage
 * return — article bodies and incident reports contain real line breaks.
 *
 * Implemented as a code-point test rather than a regex literal so no control
 * character ever appears in this source file.
 */
function isDisallowedControlChar(code: number): boolean {
  if (code === CHAR_TAB || code === CHAR_LF || code === CHAR_CR) return false;
  return code < CHAR_SPACE || code === CHAR_DEL;
}

/** Remove disallowed control characters from a string. */
function cleanString(value: string): string {
  // Fast path: most strings contain nothing to strip.
  let needsCleaning = false;
  for (let i = 0; i < value.length; i++) {
    if (isDisallowedControlChar(value.charCodeAt(i))) {
      needsCleaning = true;
      break;
    }
  }
  if (!needsCleaning) return value;

  let out = "";
  for (let i = 0; i < value.length; i++) {
    if (!isDisallowedControlChar(value.charCodeAt(i))) out += value[i];
  }
  return out;
}

/** Recursively clean a value, guarding against deep or cyclic payloads. */
function cleanValue(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  // A pathologically nested body is a denial-of-service vector, not real data.
  if (depth > 20) return null;

  if (typeof value === "string") return cleanString(value);
  if (value === null || typeof value !== "object") return value;

  if (seen.has(value as object)) return null;
  seen.add(value as object);

  if (Array.isArray(value)) {
    return value.map((item) => cleanValue(item, depth + 1, seen));
  }

  const source = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(source)) {
    if (FORBIDDEN_KEYS.has(key)) continue;
    out[cleanString(key)] = cleanValue(source[key], depth + 1, seen);
  }
  return out;
}

/**
 * Sanitise `body`, `query` and `params`.
 *
 * `req.query` is a getter in newer Express versions, so it is redefined rather
 * than mutated in place.
 */
export const sanitizeRequest: RequestHandler = (req, _res, next) => {
  try {
    if (req.body && typeof req.body === "object") {
      req.body = cleanValue(req.body, 0, new WeakSet()) as typeof req.body;
    }

    if (req.query && typeof req.query === "object") {
      const cleanedQuery = cleanValue(req.query, 0, new WeakSet());
      Object.defineProperty(req, "query", {
        value: cleanedQuery,
        configurable: true,
        writable: true,
      });
    }

    if (req.params && typeof req.params === "object") {
      const cleanedParams = cleanValue(req.params, 0, new WeakSet()) as Record<string, string>;
      for (const key of Object.keys(req.params)) delete req.params[key];
      Object.assign(req.params, cleanedParams);
    }

    next();
  } catch (err) {
    logger.warn("[sanitize] failed to clean request", {
      message: err instanceof Error ? err.message : String(err),
    });
    // Reject rather than pass through un-sanitised input.
    next(err);
  }
};

export default sanitizeRequest;
