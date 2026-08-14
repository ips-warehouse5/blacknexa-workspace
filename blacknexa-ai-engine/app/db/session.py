"""Async SQLAlchemy engine and session factory.

Persistence is optional. With no `DATABASE_URL` the engine runs stateless: the
session factory is never created and every repository write becomes a no-op. That
keeps the AI engine deployable on its own, which is the normal case — the run log
is observability, not a dependency of generation.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

_engine: AsyncEngine | None = None
_session_factory: async_sessionmaker[AsyncSession] | None = None


def _normalise_dsn(url: str) -> str:
    """Force the asyncpg driver.

    A `postgres://` or `postgresql://` DSN copied from the Node service would
    otherwise select the sync psycopg driver and fail under the async engine.
    """
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql+asyncpg://", 1)
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+asyncpg://", 1)
    return url


def init_engine() -> None:
    """Create the engine and session factory. No-op when persistence is disabled."""
    global _engine, _session_factory

    if not settings.persistence_enabled:
        logger.info("persistence_disabled", reason="DATABASE_URL is not set")
        return
    if _engine is not None:
        return

    _engine = create_async_engine(
        _normalise_dsn(settings.database_url),
        echo=settings.db_echo,
        pool_size=settings.db_pool_size,
        max_overflow=settings.db_pool_size,
        pool_pre_ping=True,
    )
    _session_factory = async_sessionmaker(
        _engine, class_=AsyncSession, expire_on_commit=False
    )
    logger.info("persistence_enabled", pool_size=settings.db_pool_size)


async def dispose_engine() -> None:
    """Release the pool during shutdown."""
    global _engine, _session_factory
    if _engine is not None:
        await _engine.dispose()
        logger.info("db_pool_disposed")
    _engine = None
    _session_factory = None


def is_enabled() -> bool:
    return _session_factory is not None


@asynccontextmanager
async def session_scope() -> AsyncIterator[AsyncSession | None]:
    """A transactional session, or `None` when persistence is off.

    Yielding `None` rather than raising lets callers write
    `async with session_scope() as s: if s is None: return`, so a stateless
    deployment needs no branching at the call site beyond that guard.
    """
    if _session_factory is None:
        yield None
        return

    async with _session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
