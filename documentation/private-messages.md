# Nearby Private Messaging (in-room 1-on-1)

**Status:** Implemented (backend + frontend; live two-client run pending)
**Last updated:** 2026-06-24

A private, one-to-one chat between two people who meet in a locality room. It is
**not** a messenger: the *relationship* persists, but a *conversation* only works
while both people are physically together inside a room's geofence.

Two lifetimes, deliberately different:

- **The connection (relationship)** is permanent-ish: one row per pair, created
  the first time they DM, reused forever after. It is **independent of any room
  or location** — it just records "these two have interacted." It is only reaped
  after a long inactivity window (default **60 days**).
- **The conversation (messages)** is ephemeral: messages expire on the app's
  normal retention window (default **24 h**) and can only be exchanged while both
  participants are inside the **active room's** geofence with fresh location
  fixes.

So you can walk away, lose every message to expiry, cross paths weeks later in a
totally different part of the city, tap the same person, and resume the **same**
one-to-one chat — without ever rediscovering each other or spawning a duplicate
thread.

---

## 1. Concept & decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Connection scope** | **Room-agnostic & persistent.** One row per `(user_a, user_b)` pair, canonical `user_a_id < user_b_id`, unique. No `room_id` on the row. | The relationship outlives any single meeting; the same pair always reopens the same chat. |
| **Session boundary** | **Bound to the room it's opened from.** The active room's geofence is the communication boundary *for that session*. | The user's intent: messaging is only possible "when they are actively sharing the same local experience." |
| **Proximity gate** | **Two-sided, per message.** A message is exchanged only when **both** participants are inside the active room's geofence with a fresh fix. | "Send and receive only when inside the required area." |
| **Leaving the area** | Both users notified ("`<name>` is outside the area"), composer disabled, new send/receive paused, **history stays visible**. Re-entering the same room resumes the same connection automatically. | Mirrors the room rule "block new messages, keep history visible"; no new thread on return. |
| **Meeting again elsewhere** | Opening the DM from a *different* room detects the existing connection and reuses it, adopting the new room's geofence as the boundary. | Persistent relationship, fresh session context. |
| **How a DM starts** | **Tap a message author** (name/avatar on a room bubble). | Reuses `sender_id`/`sender_name` already on every room message. |
| **Message retention** | **Reuses `message_retention_hours`** (the app's existing 24 h sweep, which already deletes `private_messages`). | One knob; DM and room messages share ephemerality. |
| **Connection retention** | New `connection_retention_days` (default **60**). Inactivity = no message exchange and no in-range reconnect. | Prevent stale relationships accumulating; tunable. |
| **Out of scope (v1)** | No read *receipts* (sender-side read ticks), typing indicators, media, push, or group DMs. *(Unread badges and a flat Personal Chats list were added later — see changelog.)* | Keep it a simple, privacy-friendly proximity chat. |

### The two-sided gate, precisely

A live chat session always carries a `room_id` (the room it was opened from). At
the moment **A** sends a message in that session:

1. **Sender gate** — A's last fix is **fresh** (≤ `location_freshness_seconds`)
   **and within** the room's geofence (`within_geofence` vs the room cell centre).
2. **Recipient gate** — B's last stored fix is **also** fresh **and within** the
   *same* room's geofence (a single PostGIS `ST_DWithin` + freshness read on B's
   `users` row). If B fails, the send is **rejected and not persisted**; A gets a
   `recipient_unavailable` frame ("They've left the area").

