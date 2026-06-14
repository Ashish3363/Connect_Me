"""Background scheduler for the message-expiration cleanup job.

A single asyncio task, started in the FastAPI lifespan, runs one cleanup pass
on startup and then every ``MESSAGE_CLEANUP_INTERVAL_MINUTES``. Because it lives
inside the app process it restarts automatically whenever the service
(re)starts — there is no separate worker to keep alive, and no in-memory state
to lose: Postgres is the source of truth and every run recomputes the cutoff
from the clock.

Multi-instance safety: each cycle first tries a Postgres *session* advisory
lock. If another instance already holds it, this instance skips the delete for
that cycle (the work is idempotent, but the lock avoids N instances scanning the
same rows at once). The lock is connection-scoped and released at cycle end.

Shutdown is prompt: the loop waits on an ``asyncio.Event`` rather than a bare
sleep, so ``stop()`` wakes it immediately instead of blocking up to an hour.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone

from sqlalchemy import func, select

from app.core.config import Settings
from app.db.session import AsyncSessionLocal
from app.services import cleanup

logger = logging.getLogger(__name__)

# Arbitrary fixed key identifying "the message-cleanup job" across instances.
_ADVISORY_LOCK_KEY = 0x6D73_6763  # "msgc"


class CleanupScheduler:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._task: asyncio.Task | None = None
        self._stop = asyncio.Event()

    # -- lifecycle ----------------------------------------------------------
    def start(self) -> None:
        if self._task is not None:
            return
        self._stop.clear()
        self._task = asyncio.create_task(self._run(), name="message-cleanup")
        logger.info(
            "cleanup: scheduler started (every %d min, retention %dh, room cleanup %s)",
            self._settings.message_cleanup_interval_minutes,
            self._settings.message_retention_hours,
            "on" if self._settings.enable_room_cleanup else "off",
        )

    async def stop(self) -> None:
        if self._task is None:
            return
        self._stop.set()
        self._task.cancel()
        try:
            await self._task
        except asyncio.CancelledError:
            pass
        self._task = None

    # -- loop ---------------------------------------------------------------
    async def _run(self) -> None:
        interval = self._settings.message_cleanup_interval_minutes * 60
        try:
            while not self._stop.is_set():
                await self.run_once()
                # Wait out the interval, but wake immediately on shutdown.
                try:
                    await asyncio.wait_for(self._stop.wait(), timeout=interval)
                except asyncio.TimeoutError:
                    pass  # interval elapsed — run again
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("cleanup: scheduler loop crashed")

    async def run_once(self) -> cleanup.CleanupResult | None:
        """Run one cleanup pass, guarded by the advisory lock. Never raises.

        Returns the result, or None if another instance held the lock or the
        run failed (already logged). Exposed for tests and manual invocation.
        """
        now = datetime.now(timezone.utc)
        try:
            async with AsyncSessionLocal() as session:
                got_lock = await session.scalar(
                    select(func.pg_try_advisory_lock(_ADVISORY_LOCK_KEY))
                )
                if not got_lock:
                    logger.debug("cleanup: another instance holds the lock; skipping")
                    return None
                try:
                    result = await cleanup.run_cleanup(
                        session,
                        now=now,
                        retention_hours=self._settings.message_retention_hours,
                        enable_room_cleanup=self._settings.enable_room_cleanup,
                        room_retention_days=self._settings.room_retention_days,
                    )
                finally:
                    await session.execute(
                        select(func.pg_advisory_unlock(_ADVISORY_LOCK_KEY))
                    )
        except Exception:
            logger.exception("cleanup: run failed")
            return None

        if result.messages or result.rooms:
            logger.info(
                "cleanup: deleted %d expired message(s) "
                "(%d room, %d private)%s",
                result.messages,
                result.room_messages,
                result.private_messages,
                f" and {result.rooms} inactive room(s)" if result.rooms else "",
            )
        else:
            logger.info("cleanup: nothing to delete")
        return result
