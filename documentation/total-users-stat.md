# Total Registered Users Stat Box

**Status:** Implemented (frontend + backend)
**Last updated:** 2026-06-20

A static stat card on the **Find people near YOU** page (`NearbyRooms`) that
shows the total number of registered accounts on the website. It mirrors the
look, font, and entrance animation of the "Click Me to Enter the chat" room
cards, but is purely informational — it is not clickable and has no connection
to rooms or nearby presence.

---

## 1. What it shows

`Users: <N>` where `N` is `COUNT(*)` over the entire `users` table — every
account that has ever registered, regardless of location or activity. The count
loads on page mount, independent of the geolocation flow, so it appears even
before (or without) location permission. Until the request resolves it renders
`Users: …`.

---

## 2. Backend

**Endpoint:** `GET /users/count` — public, no auth required.

| File | Change |
|------|--------|
| `backend/app/api/users.py` | New `total_user_count` route returning `{"count": <int>}` via `select(func.count()).select_from(User)`. Declared before `/me` and `/{user_id}/avatar`, so the static `count` segment is never shadowed by a path param. |

Registered through the existing `user_routes.router` in `backend/app/main.py`.

---

## 3. Frontend

| File | Change |
|------|--------|
| `Chat_app/src/services/chat.js` | New `getUserCount()` — `fetch('/api/users/count')`, returns `data.count`. No auth header needed. |
| `Chat_app/src/pages/NearbyRooms.jsx` | `userCount` state; a dedicated `useEffect([])` fires `getUserCount()` on mount (separate from the geolocation effect so it never waits on location). Card rendered inside `.locality-stage`. |
| `Chat_app/src/styles/rooms.css` | `.users-stat-card` — reuses `.room-card` / `.room-card-name` for identical font and sizing. |

---

## 4. Styling & positioning

- **Reused classes:** `room-card` + `room-card-name` (same `clamp()` font,
  weight 300, letter-spacing) and the `heading-highlight` accent on the number.
- **Position:** `position: absolute; bottom: 28px; left: 50%` with
  `transform: translateX(-50%)` inside `.locality-stage` (which is
  `position: relative; height: 100dvh`). This pins it to the **bottom middle**
  of the viewport, with **no page scroll** required.
- **Specificity:** the rules use the compound selector
  `.room-card.users-stat-card` (not just `.users-stat-card`). `.room-card` is
  declared *later* in `rooms.css` and sets `position: relative`; with equal
  specificity the later rule wins, which silently dropped the card into normal
  flow off-screen. The compound selector outranks `.room-card` so the absolute
  positioning sticks regardless of source order.
- **Background:** solid black (`#000`) to match the page, with a bright
  `1.5px rgba(255,255,255,0.55)` border and a soft purple glow
  (`box-shadow: 0 0 28px rgba(139,123,255,0.35)`) so the black-on-black box
  stays clearly visible.
- **Animation:** a dedicated `statCardIn` keyframe animates **opacity only**.
  The room cards' `cardIn` keyframe ends on `transform: translateY(0)` with
  `fill-mode: both`, which would otherwise overwrite the centering transform —
  so this card gets its own transform-free fade-in.
- **Static:** `cursor: default`; the inherited `:hover` / `:active` lift is
  neutralised (transform kept as the centering translate).

---

## 5. Gotchas encountered

- `position: fixed` is unreliable here: an ancestor CSS `transform`
  (`rooms-wrap` fade-up) and `body { overflow-x: hidden }` broke it. Switching to
  `position: absolute` within the full-height `.locality-stage` fixed both the
  scroll-following and clipping problems.
- The shared `cardIn` animation's final `translateY(0)` silently overrode the
  `translate(-50%, -50%)` centering — the box rendered off-position. Resolved
  with the opacity-only `statCardIn`.
