/**
 * Joi validation middleware.
 *
 * `validate('schemaName')` looks the schema up in the registry and validates
 * `body`, `params` and `query` before the controller runs.
 *
 * Two options matter for security:
 *   • `stripUnknown: true` — anything not declared in the schema is removed. This
 *     is the mass-assignment defence: a caller cannot smuggle `verified: true`
 *     into a creator registration, or `status: "succeeded"` into a tip.
 *   • `abortEarly: false` — all problems are reported at once, so a client is not
 *     forced into a fix-one-retry loop.
 *
 * The cleaned values are written to `req.validated` **and** back onto `req.body` /
 * `req.query` / `req.params`, so a controller reading either sees sanitised input.
 */

import type { NextFunction, Request, RequestHandler, Response } from "express";
import type Joi from "joi";
import { legacyError } from "@/utils/response.util";
import { getSchema, type ValidationTarget } from "@/validations";

const VALIDATION_OPTIONS: Joi.ValidationOptions = {
  abortEarly: false,
  // Remove undeclared keys — the mass-assignment guard.
  stripUnknown: true,
  // Coerce query-string values ("5" → 5, "true" → true).
  convert: true,
  allowUnknown: false,
};

/** Flatten Joi details into one readable sentence. */
function formatError(error: Joi.ValidationError): string {
  const seen = new Set<string>();
  const messages: string[] = [];
  for (const detail of error.details) {
    const msg = detail.message.replace(/"/g, "'");
    if (!seen.has(msg)) {
      seen.add(msg);
      messages.push(msg);
    }
  }
  return messages.join("; ");
}

/**
 * Validate the request against a named schema.
 *
 * @param schemaName Key in the validation registry.
 */
export function validate(schemaName: string): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const schema = getSchema(schemaName);
    if (!schema) {
      // A missing schema is a programming error, not a client error — fail loudly
      // rather than silently letting unvalidated input through.
      next(new Error(`Validation schema '${schemaName}' is not registered`));
      return;
    }

    req.validated = req.validated ?? {};

    const targets: ValidationTarget[] = ["params", "query", "body"];
    for (const target of targets) {
      const targetSchema = schema[target];
      if (!targetSchema) continue;

      const { value, error } = targetSchema.validate(req[target] ?? {}, VALIDATION_OPTIONS);
      if (error) {
        legacyError(res, formatError(error), 400);
        return;
      }

      req.validated[target] = value as Record<string, unknown>;
      // Reflect the cleaned values back so either access path is safe.
      if (target === "body") {
        req.body = value;
      } else if (target === "params") {
        // `req.params` has a read-only-ish shape in Express 5; assign per key.
        Object.assign(req.params, value);
      } else {
        Object.defineProperty(req, "query", { value, configurable: true, writable: true });
      }
    }

    next();
  };
}

/** Read a validated body, falling back to `req.body` for unvalidated routes. */
export function validatedBody<T>(req: Request): T {
  return (req.validated?.body ?? req.body ?? {}) as T;
}

/** Read a validated query. */
export function validatedQuery<T>(req: Request): T {
  return (req.validated?.query ?? req.query ?? {}) as T;
}

/** Read validated params. */
export function validatedParams<T>(req: Request): T {
  return (req.validated?.params ?? req.params ?? {}) as T;
}
