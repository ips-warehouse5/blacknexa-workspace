/**
 * Central error handling and the 404 fallback.
 *
 * The single rule this file enforces: **internal detail never reaches the client
 * in production.** Stack traces, Sequelize messages, generated SQL, constraint
 * names, and provider bodies are logged server-side and replaced with a generic
 * message in the response. Leaking a Postgres error text is a reconnaissance gift
 * — it names tables, columns and constraints.
 *
 * Expected, client-caused failures (validation, auth, not-found) keep their
 * specific message, because that is information the caller is entitled to and
 * needs in order to fix the request.
 */

import type { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from "express";
import { BaseError as SequelizeBaseError, ValidationError as SequelizeValidationError } from "sequelize";
import env from "@/config/env.config";
import logger from "@/utils/logger.util";
import { legacyError } from "@/utils/response.util";
import { AuthError } from "@/services/auth.service";

/** An error with an intentional HTTP status and a client-safe message. */
export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number = 500,
    /** Set false to suppress the message in production. */
    readonly clientSafe: boolean = true,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

/** 400 — malformed request. */
export const badRequest = (message: string): HttpError => new HttpError(message, 400);
/** 404 — resource absent. */
export const notFound = (message: string): HttpError => new HttpError(message, 404);
/** 403 — authenticated but not permitted. */
export const forbidden = (message: string): HttpError => new HttpError(message, 403);

/**
 * Wrap an async handler so a rejected promise reaches this error handler.
 *
 * Express 4 does not forward async rejections on its own; without this an
 * unhandled rejection would hang the request and could take the process down.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    void Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * 404 handler.
 *
 * Kept in the Worker's shape (`{ success: false, message: "Not found." }`) so a
 * client hitting a stale path gets the response it already handles.
 */
export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    success: false,
    message: "Not found.",
    path: req.originalUrl,
  });
};

/** Map a thrown value to a status and a client-facing message. */
function classify(err: unknown): { status: number; message: string; exposeMessage: boolean } {
  if (err instanceof HttpError) {
    return { status: err.status, message: err.message, exposeMessage: err.clientSafe };
  }
  if (err instanceof AuthError) {
    return { status: err.status, message: err.message, exposeMessage: true };
  }

  // Sequelize validation and constraint violations are caused by the request, but
  // their messages name columns and constraints — so a generic message is used.
  if (err instanceof SequelizeValidationError) {
    return {
      status: 400,
      message: "One or more values in the request are invalid.",
      exposeMessage: true,
    };
  }
  if (err instanceof SequelizeBaseError) {
    return { status: 500, message: "A database error occurred.", exposeMessage: true };
  }

  // Body-parser failures arrive as a SyntaxError with a `body` property.
  if (err instanceof SyntaxError && "body" in err) {
    return { status: 400, message: "Request body is not valid JSON.", exposeMessage: true };
  }

  return { status: 500, message: "An unexpected error occurred.", exposeMessage: false };
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const { status, message, exposeMessage } = classify(err);

  // Everything internal goes to the log, never to the response.
  const logPayload = {
    requestId: req.requestId,
    method: req.method,
    path: req.originalUrl,
    status,
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
    // Present on Sequelize errors; genuinely useful when diagnosing a 500.
    sql: (err as { sql?: string }).sql,
  };

  if (status >= 500) {
    logger.error("[http] request failed", logPayload);
  } else {
    logger.warn("[http] request rejected", logPayload);
  }

  // In production an unclassified 500 always returns the generic string.
  const clientMessage =
    exposeMessage || !env.isProduction ? message : "An unexpected error occurred.";

  // Legacy error envelope — the mobile clients read `body.error`.
  legacyError(res, clientMessage, status);
};

/**
 * Last-resort process guards.
 *
 * An unhandled rejection or uncaught exception leaves the process in an unknown
 * state. It is logged and, in production, the process exits so the orchestrator
 * can replace it with a clean one rather than serving from a corrupted runtime.
 */
export function installProcessGuards(): void {
  process.on("unhandledRejection", (reason) => {
    logger.error("[process] unhandled promise rejection", {
      message: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    });
  });

  process.on("uncaughtException", (err) => {
    logger.error("[process] uncaught exception", {
      message: err.message,
      stack: err.stack,
    });
    if (env.isProduction) {
      // Give the logger a moment to flush, then let the supervisor restart us.
      setTimeout(() => process.exit(1), 250);
    }
  });
}
