"""Run-log retention worker.

Run-log rows accumulate at roughly one per generation — the daily batch alone adds
60+ a day — so the table needs a lifecycle. This deletes anything past
`RUN_LOG_RETENTION_DAYS`.

Invoke from the host scheduler (cron, a Kubernetes CronJob) rather than in-process:
the engine may run on several replicas and an in-process timer would prune N times.

    python -m app.workers.cleanup [--days 30]
"""

from __future__ import annotations

import argparse
import asyncio

from app.core.config import settings
from app.core.logging import configure_logging, get_logger
from app.db.session import dispose_engine, init_engine, is_enabled
from app.repositories.run_log import prune_old_runs

logger = get_logger(__name__)


async def _main(days: int | None) -> int:
    init_engine()
    if not is_enabled():
        logger.info("cleanup_skipped", reason="persistence is disabled")
        return 0
    try:
        return await prune_old_runs(days)
    finally:
        await dispose_engine()


def main() -> None:
    configure_logging()
    parser = argparse.ArgumentParser(description="Prune old AI generation run logs.")
    parser.add_argument(
        "--days",
        type=int,
        default=settings.run_log_retention_days,
        help="Retention window in days.",
    )
    args = parser.parse_args()

    removed = asyncio.run(_main(args.days))
    logger.info("cleanup_complete", removed=removed, retention_days=args.days)


if __name__ == "__main__":  # pragma: no cover
    main()
