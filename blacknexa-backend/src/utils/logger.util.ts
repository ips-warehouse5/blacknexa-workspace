/**
 * Winston logger.
 *
 * This is the only place internal error detail (stack traces, SQL, provider
 * bodies) is allowed to land. The HTTP error handler logs here and returns a
 * sanitised message to the client — see middlewares/error.middleware.ts.
 */

import winston from "winston";
import env from "@/config/env.config";

const { combine, timestamp, printf, colorize, errors, json } = winston.format;

const devFormat = combine(
  colorize({ level: true }),
  timestamp({ format: "HH:mm:ss.SSS" }),
  errors({ stack: true }),
  printf((info) => {
    const { level, message, timestamp: ts, stack, ...meta } = info;
    const metaKeys = Object.keys(meta).filter((k) => k !== "splat");
    const metaStr = metaKeys.length > 0 ? ` ${JSON.stringify(meta)}` : "";
    const stackStr = stack ? `\n${stack}` : "";
    return `${ts} ${level} ${message}${metaStr}${stackStr}`;
  }),
);

const prodFormat = combine(timestamp(), errors({ stack: true }), json());

export const logger = winston.createLogger({
  level: env.logLevel,
  format: env.isProduction ? prodFormat : devFormat,
  transports: [new winston.transports.Console({ handleExceptions: false })],
  exitOnError: false,
});

/**
 * Run a promise detached from the request lifecycle.
 *
 * Replaces the Durable Object's `ctx.waitUntil(...)`. The Worker used it to
 * generate images, audio and translations after responding; here the promise
 * simply continues on the event loop. Rejections are logged rather than becoming
 * an unhandled rejection that could take the process down.
 */
export function runBackground(promise: Promise<unknown>, label = "background task"): void {
  void promise.catch((err: unknown) => {
    logger.warn(`${label} failed`, {
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
  });
}

export default logger;
