/**
 * Scheduled jobs — replaces the Durable Object alarms.
 *
 * The Worker self-armed two alarms:
 *   • `NewsStore` fired at 06:00 UTC daily and ran the grounded article batch.
 *   • `PlatformStore` fired every 60 seconds to drain the queue, prune the cache,
 *     prune old jobs, and take an auto-snapshot.
 *
 * Both are `node-cron` schedules here, with the same cadence by default.
 *
 * **Enable on exactly one replica.** `ENABLE_CRON` defaults to false for that
 * reason: with N replicas all scheduling, the daily batch would run N times and
 * spend N times the gateway budget. The overlap guards below prevent a *single*
 * replica from stacking runs, but they cannot coordinate across processes.
 */

import cron, { type ScheduledTask } from "node-cron";
import env from "@/config/env.config";
import logger from "@/utils/logger.util";
import newsService from "@/services/news.service";
import queueService from "@/services/queue.service";
import platformCacheService from "@/services/platform_cache.service";
import persistenceService from "@/services/persistence.service";
import seoService from "@/services/seo.service";
import { backgroundOrigin } from "@/utils/origin.util";
import { DEFAULTS } from "@/config/constants";

const tasks: ScheduledTask[] = [];

/**
 * Guards against a run starting while the previous one is still going.
 *
 * The daily batch generates 30 articles and can outlast a minute-scale schedule if
 * the gateway is slow; the maintenance job is short but runs every minute.
 */
const running = { dailyNews: false, maintenance: false };

/** Run the daily grounded-article batch, then ping the search engines. */
export async function runDailyNewsJob(): Promise<void> {
  if (running.dailyNews) {
    logger.warn("[cron] daily news batch already running — skipping this tick");
    return;
  }
  running.dailyNews = true;
  const startedAt = Date.now();

  try {
    const result = await newsService.runDailyBatch(false, backgroundOrigin());
    logger.info("[cron] daily news batch finished", {
      ...result,
      durationMs: Date.now() - startedAt,
    });

    if (result.slugs.length > 0) {
      await seoService.pingIndexNow(result.slugs);
      await seoService.pingSitemapEngines();
    }
  } catch (err) {
    // Never rethrow from a cron callback: an unhandled rejection here would take
    // the process down and stop the schedule entirely.
    logger.error("[cron] daily news batch failed", {
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
  } finally {
    running.dailyNews = false;
  }
}

/**
 * Platform maintenance: drain the queue, prune expired cache, prune old completed
 * jobs, and take an auto-snapshot so a recent restore point always exists.
 *
 * Each step is independently guarded — a snapshot failure must not stop the queue
 * from draining.
 */
export async function runPlatformMaintenanceJob(): Promise<void> {
  if (running.maintenance) return;
  running.maintenance = true;

  try {
    const processed = await queueService.drain(DEFAULTS.QUEUE_DRAIN_LIMIT);
    if (processed > 0) logger.debug("[cron] queue drained", { processed });
  } catch (err) {
    logger.warn("[cron] queue drain failed", {
      message: err instanceof Error ? err.message : String(err),
    });
  }

  try {
    await platformCacheService.pruneExpired();
    await queueService.pruneOldJobs(DEFAULTS.QUEUE_PRUNE_DAYS);
  } catch (err) {
    logger.warn("[cron] prune failed", {
      message: err instanceof Error ? err.message : String(err),
    });
  }

  try {
    const snapshot = await persistenceService.snapshotAllTables();
    await persistenceService.storeSnapshot(snapshot, true);
    await persistenceService.pruneOldSnapshots(DEFAULTS.SNAPSHOT_RETENTION);
  } catch (err) {
    logger.warn("[cron] auto-snapshot failed", {
      message: err instanceof Error ? err.message : String(err),
    });
  }

  running.maintenance = false;
}

/** Register the schedules. No-op when `ENABLE_CRON` is false. */
export function startJobs(): void {
  if (!env.jobs.enableCron) {
    logger.info("[cron] disabled (ENABLE_CRON=false) — no scheduled jobs registered");
    return;
  }

  if (!cron.validate(env.jobs.dailyNewsCron)) {
    logger.error("[cron] CRON_DAILY_NEWS is not a valid expression — daily batch not scheduled", {
      expression: env.jobs.dailyNewsCron,
    });
  } else {
    tasks.push(
      cron.schedule(env.jobs.dailyNewsCron, () => void runDailyNewsJob(), {
        // The Worker's alarm fired at 06:00 UTC; keep the schedule in UTC so the
        // batch does not drift with server locale or daylight saving.
        timezone: "UTC",
      }),
    );
    logger.info(`[cron] daily news batch scheduled: ${env.jobs.dailyNewsCron} UTC`);
  }

  if (!cron.validate(env.jobs.platformMaintenanceCron)) {
    logger.error(
      "[cron] CRON_PLATFORM_MAINTENANCE is not a valid expression — maintenance not scheduled",
      { expression: env.jobs.platformMaintenanceCron },
    );
  } else {
    tasks.push(
      cron.schedule(env.jobs.platformMaintenanceCron, () => void runPlatformMaintenanceJob(), {
        timezone: "UTC",
      }),
    );
    logger.info(`[cron] platform maintenance scheduled: ${env.jobs.platformMaintenanceCron} UTC`);
  }
}

/** Stop every schedule during shutdown. */
export function stopJobs(): void {
  for (const task of tasks) task.stop();
  tasks.length = 0;
}
