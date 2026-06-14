"""Location freshness and geofence-membership rules for active clients.

Pure, side-effect-free helpers so the rules are unit-testable without a DB or a
live socket (see ``tests/test_location.py``). The WebSocket handler in
``app/api/rooms.py`` wires these to real connections; the REST send path reuses
``is_location_fresh`` for its stale-location gate.

The hybrid design in two sentences:

* A user's last GPS fix is considered usable for *freshness ≤ 5 min*; older than
  that and any location-sensitive action is blocked until the client sends a
  fresh fix. This keeps battery/DB cost low — one write every few minutes per
  *connected* user, nothing for idle accounts.
* Membership uses *hysteresis*: a connected user must be OUTSIDE the room radius
  continuously for a grace window before removal, so a single bad fix or a brief
  GPS wobble does not eject someone who is really still there.

Defaults below are admin-tunable via ``app_settings`` (seeded by migration
``0006_location_freshness``); callers read the live values with
``settings_repo.get_int`` and pass them in, exactly like the message limiter.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from app.core.geo import haversine_meters

# Live values come from app_settings; these are the fallbacks when the row is
# absent (the seed migration is for admin visibility, not correctness).
DEFAULT_FRESHNESS_SECONDS = 300       # 5 minutes
DEFAULT_GEOFENCE_GRACE_SECONDS = 180  # 3 minutes continuously outside -> removed

# Advisory cadence sent in a geofence_warning frame: once warned, a client
# should re-send its location this often so the grace window is actually
# exercised instead of waiting out a whole slow-cadence (~5 min) interval.
GEOFENCE_RECHECK_INTERVAL_SECONDS = 30


def is_location_fresh(
    updated_at: datetime | None, now: datetime, freshness_seconds: int
) -> bool:
    """True if a fix taken at ``updated_at`` is still within the window at
    ``now``. A missing timestamp (user never located) is never fresh."""
    if updated_at is None:
        return False
    return (now - updated_at).total_seconds() <= freshness_seconds


def within_geofence(
    user_lat: float,
    user_lng: float,
    center_lat: float,
    center_lng: float,
    radius_m: float,
) -> tuple[bool, float]:
    """(inside, distance_m) for a user point against a room centre + radius."""
    distance = haversine_meters(user_lat, user_lng, center_lat, center_lng)
    return distance <= radius_m, distance


# Outcomes returned by GeofenceTracker.observe() — what the caller should do.
INSIDE = "inside"
WARN = "warn"
REMOVE = "remove"


@dataclass
class GeofenceTracker:
    """Hysteresis for room membership, driven purely by location updates.

    Each ``observe()`` feeds one fresh fix and returns the action to take. The
    user must stay OUTSIDE the radius continuously for ``grace_seconds`` before
    a REMOVE is returned; coming back inside at any point resets the clock. No
    timers — the state advances only when the client reports its position, so an
    idle connection costs nothing.
    """

    grace_seconds: float
    outside_since: float | None = None

    def observe(self, inside: bool, now: float) -> str:
        if inside:
            self.outside_since = None
            return INSIDE
        if self.outside_since is None:
            self.outside_since = now
            return WARN
        if now - self.outside_since >= self.grace_seconds:
            return REMOVE
        return WARN

    def seconds_remaining(self, now: float) -> int:
        """Whole seconds of grace left before removal (0 once elapsed)."""
        if self.outside_since is None:
            return int(self.grace_seconds)
        remaining = self.grace_seconds - (now - self.outside_since)
        return max(int(remaining), 0)
