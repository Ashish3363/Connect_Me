# Hyperlocal Rooms

**Status:** Implemented (frontend + backend, verified end-to-end)
**Last updated:** 2026-06-10

Public chat rooms scoped to a physical locality. A room is created the moment
someone "starts chatting" in their area; anyone whose location falls within the
configured radius (default **1 km**) sees and can join the **same** room. Inside
a room everyone shares one group message stream in real time.

---

## 1. Concept & the two-system location model

The app deliberately uses **two** location mechanisms that are kept in sync — a
load-bearing design decision:

1. **Geohash cell = room identity.** A user's `(lat, lng)` is encoded to a
   geohash at a configured precision (**6** by default ≈ 1.2 km × 0.6 km cell).
   All users in the same cell resolve to the same room. This gives a cheap
   "which room am I in?" lookup and a natural create-or-join key.
2. **PostGIS `ST_DWithin` = discovery gate.** "Which rooms are near me?" is a
   true great-circle distance test on the rooms' centre points, using the
   radius from settings. This is the actual **1 km gate**.

Both the radius and the geohash precision are **runtime-tunable** and read from
the `app_settings` table (never hardcoded):

| Setting key | Default | Meaning |
|-------------|---------|---------|
| `geofence_radius_meters` | `1000` | Discovery radius for `/rooms/nearby`. |
| `default_geohash_precision` | `6` | Geohash precision for room cells. |

Read via `app/core/settings_repo.py` (30 s TTL cache).

---

## 2. Architecture

```
Browser (React)                         FastAPI backend                 PostgreSQL + PostGIS
─────────────────                       ───────────────                 ────────────────────
geolocation ──lat/lng──► /api/rooms/start  ──► rooms service ──► chat_rooms (geohash, center geog)
            ──lat/lng──► /api/rooms/nearby ──► ST_DWithin query ─► room_messages
 WebSocket  ◄──messages──► /ws/rooms/{id}  ──► RoomManager fan-out ─► (persist + broadcast)
```

- **REST** is proxied by Vite in dev: `/api/*` → `http://localhost:8000/*`.
- **WebSocket** is proxied: `/ws/*` → `ws://localhost:8000/ws/*`.
- Realtime fan-out is **in-memory, single process** (`app/realtime.py`).

---

## 3. Data model (existing tables, no migration needed)

**`chat_rooms`**
- `id` UUID PK
- `geohash` VARCHAR(12) UNIQUE — the cell key
- `precision` SMALLINT — geohash precision used
- `center_location` `geography(POINT,4326)` — cell centre (GIST indexed)
- `name` VARCHAR(100) NULLABLE — currently unused; API returns `"Local area"` when null
- `last_message_at` TIMESTAMPTZ

**`room_messages`**
- `id` BIGINT PK
- `room_id` → `chat_rooms.id` (CASCADE)
- `sender_id` → `users.id`
- `content` TEXT
- `sent_at` TIMESTAMPTZ (indexed `(room_id, sent_at)`)

**`users`** location columns updated on `/rooms/start`:
- `current_location` `geography(POINT,4326)`, `current_geohash`, `location_updated_at`.

---

## 4. HTTP API

All endpoints require `Authorization: Bearer <jwt>` (the access token from
`/auth/login` or `/auth/signup`).

### `POST /rooms/start`
Create-or-join the caller's geohash-cell room, optionally posting a first message.

Request:
```json
{ "lat": 19.0760, "lng": 72.8777, "message": "Hello from here" }
```
- `lat` ∈ [-90, 90], `lng` ∈ [-180, 180], `message` optional (≤ 2000 chars).
- Side effect: updates the caller's stored location.

Response `200` (`RoomOut`):
```json
{ "id": "uuid", "name": "Local area", "geohash": "te7ud2",
  "distance_m": 0.0, "members": 1, "last_message_at": "2026-06-10T05:31:01Z" }
```

### `GET /rooms/nearby?lat=<>&lng=<>`
Rooms whose centre is within `geofence_radius_meters` of the point — **the 1 km gate**.
Returns a `RoomOut[]` ordered by ascending distance. `distance_m` is the real
metres to each room's centre. Rooms outside the radius are omitted.

### `GET /rooms/{room_id}`
Single room (`RoomOut`, `distance_m` = 0 since no point is supplied). `404` if unknown.

### `GET /rooms/{room_id}/messages?limit=<=200`
Most recent messages, returned oldest-first (`RoomMessageOut[]`):
```json
{ "id": 12, "room_id": "uuid", "sender_id": "uuid",
  "sender_name": "Aarav", "content": "hi", "sent_at": "2026-06-10T05:31:01Z" }
```
`sender_name` = `display_name` → `username` → email local-part → `"Someone"`.

### `POST /rooms/{room_id}/messages`
REST fallback to send a message; persists and broadcasts over the room's
WebSocket. Body `{ "content": "..." }`. Returns the created `RoomMessageOut`.

---

## 5. WebSocket protocol

```
ws(s)://<host>/ws/rooms/{room_id}?token=<jwt>
```
- **Auth:** the JWT is passed as the `token` query param (browsers can't set
  WS headers). Invalid/missing → close code `4401`. Unknown room → `4404`.
- **Send** (client → server): `{ "content": "your message" }`.
- **Receive** (server → all clients in room, incl. the sender): a
  `RoomMessageOut` JSON object. Because the server echoes to the sender too, the
  client does **not** optimistically append — it just renders what arrives
  (deduped by `id`).

