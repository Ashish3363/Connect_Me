# Location Freshness & Geofence Membership

**Status:** Implemented (backend + frontend)
**Last updated:** 2026-06-14

Keeps room membership honest without draining the device: a user's GPS fix is
trusted for **5 minutes**, location-sensitive actions are blocked once it goes
stale, and a connected user who physically leaves a room's radius is removed —
but only after staying outside **continuously for a grace window** (default
3 min), so a single bad fix never ejects someone who's really still there.

---

## 1. The hybrid model

Two independent ideas working together:

| Concern | Mechanism | Cost |
|---------|-----------|------|
| "Is this location recent enough to act on?" | **Freshness gate** — last fix must be ≤ `location_freshness_seconds` old | one in-process timestamp compare; **no DB read per action** |
| "Is this connected user still in the room?" | **Geofence hysteresis** — must be outside the radius continuously for `geofence_grace_seconds` before removal | one in-process haversine per location frame; **no PostGIS round-trip** |

Freshness is only meaningful for **active, WebSocket-connected** users (and the
REST send path). Idle accounts cost nothing — no timers, no background jobs, no
writes. The only DB write is one `UPDATE users` per **location frame**, i.e.
roughly once per slow-cadence interval (~5 min) **per connected user**.

### Stored fields (already on `users`)

| Column | Meaning |
|--------|---------|
| `current_location` (`geography(POINT,4326)`) | last known position |
| `current_geohash` | geohash cell of that position |
| `location_updated_at` (`timestamptz`) | when the fix was taken — drives freshness |

---

## 2. WebSocket protocol

Socket: `GET /ws/rooms/{room_id}?token=<jwt>`. Frames are discriminated on a
`type` field.

### Client → server

```json
{ "type": "location", "lat": 12.97, "lng": 77.59 }   // refresh GPS fix
{ "type": "message",  "content": "hi" }              // post a message
{ "content": "hi" }                                   // legacy form, still works
```

Active clients should send a `location` frame **on connect** and then about
**every 5 minutes** while connected (see §6 for battery notes).

### Server → client

| Frame | When | Client should… |
|-------|------|-----------------|
| `location_required` | at connect, if the stored fix is already stale | send a `location` frame before posting |
| `location_ack` | location frame received, user **inside** radius | continue normally |
| `geofence_warning` | location frame received, user **outside** radius, grace not yet elapsed | speed up to `recheck_interval_seconds`; move back in range |
| `geofence_exit` | user outside **continuously past** the grace window → **removed**, socket closes (`4403`) | rejoin a valid nearby room |
| `error` `code:"stale_location"` | tried to post with a fix older than the window | send a `location` frame, then resend the message |
| `error` `code:"rate_limited"` | message rate limit hit (unchanged) | back off `retry_after` seconds |
| `error` `code:"bad_location"` | `location` frame missing/invalid `lat`/`lng` | fix the payload |

Example warning frame:

```json
{ "type": "geofence_warning", "within_geofence": false,
  "distance_m": 1320.4, "radius_m": 1000,
  "grace_seconds_remaining": 120, "recheck_interval_seconds": 30 }
```

---

## 3. REST paths

The freshness gate covers **all** send paths so none bypasses it:

| Endpoint | Behavior |
|----------|----------|
| `POST /rooms/{id}/messages` | `428 Precondition Required` with `{code:"stale_location", …}` if the last fix is stale |
| `POST /rooms/{id}/location` | refresh the stored fix; returns `{fresh, within_geofence, distance_m, radius_m, location_updated_at}` |
| `POST /rooms/start` | carries `lat`/`lng`, so it **is** a refresh — no gate needed |

`POST /rooms/{id}/location` is the REST counterpart of the `location` WS frame
(use it to clear a `428`). Because REST has no persistent connection, a geofence
breach there is **informational only** — there's no socket to eject. Hard
removal is a WebSocket concept.

---

## 4. The flow

```
connect ─► stale fix? ──yes──► send location_required ─┐
              │ no                                      │
              ▼                                         ▼
        accept messages ◄──── client sends {type:"location"} ──► UPDATE users
                                                  │
                                                  ▼
                                     inside radius?  ──yes──► location_ack
                                                  │ no
                                                  ▼
                                   outside < grace ──► geofence_warning (clock running)
                                   outside ≥ grace ──► geofence_exit + close(4403)
```

Posting a message: **fresh?** → rate-limit check → persist → broadcast. **Stale?**
→ `stale_location` error; client refreshes and retries.

---

## 5. Configuration (admin-tunable via `app_settings`)

