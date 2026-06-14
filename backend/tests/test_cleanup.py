"""Unit tests for message-expiration retention logic.

These cover the pure helpers in ``app.services.cleanup`` — the retention math
that decides what is expired, what the retrieval API filters on, and when an
inactive room becomes eligible for cleanup. Timing is driven by an explicit
``now`` so the boundaries are exact, with no real clock or database involved.

The actual ``DELETE``s (``purge_*``) and the scheduler loop are thin wrappers
over these rules plus SQLAlchemy/Postgres, exercised against a real database in
integration; here we pin the rules that make expiration correct.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.services.cleanup import (
    CleanupResult,
    expiry_cutoff,
    is_expired,
    is_room_inactive,
    room_inactivity_cutoff,
)


def _now() -> datetime:
    return datetime(2026, 6, 14, 12, 0, 0, tzinfo=timezone.utc)


# -- expiry_cutoff ----------------------------------------------------------
def test_expiry_cutoff_is_now_minus_retention():
    assert expiry_cutoff(_now(), 24) == _now() - timedelta(hours=24)


def test_expiry_cutoff_honours_custom_retention():
    assert expiry_cutoff(_now(), 1) == _now() - timedelta(hours=1)
    assert expiry_cutoff(_now(), 48) == _now() - timedelta(hours=48)


# -- is_expired (message expiration logic) ----------------------------------
def test_message_just_created_is_not_expired():
    # The created_at/sent_at of a fresh message is "now" — never expired.
    assert is_expired(_now(), _now(), 24) is False


def test_message_within_window_is_not_expired():
    sent = _now() - timedelta(hours=23, minutes=59)
    assert is_expired(sent, _now(), 24) is False


def test_message_exactly_at_window_edge_is_not_expired():
    # Edge is inclusive: a message exactly 24h old is still visible.
    sent = _now() - timedelta(hours=24)
    assert is_expired(sent, _now(), 24) is False


def test_message_past_window_is_expired():
    sent = _now() - timedelta(hours=24, seconds=1)
    assert is_expired(sent, _now(), 24) is True


def test_message_far_past_window_is_expired():
    sent = _now() - timedelta(days=3)
    assert is_expired(sent, _now(), 24) is True


# -- retrieval filter / expiry consistency ----------------------------------
def test_retrieval_cutoff_matches_expiry_predicate():
    """The API filters ``sent_at >= cutoff``; that must keep exactly the
    messages ``is_expired`` reports as still alive, and drop the rest."""
    cutoff = expiry_cutoff(_now(), 24)
    samples = [
        _now(),                                  # brand new
        _now() - timedelta(hours=12),            # mid-window
        cutoff,                                   # exactly on the edge
        cutoff - timedelta(seconds=1),           # just expired
        _now() - timedelta(days=2),              # long expired
    ]
    for sent in samples:
        kept_by_filter = sent >= cutoff
        alive = not is_expired(sent, _now(), 24)
        assert kept_by_filter == alive


# -- room inactivity (optional room cleanup) --------------------------------
def test_room_inactivity_cutoff_is_now_minus_days():
    assert room_inactivity_cutoff(_now(), 30) == _now() - timedelta(days=30)


def test_recently_active_room_is_not_inactive():
    last = _now() - timedelta(days=10)
    assert is_room_inactive(last, _now(), 30) is False


def test_room_at_retention_edge_is_not_inactive():
    last = _now() - timedelta(days=30)
    assert is_room_inactive(last, _now(), 30) is False


def test_long_silent_room_is_inactive():
    last = _now() - timedelta(days=31)
    assert is_room_inactive(last, _now(), 30) is True


def test_empty_room_measured_from_creation_persists_when_recent():
    # A room with no messages uses created_at as last activity; a young empty
    # room must NOT be reaped — empty rooms keep existing.
    created = _now() - timedelta(days=2)
    assert is_room_inactive(created, _now(), 30) is False


# -- CleanupResult accounting ----------------------------------------------
def test_cleanup_result_totals_messages():
    result = CleanupResult(room_messages=5, private_messages=3, rooms=1)
    assert result.messages == 8


def test_cleanup_result_defaults_to_zero():
    result = CleanupResult()
    assert result.messages == 0
    assert result.rooms == 0
