"""Geohash helpers for locality rooms.

Rooms are keyed by geohash cell (cheap "which room am I in" lookup); the
"can I see this room" check uses PostGIS ST_DWithin on the cell centres.
"""
from __future__ import annotations

import pygeohash


def encode_geohash(lat: float, lng: float, precision: int) -> str:
    """Geohash for a coordinate at the given precision (6 ≈ 1.2km × 0.6km)."""
    return pygeohash.encode(lat, lng, precision=precision)


def geohash_center(geohash: str) -> tuple[float, float]:
    """Approximate centre (lat, lng) of a geohash cell."""
    point = pygeohash.decode(geohash)
    return float(point.latitude), float(point.longitude)
