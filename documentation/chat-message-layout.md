# WhatsApp-style Chat Message Layout

**Status:** Implemented (frontend)
**Last updated:** 2026-06-15

The room chat stream renders like a WhatsApp/Telegram group: the current user's
messages and everyone else's are clearly distinct, with grouped runs, sender
names, timestamps, and sensible auto-scroll. Works identically for historical
(REST) and live (WebSocket) messages.

> **Side convention (project-specific):** per the product decision, the current
> user's own messages are on the **LEFT** and other participants' on the
> **RIGHT** — the mirror of stock WhatsApp. Everything else (bubble styling,
> grouping, names) follows the familiar messenger pattern.

---

## 1. Component structure

The message UI is split into small, reusable pieces so `<ChatRoom>` only wires
data and the rendering logic lives in one place:

| File | Responsibility |
|------|----------------|
| `src/lib/messageGroups.js` | **Pure** logic: maps messages → rows with `mine` / `showSender` / `grouped` flags. No React/DOM. |
| `src/components/MessageBubble.jsx` | Presentational single bubble — maps flags to classes, renders text + time (+ sender name for others). |
| `src/components/MessageList.jsx` | The scrollable stream — groups via `messageGroups`, renders bubbles, owns scroll behaviour. |
| `src/pages/ChatRoom.jsx` | Loads room + messages, manages the socket, renders `<MessageList>`. |
| `src/styles/chat.css` | All bubble styling (single source of truth — no inline style logic). |

---

## 2. Sender detection (own vs other)

The authenticated user's id is the **source of truth**:

- On login, `user_id` is stored (`localStorage`, `Login.jsx`).
- `services/chat.js → mapMessage()` sets `from: raw.sender_id === user_id ? 'me' : 'them'`
  for **every** message — the same mapper for REST history and WebSocket frames.
- `messageGroups.isOwn()` reads that flag; `mine === true` → render as own message.

Because both paths run through one mapper, alignment is automatically correct for
historical *and* real-time messages.

---

## 3. Styling

| | Own messages | Other users' messages |
|--|--------------|------------------------|
| Side | **LEFT** (`.bubble-row.mine`) | **RIGHT** (`.bubble-row.theirs`) |
| Bubble | Gradient (purple→pink), white text, tail down-left | Glass, default text, tail down-right |
| Corners | Rounded (20px, one tail corner 6px) | Rounded (20px, one tail corner 6px) |
| Max width | `min(78%, 520px)`, `82%` on phones | same |
| Sender name | never shown | shown above, at the start of a run |
| Timestamp | shown in the bubble | shown in the bubble |

Long content is safe: `overflow-wrap: anywhere` + `min-width: 0` on the group
wrap long words/URLs, and `.bubble-text { white-space: pre-wrap }` preserves
author newlines — no horizontal overflow.

---

## 4. Message grouping

`groupMessages()` computes, per message:

- `grouped` — the message directly above is from the **same author** (own↔own, or
  same sender name for others). Grouped rows sit tight (`gap: 2px`); a new run
  adds `margin-top: 10px`, so each sender's run reads as one block.
- `showSender` — `true` only for **others** and only on the **first** message of
  a run, so the name isn't repeated for consecutive messages.

This yields the expected transcript shape:

```
[Hello everyone!]            (LEFT, you)
[How is the traffic today?]  (LEFT, you, grouped — no name)
                                      John
                              [Hi there!]        (RIGHT)
                              [still here]       (RIGHT, grouped — no name)
[thanks]                     (LEFT, you)
```

---

## 5. Scrolling behaviour

`<MessageList>` owns scroll so it can be smart about it:

- **Initial load** → jump to the newest message.
- **You send** → always jump to the newest (last row is `mine`).
- **Incoming while at the bottom** → follow to the newest.
- **Incoming while scrolled up** (reading history) → **stay put** (within
  `NEAR_BOTTOM_PX = 120`), preserving the read position instead of yanking down.

No page refresh is involved — new messages arrive over the WebSocket and the list
re-renders in place.

---

## 6. Responsive design

- Bubbles cap at `min(78%, 520px)` on desktop and `82%` on screens ≤ 760px, so
  they stay within the 70–80% band and never span the full width.
- On phones the roster sidebar is hidden and the stream goes full-width
  (existing `@media (max-width: 760px)` rule), with reduced scroll padding.
- Long words / URLs wrap; no overflow on any width.

---

## 7. Tests

`src/lib/messageGroups.test.js` (Node's built-in runner — no extra deps):

```bash
cd Chat_app
npm test
```

Covers: own → LEFT, others → RIGHT, `isOwn` detection, sender-name shown once per
run then suppressed, grouping of consecutive same-sender messages, alternating
senders, own↔other transitions (the expected transcript), and that a live
WebSocket message groups/aligns by the same rules as history.

The visual pieces (bubble styling, responsiveness) are verified via
`npm run build` + `npm run lint` and manual check in the browser.
