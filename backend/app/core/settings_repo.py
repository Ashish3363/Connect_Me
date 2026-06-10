"""Loads runtime-tunable values from the `app_settings` table.

A tiny TTL cache keeps hot reads off the DB. Bump the cache TTL or call
`invalidate()` after admin updates to a key.
"""
from __future__ import annotations

import time
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.app_setting import AppSetting

_CACHE_TTL_SECONDS = 30


@dataclass
class _CachedValue:
    value: object
    expires_at: float


_cache: dict[str, _CachedValue] = {}


async def get_int(session: AsyncSession, key: str, default: int) -> int:
    cached = _cache.get(key)
    now = time.monotonic()
    if cached and cached.expires_at > now:
        return int(cached.value)  # type: ignore[arg-type]

    row = await session.scalar(select(AppSetting).where(AppSetting.key == key))
    value = int(row.value) if row is not None else default
    _cache[key] = _CachedValue(value=value, expires_at=now + _CACHE_TTL_SECONDS)
    return value


def invalidate(key: str | None = None) -> None:
    if key is None:
        _cache.clear()
    else:
        _cache.pop(key, None)