| Key | Default | Meaning |
|-----|---------|---------|
| `location_freshness_seconds` | `300` | Max age of a fix before actions require a fresh one |
| `geofence_grace_seconds` | `180` | Continuous-outside time before removal |
| `geofence_radius_meters` | `1000` | Room radius (shared with discovery) |
| `default_geohash_precision` | `6` | Cell precision for keying rooms |

Seeded by Alembic migration `0006_location_freshness`; the app falls back to the
same defaults if a row is missing. Reads go through `settings_repo.get_int` (30 s
TTL cache). `GEOFENCE_RECHECK_INTERVAL_SECONDS` (advisory, 30 s) is a constant in
`app/services/location.py`.

Apply the migration:

```bash
cd backend && uv run alembic upgrade head
```

---

## 6. Edge cases & expected behavior

| Situation | Behavior |
|-----------|----------|
| **Location permission denied / GPS unavailable** | The client can't send `location` frames. The stored fix goes stale after the window; every send is rejected with `stale_location` / `428`. The user can read but not post until a fix is provided. **Fail-closed.** |
| **Fix goes stale mid-session** | No proactive disconnect. The next send attempt is rejected with `stale_location`; the socket stays open so the room keeps receiving messages. |
| **Brief GPS wobble out of range** | First out-of-range frame → `geofence_warning` (clock starts). A subsequent in-range frame → `location_ack` and the clock **resets**. No removal. |
| **Genuinely walked away** | Stays outside; once `geofence_grace_seconds` elapses across location frames → `geofence_exit` + socket close (`4403`). |
| **Client goes silent after a warning** (to dodge removal) | It stops refreshing, so its fix goes stale and the freshness gate blocks all further sends — it can't post while outside even though the socket lingers. |
| **Grace vs. slow cadence** | At the normal ~5 min cadence, the 2nd consecutive out-of-range frame triggers removal. To honor the 2–3 min window precisely, clients **speed up to `recheck_interval_seconds` (30 s) after a `geofence_warning`** and slow back down once back inside — fast polling only during the brief grace window keeps battery cost low. |
| **Connecting to a far-away room** | Membership is enforced by location frames: the first `location` frame after connect runs the geofence check and warns/removes if outside. Messages require freshness, so a client can't post without a recent fix. |
| **Multiple devices / sockets** | Freshness and geofence state are **per socket** (in-process). Each connection tracks its own grace clock; the shared `location_updated_at` is whichever device last reported. |
| **Server restart** | In-process grace clocks reset (membership re-derived from the next location frame). `location_updated_at` persists in the DB, so freshness survives a restart. |

---

## 7. Where it lives

| Concern | File |
|---------|------|
| Pure rules: freshness, geofence, hysteresis tracker | `app/services/location.py` |
| Haversine distance (in-process geofence check) | `app/core/geo.py` |
| WS protocol, REST gate, refresh endpoint | `app/api/rooms.py` |
| Location write + tunable readers | `app/services/rooms.py` |
| Settings seed | `alembic/versions/0006_location_freshness.py` |
| Unit tests | `backend/tests/test_location.py` |
| WS client: frame routing, geolocation send | `Chat_app/src/services/chat.js` |
| Room UI: refresh loop, control-frame handling, notice banner | `Chat_app/src/pages/ChatRoom.jsx` |

### Frontend client contract

- Routes incoming frames by `type`: only typeless frames are chat messages;
  control frames (`location_*`, `geofence_*`, `error`) are handled, **not**
  rendered (rendering them caused "Invalid Date" bubbles).
- Pushes a `location` frame on connect, then every **4 min** (under the 5-min
  window), and immediately on `location_required` / `stale_location`. Speeds up
  to `recheck_interval_seconds` after a `geofence_warning`.
- If a send is rejected with `stale_location`, the text is held and **auto-resent**
  on the next `location_ack`, so a stale fix never silently drops a message.
- `geofence_exit` closes the socket and navigates back to the rooms list. A
  notice banner surfaces stale/denied/outside/rate-limited states to the user.

---

## Changelog

- **2026-06-14** — Frontend integration. WS client now routes frames by `type`
  (fixes "Invalid Date" bubbles from control frames), sends device GPS on connect
  + every 4 min, handles `location_required` / `geofence_warning` / `geofence_exit`
  / errors with a status banner, and auto-resends a message rejected for a stale
  fix once a fresh one is acked.
- **2026-06-14** — Initial implementation. Freshness gate (5 min, tunable) on all
  send paths; WebSocket `location` frames with `location_ack` / `geofence_warning`
  / `geofence_exit`; geofence removal with a continuous-outside grace window
  (3 min, tunable); REST `POST /rooms/{id}/location` refresh endpoint; migration
  `0006_location_freshness`; unit tests in `tests/test_location.py`.
