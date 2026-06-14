"""Geohash helpers for locality rooms.

Rooms are keyed by geohash cell (cheap "which room am I in" lookup); the
"can I see this room" check uses PostGIS ST_DWithin on the cell centres.
"""
from __future__ import annotations

import math

import pygeohash

_EARTH_RADIUS_M = 6_371_000.0


def encode_geohash(lat: float, lng: float, precision: int) -> str:
    """Geohash for a coordinate at the given precision (6 ≈ 1.2km × 0.6km)."""
    return pygeohash.encode(lat, lng, precision=precision)


def geohash_center(geohash: str) -> tuple[float, float]:
    """Approximate centre (lat, lng) of a geohash cell."""
    point = pygeohash.decode(geohash)
    return float(point.latitude), float(point.longitude)


def haversine_meters(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance in metres (spherical earth, ~0.3% error).

    Used for the per-update geofence check on an active WebSocket client, so
    membership can be verified in process without a PostGIS round-trip on every
    fix. Room *discovery* still uses PostGIS ST_DWithin for its authoritative
    spheroid distance — this is the cheap online check for already-joined users.
    """
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lng2 - lng1)
    a = (
        math.sin(dphi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    )
    return 2 * _EARTH_RADIUS_M * math.asin(math.sqrt(a))
