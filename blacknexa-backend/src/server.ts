/**
 * Server bootstrap.
 *
 * Boot order is chosen so a misconfigured deployment fails before it can accept
 * traffic and appear healthy:
 *
 *   1. Validate the environment (this happens on import of `env.config`, which
 *      exits the process on a bad or missing value).
 *   2. Verify the database connection.
 *   3. Sync the schema when `DB_SYNC` is on (development only — env validation
 *      refuses to start production with it enabled).
 *   4. Bootstrap the first admin if `ADMIN_BOOTSTRAP_*` is set and none exists.
 *   5. Seed articles if the table is empty, so the feed is never blank.
 *   6. Start listening, attach the WebSocket hub, register the cron schedules.
 *
 * Shutdown drains in the reverse order and is bounded by a timeout, so a stuck
 * connection cannot block a rolling deploy indefinitely.
 */

import http from "http";
import env from "@/config/env.config";
import logger from "@/utils/logger.util";
import { assertDatabaseConnection, sequelize } from "@/config/database.config";
import { syncModels } from "@/models";
import { createApp } from "@/app";
import { attachLiveChat, closeLiveChat } from "@/websocket/live_chat";
import { startJobs, stopJobs } from "@/jobs";
import authService from "@/services/auth.service";
import newsService from "@/services/news.service";
import aiEngineClient from "@/services/ai_engine.client";
import { installProcessGuards } from "@/middlewares/error.middleware";
import { registeredSchemaNames } from "@/validations";

/** Force-exit deadline if graceful shutdown stalls. */
const SHUTDOWN_TIMEOUT_MS = 15_000;

let server: http.Server | null = null;
let shuttingDown = false;

async function bootstrap(): Promise<void> {
  installProcessGuards();

  // The AI path is served either by the Python engine or by the in-process
  // implementation, so the banner reports which one is actually active. Saying
  // "not configured" when the engine is up would send an operator to the wrong
  // place during an incident.
  const aiMode = aiEngineClient.isConfigured
    ? "python-engine"
    : env.ai.enabled
      ? "in-process"
      : "not configured";

  logger.info("─".repeat(72));
  logger.info("BlackNexa Backend — News, Geo-Legal, Platform & Enterprise API");
  logger.info(
    `env=${env.nodeEnv}  port=${env.port}  cron=${env.jobs.enableCron ? "on" : "off"}  ai=${aiMode}`,
  );
  logger.info("─".repeat(72));

  // 2. Database.
  await assertDatabaseConnection();

  // 3. Schema.
  await syncModels();

  // 4. First operator account, if requested and none exists.
  await authService.bootstrapAdmin();

  // 5. Seed articles so the feed renders before any AI run.
  //    Non-fatal: a seeding failure should not stop the API from serving.
  try {
    await newsService.ensureSeed();
  } catch (err) {
    logger.warn("[boot] article seeding failed — the feed may be empty until the daily batch runs", {
      message: err instanceof Error ? err.message : String(err),
    });
  }

  if (aiEngineClient.isConfigured) {
    // Probe it now rather than discovering it on the first reader's request.
    const health = await aiEngineClient.health();
    if (health) {
      logger.info("[boot] Python AI engine reachable", {
        url: env.aiEngine.url,
        gatewayConfigured: health.aiGatewayConfigured,
      });
      if (!health.aiGatewayConfigured) {
        logger.warn(
          "[boot] the AI engine is reachable but has no gateway key — generation will fail there",
        );
      }
    } else {
      logger.warn(
        "[boot] Python AI engine is configured but not reachable. News AI will fall back to " +
          "the in-process path, which needs AI_TOOLKIT_SECRET_KEY to be set here.",
        { url: env.aiEngine.url },
      );
    }
  }

  if (!env.ai.enabled && !aiEngineClient.isConfigured) {
    logger.warn(
      "[boot] No AI path is configured. Generation returns 500, translations fall back to " +
        "English, and geo-legal lookups use the curated jurisdiction database only.",
    );
  } else if (!env.ai.enabled && aiEngineClient.isConfigured) {
    // Normal production shape: the gateway secret lives in the engine only.
    logger.info(
      "[boot] news AI is served by the Python engine; no in-process fallback is available " +
        "(AI_TOOLKIT_SECRET_KEY is unset here). Geo-legal AI is unavailable and will use the " +
        "curated jurisdiction database.",
    );
  }

  // 6. Listen.
  const app = createApp();
  server = http.createServer(app);

  attachLiveChat(server);

  await new Promise<void>((resolve, reject) => {
    server!.once("error", reject);
    server!.listen(env.port, () => {
      server!.removeListener("error", reject);
      resolve();
    });
  });

  logger.info(`[boot] listening on http://localhost:${env.port}`);
  logger.debug(`[boot] ${registeredSchemaNames().length} validation schemas registered`);

  startJobs();

  registerShutdownHandlers();
}

/**
 * Drain in reverse order: stop taking new work, close sockets, close the HTTP
 * server, then release the database pool.
 */
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`[shutdown] ${signal} received — draining`);

  const forceExit = setTimeout(() => {
    logger.error("[shutdown] graceful shutdown timed out — forcing exit");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  try {
    stopJobs();
    await closeLiveChat();

    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      logger.info("[shutdown] HTTP server closed");
    }

    await sequelize.close();
    logger.info("[shutdown] database pool closed");

    clearTimeout(forceExit);
    process.exit(0);
  } catch (err) {
    logger.error("[shutdown] failed", {
      message: err instanceof Error ? err.message : String(err),
    });
    process.exit(1);
  }
}

function registerShutdownHandlers(): void {
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

void bootstrap().catch((err: unknown) => {
  logger.error("[boot] startup failed", {
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  process.exit(1);
});
