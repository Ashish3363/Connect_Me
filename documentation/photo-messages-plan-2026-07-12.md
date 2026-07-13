# Photo Messages — Implementation Plan

**Status:** Implemented & verified end-to-end — backend HTTP E2E + in-browser Playwright for **rooms** (single client) and **DMs** (two clients)
**Last updated:** 2026-07-12
**Scope:** Send a single photo (no caption) inside **public rooms** and **nearby DMs**.

> **Implemented in this repo (2026-07-12).** Migration `0010_message_photos`, backend
> service/endpoints, and the TanStack-Query + TypeScript frontend are all in place.
> See the final changelog entry for the file-by-file summary and what was verified.

A photo message is a first-class message whose payload is one image instead of
text. Photos are stored **in Postgres** and **auto-deleted 24 h after they are
sent** (they ride the existing message-expiration sweep). Sending a photo is
**gated by location exactly like text**: if the sender is out of the room's
area, the photo send is blocked.

---

## 0. Decisions (locked with the user, 2026-07-12)

| # | Decision | Choice |
|---|----------|--------|
| 1 | **Storage** | Image **bytes in the database**; deleted automatically **24 h** after `sent_at`. |
| 2 | **Surfaces** | **Both** public rooms *and* nearby DMs, in one pass. |
| 3 | **Message shape** | **One photo, no caption.** A message is *either* text *or* a photo — never both. No albums. |
| 4 | **Retention** | **Exactly the same as text messages** — the existing `message_retention_hours` sweep (24 h). One knob for both; no separate photo constant. |
| 5 | **Location gate** | **Photos ARE blocked when out of range** — gated exactly like text (fresh fix + inside the room's geofence). *(Updated 2026-07-12 per follow-up.)* |
| 6 | **Photo serving auth** | **Authenticated.** `GET /photos/{token}` requires a valid JWT (+ participant check for DM photos). Not a bare public route. *(Confirmed 2026-07-12.)* |
| 7 | **Limits & formats** | **3 MB** cap; **JPG / PNG / WEBP** only (no GIF). *(Confirmed 2026-07-12.)* |

All confirm-points are now resolved — see §7 for the resolutions and their
knock-on effects (notably: an auth-gated image route can't be a plain
`<img src>`, so the frontend loads photos through an authenticated fetch — §4.3).

---

## 1. Design overview

### The core idea: upload over REST, deliver over WebSocket
The realtime sockets carry **JSON text frames** (`{type:"message", content}`) —
they are not a good pipe for binary. We reuse the existing, proven **avatar
pattern** (`POST /users/me/avatar`, raw bytes, magic-byte sniff, size cap, served
from a dedicated route) and split photo messaging into two moves:

```
1. Client → POST raw image bytes to a REST photo endpoint
2. Server  → validate (magic bytes + size), persist message + photo rows,
             then broadcast a normal "message" frame over the existing socket
             — the frame carries kind:"photo" + a photo URL instead of text.
3. All clients (incl. the sender) receive the frame via the socket they're
   already on and render an <img>. No binary ever crosses the WebSocket.
```

This means **zero new realtime plumbing** — the `RoomManager` fan-out, the frame
router, and the client socket all stay as-is. Only the *message shape* grows a
`kind` discriminator and a `photo_url`.

### Why a dedicated `message_photos` table (not inline columns)
Bytes live in their own table, referenced by the message, mirroring how the
avatar keeps image bytes off the hot path (`deferred=True`):

- Message-list queries (the hot path) never touch photo bytes.
- One clean, **unguessable** serving route keyed by a random UUID token
  (message ids are sequential `BIGINT` → guessable; we must **not** expose those
  in a public image URL).
- `ON DELETE CASCADE` from the message row gives us the **24 h auto-delete for
  free**: when the expiration sweep deletes a 24 h-old message, its photo row and
  bytes vanish with it. No separate photo cleanup job.

---

## 2. Database changes (Alembic `0010_message_photos`)

Head is currently `0009_nearby_connections`; this adds `0010`.

**2.1 New table `message_photos`**

| Column | Type | Notes |
|--------|------|-------|
| `id` | `UUID` PK (`gen_random_uuid()`) | **Also the URL token** — unguessable. |
| `room_message_id` | `BIGINT` FK → `room_messages.id` `ON DELETE CASCADE`, nullable | Set for a room photo. |
| `private_message_id` | `BIGINT` FK → `private_messages.id` `ON DELETE CASCADE`, nullable | Set for a DM photo. |
| `data` | `BYTEA` | The image bytes (JPEG/PNG/WEBP). |
| `content_type` | `VARCHAR(100)` | Canonical type from magic-byte sniff. |
| `byte_size` | `INTEGER` | For observability / limits. |
| `created_at` | `TIMESTAMPTZ` default `now()` | |

Constraints/indexes:
- `CHECK` — **exactly one** of `room_message_id` / `private_message_id` is set.
- Unique index on `room_message_id` and on `private_message_id` (one photo per
  message — enforces decision #3).
- (PK already indexes `id`, which is the lookup key for serving.)

**2.2 Alter `room_messages` and `private_messages`** (both tables, symmetric)
- Add `kind VARCHAR(16) NOT NULL DEFAULT 'text'` — values `'text' | 'photo'`.
  (Plain string + app-level check; avoids a new PG enum and its migration
  ceremony. If you'd rather have a native enum, say so.)
- Make `content` **nullable** (was `NOT NULL`). A photo message has no text.
- Add `CHECK (kind = 'text' AND content IS NOT NULL) OR (kind = 'photo' AND content IS NULL)`.

Expiration needs **no change**: `purge_expired_messages` already deletes
`room_messages`/`private_messages` older than the cutoff; CASCADE removes the
photos. The retrieval cutoff already hides them pre-sweep.

---

## 3. Backend changes

### 3.1 Models
- **`app/models/message_photo.py`** (new) — `MessagePhoto` mapping the table
  above, with `data` marked `deferred=True` (never loaded on a normal fetch,
  exactly like `User.avatar_data`).
- **`app/models/room_message.py`** / **`private_message.py`** — add `kind`
  (default `"text"`), make `content` `Optional[str]`.

### 3.2 A shared image helper (reuse, don't duplicate)
`sniff_image_type()` and the `ALLOWED_IMAGE_TYPES` set already live in
`app/services/users.py`. Promote them to a small **`app/core/images.py`** so both
avatars and chat photos share one validator. Add:
```python
MAX_PHOTO_BYTES = 3 * 1024 * 1024   # 3 MB cap for chat photos (avatars are 2 MB)
```
(`users.py` keeps importing `sniff_image_type` from the new home — no behaviour
change to avatars. Allowed types stay JPG / PNG / WEBP; GIF excluded.)

**Upload sanitization (new dependency: `Pillow`).** Add a
`sanitize_image(data) -> tuple[bytes, str]` helper that **decodes and re-encodes**
every uploaded photo instead of trusting the raw bytes. This:
- **strips EXIF/metadata** — critically the **GPS tags**, which would otherwise
  leak a user's real coordinates in a *location* app;
- **defuses decompression-bombs** — set `Image.MAX_IMAGE_PIXELS` and reject
  oversized dimensions before decode;
- **guarantees a real image** — a file that doesn't decode (polyglot / disguised
  payload) is rejected (415), not stored.

The endpoint stores the **re-encoded** bytes + canonical content-type, never the
original upload. `Pillow>=10.3` is added to `backend/pyproject.toml`. *(Avatars
can adopt the same helper later; out of scope for this change.)*

### 3.3 Services
- **`app/services/photos.py`** (new):
  - `create_room_photo_message(session, *, room_id, sender_id, data, content_type)`
    → inserts a `RoomMessage(kind="photo", content=None)`, flushes to get its id,
    inserts the `MessagePhoto`, returns `(message, photo)`.
  - `create_dm_photo_message(session, *, connection_id, sender_id, data, content_type)`
    → same for `PrivateMessage`.
  - `get_photo_by_token(session, token)` → loads `MessagePhoto` **with** `data`
    (the only place that undefers the bytes). Also returns whether the parent
    message is still within the retention cutoff, so an expired-but-not-yet-swept
    photo 404s.
- **`app/services/rooms.py` / `dm.py`** — no change to text paths.

### 3.4 REST endpoints

**Rooms** (`app/api/rooms.py`)
```
POST /rooms/{room_id}/messages/photo      # raw image bytes as body, like avatar
GET  /photos/{token}                       # AUTH-GATED bytes; 404 when gone
```
- `POST` flow: read body → 400 if empty → 413 if > `MAX_PHOTO_BYTES` →
  `sniff_image_type` → 415 if unknown → **`sanitize_image` (Pillow re-encode,
  strips EXIF/GPS, blocks bombs; 415 if it won't decode)** → **location gate** →
  **rate-limit** (shared per-user limiter) → `create_room_photo_message` (stores
  the **sanitized** bytes) → commit → build a `photo` message-out → broadcast over
  `manager` → return it.
- **Location gate (decision #5):** reuse `_require_fresh_location` (428 on a
  stale fix) **and** add an explicit in-range check — compute the caller's
  distance to the room's geohash centre with `within_geofence(...)` and return
  **403 `out_of_range`** if outside the radius. *(The existing text REST
  `post_message` only checks freshness; photos add the explicit range check so
  "out of region → cannot send" is enforced on the REST path too.)*

**DMs** (`app/api/dm.py`)
```
POST /rooms/{room_id}/dm/{connection_id}/messages/photo
```
- Verifies the caller **is a participant**, then runs the **full two-sided
  proximity gate** exactly as `post_dm_message` does: sender fresh + in range
  (428 / 403), **and** recipient present in the area (409 `recipient_unavailable`).
  Photos are held to the same "both people are here" rule as DM text.
- Broadcast on the existing `dm:<connection_id>` channel.

**Serving route** `GET /photos/{token}` — **authenticated (decision #6)**
- Depends on `get_current_user` — a valid JWT is required; no token, no image.
- **Authorization:** for a **DM** photo, the caller must be one of the two
  connection participants (else 403). For a **room** photo, any authenticated
  user may fetch it (rooms are shared spaces). Unknown/expired token → 404.
- Returns `Response(content=bytes, media_type=content_type, headers={"Cache-Control": "private, max-age=300"})`.
- **Knock-on effect (important):** an auth-gated route **cannot** be the `src` of
  a plain `<img>` — the browser won't attach the `Authorization` header. The
  frontend therefore fetches the bytes with the bearer header and renders them
  from an object URL — see §4.3 (`AuthImage` / `usePhotoBlob`).

### 3.5 Schemas (`app/schemas/room.py`, `dm.py`)
Grow the message-out shape (both surfaces) to describe either kind:
```python
class RoomMessageOut(BaseModel):
    id: int
    room_id: uuid.UUID
    sender_id: uuid.UUID
    sender_name: str
    kind: Literal["text", "photo"] = "text"
    content: str | None = None          # text messages only
    photo_url: str | None = None        # "/api"-relative, e.g. /photos/<token>
    sent_at: datetime
```
(`DmMessageOut` mirrors this.) The broadcast frame is just this model dumped to
JSON — the client's existing frame router already renders any type-less/`message`
frame via `mapMessage`, so photos flow through untouched plumbing.

### 3.6 Rate limiting
Photos share the existing per-user `message_limiter` budget (one send budget
across text + photo, both surfaces). No new setting.

---

## 4. Frontend changes (`Chat_app/`)

Per the new project convention, **new** data-fetching uses **TanStack Query**
and **TypeScript**. The existing app is plain JS with hand-rolled `fetch`; this
plan adds TS/Query *incrementally* for the photo code and does **not** migrate
the whole app (that's a separate effort).

### 4.1 Dependencies & setup
- Add `@tanstack/react-query`.
- Wrap the app in a `QueryClientProvider` in `src/main.jsx`.
- Vite already supports TS; add a light `tsconfig.json`. New files land as `.ts`.

### 4.2 New/changed files
- **`src/services/photos.ts`** (new) — `uploadRoomPhoto(roomId, file)` and
  `uploadDmPhoto(roomId, connectionId, file)`: `POST` the raw `File` (body =
  bytes, `Content-Type: file.type`, bearer header), returning the created
  message. Plus a `photoUrl(token)` helper (mirrors `avatarUrl`).
- **`src/types/messages.ts`** (new) — TS types for the message shape
  (`kind`, `content`, `photoUrl`, …), shared by mappers and components.
- **`src/hooks/useSendPhoto.ts`** (new) — a `useMutation` wrapping the upload;
  exposes `isPending`/`error` for composer UI. On success the **socket
  broadcast** delivers the message to every client (including the sender), so no
  manual cache write is needed — same as how a text send already round-trips.
- **`src/services/chat.js`** — extend `mapMessage()` to carry
  `kind` and `photoUrl` (from `photo_url`) so photo frames render.
- **`src/hooks/usePhotoBlob.ts`** (new) — because the serving route is
  **auth-gated** (decision #6), a photo **cannot** be a plain `<img src>`. This
  hook uses `useQuery` keyed by the photo token to `fetch(photoUrl, {headers:
  Authorization})`, reads the response as a `blob`, and returns an
  `URL.createObjectURL(blob)` — revoking it on cleanup. React Query caches the
  blob per token so re-renders/scrollbacks don't refetch.
- **`src/components/AuthImage.tsx`** (new) — thin wrapper: takes a photo token,
  calls `usePhotoBlob`, renders `<img>` from the object URL with a loading
  placeholder and a broken/expired (404) fallback.
- **`src/components/MessageBubble.jsx`** — when `kind === "photo"`, render
  `<AuthImage>` (capped size, rounded, tap-to-open lightbox) instead of
  `bubble-text`.
- **`src/components/AttachMenu.jsx`** (new) — the WhatsApp-style **`+`** button
  (see §4.3) plus its pop-up menu of image options. Self-contained; takes an
  `onPickImage(file)` callback and a `disabled` prop (out-of-range / uploading).
- **`src/pages/ChatRoom.jsx`** and **`src/components/DmPanel.jsx`** — mount
  `<AttachMenu>` at the **left edge of the composer**, before the text input. On
  pick → client-side validate (type in JPG/PNG/WEBP, size ≤ 3 MB) →
  `useSendPhoto`. Show a small "uploading…" state; surface 413/415/429 errors.

### 4.3 Composer `+` button (WhatsApp-style, rotating)
A round **`+`** button sits at the **left** of the message input.

- **Placement & shape:** left of the text box (mirrors the existing send button
  on the right), circular, same height as the input, using the app's
  liquid-glass button styling.
- **Rotate-on-open:** tapping it toggles an open state; the icon **rotates 45°**
  (so `+` becomes an `×`) via a CSS `transform: rotate(45deg)` with a
  `transition: transform 200ms ease`. Tapping again rotates back to `+` and
  closes the menu. (We already use `motion` in the app; a CSS transition is
  enough here and cheaper — but `motion` is available if you want spring feel.)
- **The menu:** an upward pop-over anchored to the button (above it, so it
  doesn't collide with the keyboard), containing the image option:
  - **Photo Library** → opens `<input type="file" accept="image/jpeg,image/png,image/webp">`.
  Each row is an icon + label (lucide `Image`). Selecting it fires the hidden
  input, closes the menu, and rotates the button back. *(A Camera option was
  removed 2026-07-12 — library only for now.)*
- **Dismiss:** clicking outside, pressing Esc, or picking an option closes it.
- **Disabled state:** when the composer is out-of-range or an upload is in
  flight, the `+` is disabled/greyed (same signal that already disables the text
  send), so the location gate is felt in the UI, not just via a 403.

```
[ + ]  [  Type a message…            ]  [ ➤ ]
  └─ tap ─▶ rotates to ×, menu pops up:
           ┌────────────────────┐
           │ 🖼  Photo Library   │
           └────────────────────┘
```

### 4.4 UX notes
- Client-side previews the picked image and shows a spinner while uploading.
- One image per send (decision #3); no caption field.
- Photo bubbles reuse the existing sender/avatar/grouping layout; only the bubble
  body differs.

---

## 5. End-to-end flows

**Room photo**
1. User taps 📷 in the composer, picks an image.
2. `useSendPhoto` → `POST /api/rooms/{rid}/messages/photo` (raw bytes).
3. Server validates bytes, **checks the location gate** (fresh + in range;
   428/403 if not), writes `room_messages(kind='photo')` + `message_photos`,
   commits, broadcasts a `photo` frame to the room channel.
4. Every connected client (incl. sender) gets the frame → `mapMessage` →
   `MessageBubble` renders `<AuthImage>`, which fetches `/api/photos/<token>`
   **with the bearer header** and shows it from an object URL.
5. 24 h later the expiration sweep deletes the message; CASCADE drops the photo;
   the fetch 404s (already filtered from history by the retrieval cutoff).

**DM photo** — identical, via `POST /api/rooms/{rid}/dm/{cid}/messages/photo` and
the `dm:<cid>` channel; participant-checked and held to the **full two-sided
proximity gate** (both people fresh + in range).

**Out of range** — on either surface, if the sender is outside the room's area
the endpoint returns 403 (`out_of_range`) and no message is created; the composer
surfaces "You're outside this room's area." The frontend also disables the 📷
button while the composer is in its out-of-range state (it already tracks this
for text), so the block is felt before the request is even sent.

---

## 6. Testing plan
- **Unit** — `sniff_image_type` moved helper still recognises JPG/PNG/WEBP and
  rejects others; `create_*_photo_message` sets `kind='photo'`, `content=NULL`,
  one photo row, CHECK holds.
- **Expiration** — insert a photo message with `sent_at` older than the cutoff,
  run `purge_expired_messages`, assert the `message_photos` row is gone (CASCADE)
  and `GET /photos/{token}` 404s.
- **API** — 400 empty / 413 oversize / 415 wrong type / 429 rate-limited; happy
  path returns a `photo` message-out and broadcasts a frame.
- **Location gate** — from an out-of-range fix, `POST .../messages/photo` returns
  403 `out_of_range` (room) / 403 or 409 (DM: self out, or recipient absent) and
  writes **no** rows; from a stale fix it returns 428 `stale_location`.
- **Manual two-client** — send a photo in a room and in a DM; confirm both
  clients render it, then walk out of range and confirm the photo send is
  **blocked** just like a text message (composer 📷 disabled, server 403).

---

## 7. Resolved decisions (all confirmed — ready to build)

- **7a — Location gate.** ✅ Photos **are** gated like text: out of range →
  blocked (§3.4, decision #5).
- **7b — Retention.** ✅ **Exactly the same as text messages** — the existing
  `message_retention_hours` sweep (24 h). No separate photo constant.
- **7c — Photo route auth.** ✅ **Authenticated** — `GET /photos/{token}`
  requires a JWT (+ participant check for DM photos). Drives the `AuthImage` /
  `usePhotoBlob` frontend loader (§4.2–4.3) since an auth route can't be a plain
  `<img src>`.
- **7d — Limits & formats.** ✅ **3 MB** cap; **JPG / PNG / WEBP** only (no GIF).

Nothing left to confirm — the plan is ready to implement on your go-ahead.

---

## 8. Security model

The three "auth" concerns are **already covered** by existing mechanisms — the
photo feature inherits them, no new auth library is added:

| Concern | Mechanism (already in the codebase) | What photos add |
|---------|-------------------------------------|-----------------|
| **User authentication** | JWT/HS256 (`pyjwt`), `HTTPBearer` + `get_current_user` ([deps.py](../backend/app/api/deps.py)) | Photo POST endpoints declare the same `UserDep`. |
| **Image-upload authentication** | Avatar upload requires `get_current_user`; validates magic bytes + size cap | Photo upload reuses the same guard + `sniff_image_type`. |
| **WebSocket authentication** | `?token=<jwt>` → `_authenticate_ws` → `decode_access_token` | Photos add **no** WS surface (bytes go over REST; the socket only relays the JSON frame), so WS auth is unchanged. |

**New hardening — upload sanitization (Pillow).** See §3.2: every upload is
decoded + re-encoded, stripping EXIF/**GPS** metadata (a location-app privacy
leak), blocking decompression-bombs, and rejecting non-images. This is the one
genuinely new security dependency.

**Serving authorization.** `GET /photos/{token}` is JWT-gated (decision #6); DM
photos additionally require the caller to be a connection participant. The UUID
token is unguessable, so it isn't the sole line of defence.

**Transport.** TLS in production (already configured for the deployed app)
protects bytes in flight, both upload and download.

### Encryption — assessed and **deferred** (2026-07-12)
Photo **encryption is out of scope for this feature.** We evaluated two models
and chose to ship neither for now:

- **End-to-end encryption (E2EE)** — feasible only for **1-to-1 DMs** (group
  E2EE across fluid, anonymous, proximity-based public rooms is impractical), and
  it **directly conflicts with the locked-in admin power "view all
  conversations/analytics"** — a true-E2EE thread is unreadable by the server and
  admin. Given that conflict, E2EE is **not** implemented now.
- **Encryption at rest** (server-held key) — would protect DB/backup dumps while
  keeping admin/moderation working, but was also **deferred** to keep this
  feature small.

**Decision:** rely on **TLS in transit + auth-gated access + Pillow
sanitization** for v1. If encryption is revisited later, at-rest is the
lower-friction next step (doesn't break admin); E2EE-for-DMs is a larger,
separately-scoped effort that would require explicitly giving up admin visibility
for those threads. Recorded here so the tradeoff isn't re-litigated from scratch.

---

## Changelog
- **2026-07-12** — Initial plan drafted after reviewing rooms/DM message paths,
  the avatar image-storage pattern, and the expiration sweep. Decisions #1–#5
  captured from the user; confirm-points raised.
- **2026-07-12** — Follow-ups: (a) decision #5 reversed — photos **are**
  location-gated like text (out of range → blocked); confirm-point 7a dropped.
  (b) Added the WhatsApp-style rotating **`+`** attach button + image-options
  menu to the frontend spec (§4.3, new `AttachMenu.jsx`).
- **2026-07-12** — Confirm-points 7b–7d resolved: retention = same knob as text
  (24 h); photo route **auth-gated** (added `AuthImage`/`usePhotoBlob` since the
  route can't back a plain `<img>`); cap **3 MB**, JPG/PNG/WEBP. All decisions
  now locked (#1–#7); plan ready to build.
- **2026-07-12** — Added §8 Security. Auth (user / upload / WebSocket) confirmed
  already covered by existing mechanisms — no new auth dep. Added **Pillow**
  upload sanitization (EXIF/GPS stripping, image-bomb defence, re-encode; §3.2,
  §3.4). **Encryption deferred**: E2EE and encryption-at-rest both assessed and
  dropped for v1 (E2EE conflicts with the admin "view all conversations" power
  and can't cover public rooms); v1 relies on TLS + auth-gating + sanitization.
- **2026-07-12 — BUILT.** Implemented end-to-end.
  - **DB:** migration `0010_message_photos` — new `message_photos` table (uuid PK
    = URL token, XOR owner FKs `ON DELETE CASCADE`, deferred `data`), plus `kind`
    + nullable `content` + a CHECK on `room_messages`/`private_messages`. Applied
    to the local DB.
  - **Backend:** `app/core/images.py` (shared `sniff_image_type` + `sanitize_image`
    Pillow re-encode; `users.py` re-exports the sniff for avatars unchanged),
    `app/models/message_photo.py`, `app/services/photos.py`, `app/api/photos.py`
    (auth-gated `GET /photos/{token}` + shared `read_photo_body`), photo POST
    endpoints on rooms (`/rooms/{id}/messages/photo`, in-range gate) and DMs
    (`/rooms/{rid}/dm/{cid}/messages/photo`, two-sided gate via extracted
    `_enforce_dm_send_gate`), `kind`/`photo_url` on the message-out schemas, and a
    `MessagePhoto.id` LEFT JOIN in both list queries. `Pillow>=10.3` added.
  - **Frontend:** `@tanstack/react-query` + `QueryClientProvider`; `tsconfig.json`;
    `types/messages.ts` (types + `validatePhotoFile`), `services/photos.ts`,
    `hooks/usePhotoBlob.ts` + `hooks/useSendPhoto.ts`, `components/AuthImage.tsx`
    (authed fetch → object URL), `components/AttachMenu.jsx` (rotating **+**),
    photo rendering + lightbox in `MessageBubble.jsx`, `kind`/`photoUrl` threaded
    through `mapMessage` → `MessageList`; composers wired in `ChatRoom.jsx` and
    `DmPanel.jsx`; styles in `styles/chat.css`.
  - **Verified:** backend HTTP E2E passed — upload → `kind='photo'`/`photo_url`,
    serve-with-auth 200, unauth 401, out-of-range 403, non-image 415; `sanitize_image`
    strips EXIF + rejects non-images; `ON DELETE CASCADE` drops the photo row when
    its message is deleted (= the 24 h sweep also reaps bytes). Frontend `npm run
    build` clean and app renders in a real browser (Playwright) with no runtime
    errors. **Not yet done:** full in-browser photo upload+render click-through
    (needs the geolocation-gated login+room flow) and the automated tests in §6.
- **2026-07-12** — Removed the **Camera** option from `AttachMenu` (and its hidden
  `capture` input) per follow-up — the attach menu is **Photo Library only** for
  now. §4.3 updated to match.
- **2026-07-12 — E2E VERIFIED (browser).** Drove the full room photo flow with
  Playwright against the real backend + Vite dev server (mocked geolocation,
  seeded session): open room → click the **+** (rotates open, menu shows Photo
  Library) → pick a JPEG → upload → the photo arrives over the WebSocket and
  renders as an `<img>` from an **auth-gated `blob:` URL** → tapping it opens the
  lightbox. Zero runtime errors. Confirms the whole chain end-to-end: upload →
  Pillow sanitize → store → broadcast → `AuthImage` authed fetch → render.
- **2026-07-12 — DM E2E VERIFIED (two clients, browser).** Scripted a two-context
  Playwright run: Alice + Bob authed, both in the same room (in range), DM
  connection created; both open the DM panel (hamburger → Personal Chats). Both
  composers enable once the **two-sided presence gate** confirms each is present.
  Alice sends a photo via the **+** menu → **Alice sees her own photo AND Bob
  receives it over his DM socket**, both rendered from participant-checked,
  auth-gated `blob:` URLs. Zero runtime errors. The DM photo path is now fully
  verified end-to-end across two clients.
