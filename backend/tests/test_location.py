"""Unit tests for location-freshness and geofence-membership logic.

These cover the pure helpers in ``app.services.location`` and the haversine
distance in ``app.core.geo`` — no DB or live socket required. The geofence
hysteresis is driven by an explicit ``now`` argument, so timing is exact.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.core.geo import haversine_meters
from app.services.location import (
    INSIDE,
    REMOVE,
    WARN,
    GeofenceTracker,
    is_location_fresh,
    within_geofence,
)


# -- freshness --------------------------------------------------------------
def _now() -> datetime:
    return datetime(2026, 6, 14, 12, 0, 0, tzinfo=timezone.utc)


def test_missing_timestamp_is_never_fresh():
    assert is_location_fresh(None, _now(), 300) is False


def test_recent_fix_is_fresh():
    updated = _now() - timedelta(seconds=120)
    assert is_location_fresh(updated, _now(), 300) is True


def test_fix_at_window_edge_is_fresh():
    updated = _now() - timedelta(seconds=300)
    assert is_location_fresh(updated, _now(), 300) is True


def test_fix_past_window_is_stale():
    updated = _now() - timedelta(seconds=301)
    assert is_location_fresh(updated, _now(), 300) is False


# -- haversine + geofence ---------------------------------------------------
def test_haversine_one_degree_longitude_at_equator():
    # ~111.2 km per degree of longitude at the equator.
    d = haversine_meters(0.0, 0.0, 0.0, 1.0)
    assert d == pytest.approx(111_195, rel=0.01)


def test_haversine_zero_distance():
    assert haversine_meters(12.34, 56.78, 12.34, 56.78) == pytest.approx(0.0, abs=1e-6)


def test_within_geofence_inside_and_outside():
    # Room centre at the equator/prime meridian, 1 km radius.
    inside, dist = within_geofence(0.0, 0.0, 0.0, 0.0, 1000.0)
    assert inside is True and dist == pytest.approx(0.0, abs=1e-6)

    # ~111 m north (0.001°) is well inside.
    inside, dist = within_geofence(0.001, 0.0, 0.0, 0.0, 1000.0)
    assert inside is True
    assert 100 < dist < 130

    # ~2.2 km east (0.02°) is outside a 1 km radius.
    inside, dist = within_geofence(0.0, 0.02, 0.0, 0.0, 1000.0)
    assert inside is False
    assert dist > 1000


# -- geofence hysteresis ----------------------------------------------------
def test_inside_returns_inside_and_keeps_clock_clear():
    t = GeofenceTracker(grace_seconds=180)
    assert t.observe(inside=True, now=1000.0) == INSIDE
    assert t.outside_since is None


def test_first_outside_warns_and_starts_clock():
    t = GeofenceTracker(grace_seconds=180)
    assert t.observe(inside=False, now=1000.0) == WARN
    assert t.outside_since == 1000.0


def test_outside_before_grace_keeps_warning():
    t = GeofenceTracker(grace_seconds=180)
    t.observe(inside=False, now=1000.0)
    assert t.observe(inside=False, now=1100.0) == WARN  # 100s < 180s


def test_outside_past_grace_removes():
    t = GeofenceTracker(grace_seconds=180)
    t.observe(inside=False, now=1000.0)
    assert t.observe(inside=False, now=1180.0) == REMOVE  # exactly at the window


def test_returning_inside_resets_the_clock():
    t = GeofenceTracker(grace_seconds=180)
    t.observe(inside=False, now=1000.0)
    assert t.observe(inside=True, now=1100.0) == INSIDE
    assert t.outside_since is None
    # A later breach starts a brand-new grace window, not a removal.
    assert t.observe(inside=False, now=1200.0) == WARN


def test_seconds_remaining_counts_down_then_floors_at_zero():
    t = GeofenceTracker(grace_seconds=180)
    assert t.seconds_remaining(now=1000.0) == 180  # nothing outstanding
    t.observe(inside=False, now=1000.0)
    assert t.seconds_remaining(now=1060.0) == 120
    assert t.seconds_remaining(now=1300.0) == 0  # past the window
