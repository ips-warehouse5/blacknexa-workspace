/**
 * Express request augmentation.
 *
 * `req.user` is attached by `userAuthGuard` / `adminAuthGuard`.
 * `req.validated` holds the Joi-validated, `stripUnknown`-ed values so a
 * controller never reads the raw `req.body` and cannot be mass-assigned.
 */

import type { AuthenticatedActor } from "@/types/admin.interface";

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedActor;
      validated?: {
        body?: Record<string, unknown>;
        query?: Record<string, unknown>;
        params?: Record<string, unknown>;
      };
      /** Correlation id assigned per request, echoed in error logs. */
      requestId?: string;
    }
  }
}

export {};