Both checks use **A's session room centre** as the single reference, so the gate
is symmetric in practice (if they're together, the centres coincide) and
unambiguous (one room per message).

> **Why room-bound, not user-to-user distance.** The connection has no location,
> so "the area" needs a concrete centre + radius. We reuse the room's, exactly
> like room posting. Deriving the room from the sender's own cell per-message
> would make the sender always pass their own side of the gate — binding the
> session to the room *opened from* keeps "the sender wandered off" detectable.

> **History vs. exchange.** Leaving stops *new* exchange only; stored messages
> stay viewable (even out of range) until they expire on the retention sweep.

> **Presence, not socket.** "B is in the area" is judged from B's last stored fix
> in `users` (kept fresh by B's own room/DM socket). A backgrounded app → stale
> fix → counts as absent → send blocked. It fails **closed**, never leaks.

---

## 2. Architecture

```
Browser (React)                          FastAPI backend                  PostgreSQL
─────────────────                        ───────────────                  ──────────
tap author ─► POST /rooms/{rid}/dm/start ─► dm service ─► nearby_connections
                                            (get-or-create canonical pair, touch)
 WebSocket ◄─private msgs─► /ws/dm/{cid}?room_id=rid ─► RoomManager fan-out ─► private_messages
              two-sided geofence gate ◄──── ST_DWithin(user.current_location, room.centre)
              peer_presence broadcast  ◄──── geofence tracker per socket
```

- Reuses `RoomManager` (`app/realtime.py`) unchanged — private threads register
  under the channel key `dm:<connection_id>`.
- Reuses `app/services/location.py` (`within_geofence`, `is_location_fresh`,
  `GeofenceTracker`), `app/core/ratelimit.py` (per-user limiter), and
  `app/services/rooms.py` helpers (`sender_display`, geo point cast, settings).
- REST + WS are Vite-proxied in dev exactly like rooms (`/api/*`, `/ws/*`).

---

## 3. Data model — Alembic `0009` (renames the empty `0004` tables)

`private_conversations` / `private_messages` exist (from baseline `0001`, unused).
`0009` renames the connection table and broadens its activity column; the message
table keeps its name with one FK-column rename.

**`nearby_connections`** *(was `private_conversations`)*
- `id` UUID PK
- `user_a_id`, `user_b_id` → `users.id` `ON DELETE CASCADE`, **canonical
  `user_a_id < user_b_id`**, `UNIQUE(user_a_id, user_b_id)` — one per pair
- `created_at` TIMESTAMPTZ NOT NULL
- `last_interaction_at` TIMESTAMPTZ **NOT NULL** *(was nullable `last_message_at`)*
  — bumped on message send and on in-range (re)connect; **indexed** for the
  60-day sweep
- **no `room_id`** — the connection is location-agnostic by design

**`private_messages`** *(name unchanged)*
- `id` BIGINT PK
- `connection_id` → `nearby_connections.id` `ON DELETE CASCADE` *(renamed from
  `conversation_id`)*
- `sender_id` → `users.id` `ON DELETE CASCADE`
- `content` TEXT
- `sent_at` TIMESTAMPTZ — indexed `(connection_id, sent_at)` + `(sent_at)` (the
  latter already drives the existing expiry sweep)
- `read_at` TIMESTAMPTZ NULL — set when the recipient reads a message; powers the
  unread badge (a message is unread when `sender_id != viewer AND read_at IS NULL`)

**Two cleanup jobs, composing via cascade:** messages die at `message_retention_hours`
(existing sweep already covers `private_messages`); connections die at
`connection_retention_days` of inactivity (new sweep), and deleting a connection
cascades to any lingering messages. A connection can sit with **zero** messages
but still be alive — exactly "relationship persists, conversation expires."

---

## 4. HTTP API

All require `Authorization: Bearer <jwt>` and that the caller is a participant of
the connection (else `403`). Nested under the room for session context.

### `GET /dm/connections?room_id=<optional>`
Room-agnostic. The caller's persistent connections ("Personal Chats"), most-
recently-active first — every past contact, openable from any room. Backs the
hamburger dropdown. Returns `DmConnectionOut[]`. *(This is a deliberately scoped
revision of the original "no global inbox" exclusion — a flat contact list, not a
full inbox with previews/unread.)*

When `room_id` is supplied (the room the caller is currently in), each item's
`in_range` reports whether that contact is **reachable right now** — a fresh fix
inside that room's geofence — computed in one batched query (`presence_map`). The
UI shows a **green dot** on in-range contacts. Without `room_id`, `in_range` is
`false`.

### `POST /rooms/{room_id}/dm/start`
Get-or-create the connection between the caller and `other_user_id`; idempotent
(`INSERT … ON CONFLICT DO NOTHING` on the canonical pair, then re-select). Bumps
`last_interaction_at`.
```json
// request
{ "other_user_id": "uuid" }
// response 200 (DmConnectionOut)
{ "id": "uuid", "other_user_id": "uuid", "other_user_name": "Aarav",
  "other_has_avatar": true, "last_interaction_at": "2026-06-23T10:00:00Z" }
```
- `404` unknown room / user · `400` if `other_user_id` is the caller.
- Not gated on location — opening/reading is always allowed; only *sending* gates.

### `GET /rooms/{room_id}/dm/{connection_id}/messages?limit=<=200`
Most recent messages oldest-first, filtered by the same `expiry_cutoff` as rooms.
`DmMessageOut[]`: `{ id, connection_id, sender_id, sender_name, content, sent_at }`.

### `POST /rooms/{room_id}/dm/{connection_id}/messages`
REST fallback to send (WS is primary). Body `{ "content": "…" }`. Runs the full
two-sided gate (§1) + rate limiter, persists, bumps `last_interaction_at`,
broadcasts over `dm:<connection_id>`.
- `428 stale_location` (caller stale) · `403 out_of_range` (caller outside) ·
  `409 recipient_unavailable` (other person not in area) · `429` (rate) ·
  `404`/`403` (unknown/not a participant).

---

## 5. WebSocket protocol

```
ws(s)://<host>/ws/dm/{connection_id}?room_id=<room_id>&token=<jwt>
```
Mirrors `/ws/rooms/{id}` for the self side; adds peer-presence for the two-sided UX.

- **Auth/authz:** JWT in `token`. Invalid → `4401`; unknown connection/room →
  `4404`; caller not a participant → `4403`.
- **On connect:** register on `dm:<cid>`, bump `last_interaction_at`, and send a
  `peer_presence` snapshot to self (is the other person currently in this room's
  area?). If the caller's own fix is stale, send `location_required`.
- **`location` frame** `{type:"location", lat, lng}` → update the caller's fix,
  run the geofence check vs **this session's room centre**. Self replies:
  `location_ack` (inside) / `geofence_warning` / `geofence_exit` (outside past
  grace). On an inside↔outside transition, **broadcast** `peer_presence`
  `{type:"peer_presence", user_id, name, present}` so the other side flips its
  composer immediately. The socket is **not** closed on exit (unlike rooms) — the
  parent room socket handles eviction; the DM pauses and auto-resumes on return.
- **`message` frame** `{type:"message", content}` → two-sided gate, then persist
  + broadcast a `DmMessageOut`. Failures arrive as `error` frames with codes
  `stale_location` / `out_of_range` / `recipient_unavailable` / `rate_limited`.

The frontend frame router (`routeFrame` in `chat.js`) needs only the new
`peer_presence` case; all other frame types are shared with rooms.

---

## 6. Backend files

| File | Change |
|------|--------|
| `alembic/versions/0009_nearby_connections.py` | New: rename table/column/constraint/index per §3. |
| `app/models/private_conversation.py` → `NearbyConnection` | Rename model + table to `nearby_connections`; `last_interaction_at` NOT NULL + index. |
| `app/models/private_message.py` | `conversation_id` → `connection_id`; index rename. |
| `app/models/__init__.py` | Re-export `NearbyConnection`. |
| `app/schemas/dm.py` *(new)* | `StartDmIn`, `DmConnectionOut`, `DmMessageOut`, `SendDmIn`. |
| `app/services/dm.py` *(new)* | canonical pair, get-or-create, touch, create/list messages, **recipient-presence** check. |
| `app/api/dm.py` *(new)* | REST router (`/rooms/{rid}/dm/...`) + WS router (`/ws/dm/{cid}`). |
| `app/services/cleanup.py` | Add `purge_inactive_connections` + wire into `run_cleanup`/`CleanupResult`. |
| `app/core/config.py` | Add `connection_retention_days` (60). |
| `app/main.py` | Include the DM routers. |

---

## 7. Frontend files & flow

| File | Change |
|------|--------|
| `src/services/chat.js` | Add `startDm`, `getDmMessages`, `connectDm`; route the `peer_presence` frame. |
| `src/components/DmPanel.jsx` *(new)* | 1-on-1 thread (reuses `MessageList`/`MessageBubble`); out-of-range banner; composer enabled only when **self inside AND peer present**. |
| `src/pages/ChatRoom.jsx` | Tap a message author → open `DmPanel` for that pair, passing the current `roomId` as the session boundary. |
| `src/components/MessageBubble.jsx` | Make the author name/avatar a tap target (`onStartDm(senderId, sender)`), own messages excluded. |

Flow: in a room, tap another person → `POST …/dm/start` → open panel, load history
+ open `/ws/dm/{cid}?room_id=…` → stream live **only while both are in the area**;
if either leaves, the composer disables with "`<name>` is outside the area" and
re-enables automatically when they return.

---

## 8. Configuration

No new gate settings — reuses `geofence_radius_meters`, `location_freshness_seconds`,
`geofence_grace_seconds`, `message_rate_limit_per_minute`, and
`message_retention_hours`. Adds `connection_retention_days` (60) for the
relationship sweep.

---

## 9. Limitations / future hardening

- Recipient presence is best-effort (last stored fix); fails **closed**.
- Coordinates are client-supplied → spoofable (same trust model as rooms).
- Unread badges are a snapshot refreshed when the dropdown opens — no live push
  (would need a lightweight presence/unread socket). Read *receipts* (sender-side
  ticks) still deferred.
- No pagination on DM history (capped at `limit`, default 50).
- Multi-instance delivery rides the same Redis `PSUBSCRIBE` pattern as rooms
  (`dm:` channels included).

---

## Changelog

### 2026-06-24 — Logout clears presence
- **Fix:** after a user logged out, the other person still saw them "in range"
  with a green dot for the location-freshness window (~5 min) — logout only
  dropped the token client-side and never invalidated the location-based presence.
- New `POST /auth/logout`: clears the caller's stored location
  (`rooms_service.clear_user_location` → `current_location` / `current_geohash` /
  `location_updated_at` = NULL) so they immediately read as offline everywhere
  presence is computed (green dot, in-range, connect snapshot, send gate), and
  broadcasts `present: false` to each of their DM channels so anyone currently
  viewing a chat updates live. The frontend `logout()` (in `chat.js`, used by
  NearbyRooms + Profile) calls it with the still-valid token before clearing the
  local session. The JWT itself stays stateless (not revoked).

### 2026-06-24 — Fix "outside" on panel close + unread badges
- **Fix:** closing the DM (back button) while still in range made the other
  person see *"X is outside the area."* The DM socket's disconnect handler was
  hard-coding a `present=false` broadcast — conflating "closed the chat" with
  "left the area." It now broadcasts the disconnecting user's **actual**
  location-based presence, so closing the panel while in range keeps you shown as
  present (you stay reachable; messages land as unread). Genuine geofence exits
  are still broadcast in real time while the socket is open.
- **Feature — unread badges (opt-in revision of the v1 exclusion):** uses the
  reserved `read_at` column. `GET /dm/connections` now returns `unread_count`
  (messages from the other person with `read_at IS NULL`); the Personal Chats list
  shows a numeric badge. Opening a DM calls `POST /dm/{id}/read` (on open and on
  close) to mark received messages read and clear the badge. Counts are a snapshot
  refreshed when the dropdown opens (no live badge push yet). Messaging a contact
  who is in range but not viewing the chat works — the message is stored and shows
  as unread for them, exactly as requested.

### 2026-06-24 — Fix false "out of range" on open + in-range dots
- **Fix:** opening a DM briefly showed *"You're outside this room's area"* even
  when in range, because the client started `selfInside=false` and waited for the
  first GPS round-trip. The DM socket now sends a `location_ack` to the client at
  connect when it's already in range, and the client uses tri-state presence
  (`null` = unknown) so it never shows an out-of-range banner before presence is
  known.
- **Feature:** the Personal Chats list now shows a **green dot** on each contact
  who is currently reachable (`GET /dm/connections?room_id=…` → `in_range` via the
  batched `presence_map`). Presence is a snapshot taken when the dropdown opens.

### 2026-06-24 — "Personal Chats" connection list
- Added `GET /dm/connections` (room-agnostic) + `dm_service.list_connections`,
  `getDmConnections()` in `chat.js`, and a **"Personal Chats" dropdown** in the
  ChatRoom hamburger (below Profile) listing all past contacts; clicking one
  opens that DM bound to the **current room's** geofence.
- This intentionally revises the original "no global inbox" exclusion to a
  lightweight, flat contact list (no previews/unread/badges).

### 2026-06-23 — Implemented
- Built end-to-end. Backend: model rename, `app/services/dm.py`, `app/api/dm.py`
  (REST `start` / history / send + `/ws/dm/{id}`), connection-inactivity sweep,
  routers wired in `main.py`. Frontend: `startDm`/`getDmMessages`/`connectDm` in
  `chat.js`, full-screen `DmPanel` (reuses `MessageList`/`MessageBubble`/
  `chat-composer`, so design + font match the room), tap-author entry in
  `MessageBubble`/`ChatRoom`.
- **Leaver behavior:** reuses the room's geofence-exit → bounce to `/rooms`; the
  staying partner sees the out-of-area banner and resumes on return.
- **Layout:** full-screen replace of the room view with a back button.
- **Verified:** migration up/down roundtrip on the local DB; `42 passed` backend
  tests; frontend `eslint` clean + production build; a service smoke test
  (idempotent canonical pairing, message + `last_interaction_at` bump, two-sided
  presence gate in/out of range). Live two-client geolocation run still pending.

### 2026-06-23 — Final design + implementation
- Locked the model: **room-agnostic persistent connection** (`nearby_connections`)
  + **room-bound live session** with a **two-sided per-message proximity gate**,
  peer-presence pausing, persistent relationships (60-day sweep) over ephemeral
  messages (24 h sweep).
- Schema: Alembic `0009` renames `private_conversations`→`nearby_connections`,
  `last_message_at`→`last_interaction_at` (NOT NULL + index), and
  `private_messages.conversation_id`→`connection_id`.

### 2026-06-23 — Initial (superseded) design
- First cut explored a **room-scoped** connection (`room_id` on the conversation,
  one thread per `(room, pair)`). Replaced by the room-agnostic persistent
  connection above after deciding relationships should survive across rooms.
