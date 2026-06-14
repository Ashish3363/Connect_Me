"""Unit tests for the in-memory sliding-window message rate limiter.

The limiter reads the clock via ``time.monotonic()``; tests drive a fake clock
so behaviour at window boundaries is deterministic (no real sleeping).
"""
from __future__ import annotations

import asyncio

import pytest

from app.core import ratelimit
from app.core.ratelimit import MessageRateLimiter, SlidingWindowLimiter


class FakeClock:
    def __init__(self, start: float = 1000.0) -> None:
        self.now = start

    def __call__(self) -> float:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += seconds


@pytest.fixture
def clock(monkeypatch):
    fake = FakeClock()
    monkeypatch.setattr(ratelimit.time, "monotonic", fake)
    return fake


def test_allows_up_to_limit_then_blocks(clock):
    limiter = SlidingWindowLimiter(window_seconds=60)
    for _ in range(20):
        allowed, retry_after = limiter.check("user-1", limit=20)
        assert allowed is True
        assert retry_after == 0

    allowed, retry_after = limiter.check("user-1", limit=20)
    assert allowed is False
    assert retry_after > 0


def test_retry_after_counts_down_to_window_edge(clock):
    limiter = SlidingWindowLimiter(window_seconds=60)
    limiter.check("u", limit=1)            # fills the single slot at t=1000
    clock.advance(45)                      # 15s left in the window

    allowed, retry_after = limiter.check("u", limit=1)
    assert allowed is False
    # 60 - 45 = 15s until the oldest hit ages out (ceil-ish, +1).
    assert retry_after == 16


def test_slot_frees_after_window_passes(clock):
    limiter = SlidingWindowLimiter(window_seconds=60)
    limiter.check("u", limit=1)
    assert limiter.check("u", limit=1)[0] is False

    clock.advance(61)                      # original hit is now outside the window
    allowed, retry_after = limiter.check("u", limit=1)
    assert allowed is True
    assert retry_after == 0


def test_blocked_attempts_do_not_extend_window(clock):
    """A rejected send must not be recorded, or the window never drains."""
    limiter = SlidingWindowLimiter(window_seconds=60)
    limiter.check("u", limit=1)            # t=1000, the one real hit

    clock.advance(30)
    assert limiter.check("u", limit=1)[0] is False   # blocked at t=1030
    clock.advance(31)                                # t=1061 — past the real hit
    # If the blocked attempt at t=1030 had been recorded, this would still block.
    assert limiter.check("u", limit=1)[0] is True


def test_keys_are_isolated(clock):
    limiter = SlidingWindowLimiter(window_seconds=60)
    assert limiter.check("alice", limit=1)[0] is True
    assert limiter.check("alice", limit=1)[0] is False
    # Bob has his own window.
    assert limiter.check("bob", limit=1)[0] is True


def test_reset_clears_state(clock):
    limiter = SlidingWindowLimiter(window_seconds=60)
    limiter.check("u", limit=1)
    assert limiter.check("u", limit=1)[0] is False

    limiter.reset("u")
    assert limiter.check("u", limit=1)[0] is True


def test_reset_all(clock):
    limiter = SlidingWindowLimiter(window_seconds=60)
    limiter.check("a", limit=1)
    limiter.check("b", limit=1)
    limiter.reset()
    assert limiter.check("a", limit=1)[0] is True
    assert limiter.check("b", limit=1)[0] is True


def test_message_limiter_falls_back_to_in_process_without_redis(clock):
    """With no Redis wired up, check() must behave like the local limiter."""
    limiter = MessageRateLimiter(window_seconds=60)  # use_redis() never called

    allowed, retry_after = asyncio.run(limiter.check("u", limit=1))
    assert allowed is True
    assert retry_after == 0

    allowed, retry_after = asyncio.run(limiter.check("u", limit=1))
    assert allowed is False
    assert retry_after > 0
