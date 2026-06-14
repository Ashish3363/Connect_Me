# Chat room UI refresh — calmer, lighter bubbles

**Date:** 2026-06-15

## Why

The chat room felt louder and less modern than the rest of the app. Own
messages used a bold purple→pink gradient with a heavy glow, which clashed with
the calm dark-glass aesthetic of the **People near you** (`NearbyRooms`) screen.
Goal: keep the dark glass aurora theme, but make the conversation read lighter
and less colourful.

## What changed

All edits are in `Chat_app/src/styles/chat.css` (pure CSS, no markup changes).

- **Own message bubbles (`.bubble-row.mine .bubble`)** — replaced the
  `rgba(139,123,255,0.6) → rgba(255,111,174,0.55)` gradient and the
  `0 6px 20px` indigo glow with a flat, faint single-accent tint
  (`rgba(139,123,255,0.16)`), a soft `rgba(139,123,255,0.28)` border, and
  standard `--text` colour instead of pure white. Enough to distinguish "mine"
  from "theirs" without shouting.
- **Neighbour bubbles (`.bubble-row.theirs .bubble`)** — switched from
  `--glass-strong` to a softer neutral `rgba(255,255,255,0.07)` fill with a
  lighter `rgba(255,255,255,0.12)` border.
- **Send button (`.send-btn`)** — dropped the pink `--accent-grad` and the
  `0 6px 18px rgba(255,111,174,0.45)` glow for a calm single-accent fill
  (`rgba(139,123,255,0.85)`) with a subtle `0 2px 10px` shadow.
- **Chat panel (`.chat-panel`)** — bumped the surface from `--glass-2` (0.06)
  to `--glass` (0.10) so the panel reads brighter/airier and matches the room
  cards on the People near you screen.

## Not changed

- Layout, markup, and component structure (`ChatRoom.jsx`, `MessageList.jsx`,
  `MessageBubble.jsx`) are untouched.
- The live-status dot, location-notice banner, and overall dark aurora
  backdrop are intentionally left as-is.