Fan-out is handled by `RoomManager` in `app/realtime.py` (a
`dict[room_id -> set[WebSocket]]`).

---

## 6. Backend files

| File | Responsibility |
|------|----------------|
| `app/core/geo.py` | `encode_geohash()`, `geohash_center()` via `pygeohash`. |
| `app/services/rooms.py` | create-or-join, `nearby_rooms` (`ST_DWithin`), messages, location update. Reads radius/precision from `settings_repo`. |
| `app/schemas/room.py` | `StartRoomIn`, `RoomOut`, `RoomMessageOut`, `SendMessageIn`. |
| `app/api/rooms.py` | REST router (`/rooms`) + WebSocket router (`/ws/rooms/{id}`). |
| `app/realtime.py` | In-memory `RoomManager` broadcast. |
| `app/main.py` | Includes both routers; adds CORS middleware. |
| `app/core/config.py` | `cors_origins` setting. |

Geo helpers use SQLAlchemy expressions, fully parameterised:
```python
cast(func.ST_SetSRID(func.ST_MakePoint(lng, lat), 4326),
     Geography(geometry_type="POINT", srid=4326))
```

---

## 7. Frontend files & flow

| File | Responsibility |
|------|----------------|
| `src/services/geo.js` | `getPosition()` → `{lat,lng}`; rejects with `denied`/`unavailable`/`timeout`/`unsupported`. |
| `src/services/chat.js` | The single data seam: REST (`/api`) + real WebSocket (`/ws`). Maps backend shapes to UI shapes. |
| `src/pages/NearbyRooms.jsx` | Requests location, fetches nearby rooms, hosts the "start chatting" box, handles location-denied with a retry card. |
| `src/pages/ChatRoom.jsx` | Group stream + member roster; sends over the WS. |
| `src/components/StartChatBox.jsx` | Compose box that opens/joins the locality room. |
| `vite.config.js` | Dev proxy for `/api` (REST) and `/ws` (WebSocket). |
| `src/pages/Login.jsx` | Stores `token` + `user_id` (used to mark own messages). |

Flow:
1. Land on `/rooms` → browser asks for location.
2. With coords → `GET /rooms/nearby` populates the glass card grid (distance shown per room).
3. Type in the start box → `POST /rooms/start` → navigate to `/rooms/:id`.
4. In the room → load history (`GET …/messages`) + open WS; messages stream live to everyone in the cell.

---

## 8. Configuration

- **CORS:** `settings.cors_origins` (env `CORS_ORIGINS` as JSON list). Defaults
  to localhost dev ports. Not needed in dev (the Vite proxy makes it same-origin).
- **DB:** `postgresql+asyncpg://postgres:root@localhost:5432/hyperlocal_chat`
  (in `backend/.env`). Schema at Alembic `0004`; rooms tables already existed.

---

## 9. Verification (2026-06-10)

Run against the live local DB:
- Two rooms started 5.5 km apart → `nearby` from point A returns **only A** (217 m);
  from point B **only B** (268 m); from 111 km away returns **0**.
- Full path through the Vite proxy: `nearby` = 1 at the spot vs **0 at 100 km**.
- WebSocket: two clients in one room, one sends → both receive; bogus token rejected (`4401`).

---

## 10. Known limitations / future hardening

- **Geolocation needs HTTPS in production** (localhost is exempt). Laptop fixes
  (Wi-Fi/IP) can be off by tens–hundreds of metres.
- **Client-supplied coordinates are trusted** → spoofable. Future: server-side
  location validation + `location_staleness_seconds` enforcement.
- **In-memory WebSocket fan-out** = single process only. Multi-instance deploy
  needs Redis/NATS pub/sub behind `RoomManager` (call sites unchanged).
- **No pagination** on message history (capped at `limit`, default 50).
- **Room names** are placeholder (`"Local area"`); no reverse-geocoding yet.
- **No rate limiting** on message sends.

---

## Changelog

### 2026-06-10 — Fix: sent messages not appearing
- **Symptom:** sending a message showed nothing in the chat box.
- **Cause:** the room WebSocket was created in `useMemo` and closed in an effect
  cleanup. React StrictMode (dev) runs setup→cleanup→setup, and `useMemo`
  returned the *same* connection on the second setup — already closed by the
  first cleanup. `send()` then early-returned (`closed === true`) and no echo
  arrived, so nothing rendered. (Dev-only; a production build masked it.)
- **Fix:** create the socket inside a `roomId`-keyed effect (fresh socket per
  StrictMode mount) and hold it in a ref for `send()` — `ChatRoom.jsx`.

### 2026-06-10 — Initial implementation
- Backend: `POST /rooms/start`, `GET /rooms/nearby` (PostGIS `ST_DWithin`),
  `GET /rooms/{id}`, `GET/POST /rooms/{id}/messages`, WebSocket `/ws/rooms/{id}`.
- Added `geo.py`, `realtime.py`, `schemas/room.py`, `services/rooms.py`,
  `api/rooms.py`; CORS middleware + `cors_origins`.
- Frontend: browser geolocation, real REST + WebSocket wiring (replaced the
  localStorage mock), location-permission handling, Vite WS proxy.
- Verified the 1 km gate and realtime broadcast end-to-end.
