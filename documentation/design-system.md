# Liquid-Glass Design System & App Shell

**Status:** Implemented
**Last updated:** 2026-06-10

The visual language and navigation shell shared across the app: frosted "liquid
glass" surfaces floating over a dark animated aurora, with an indigo→pink accent.

---

## Design tokens (`src/index.css`)

Defined as CSS variables on `:root`:
- **Accent:** `--accent` `#8b7bff`, `--accent-2` `#ff6fae`, `--accent-grad`.
- **Text on glass:** `--text`, `--text-dim`, `--muted`.
- **Glass:** `--glass`, `--glass-strong`, `--glass-2`, `--glass-border`,
  `--glass-hi`, `--blur` (22px), `--glass-shadow`, `--glass-inset`.
- **Shape:** `--radius` (22px), `--radius-sm` (14px).

The global `body` paints a dark aurora (`radial-gradient` blobs + slow
`auroraDrift` animation). A reusable `.glass` class applies the frosted look
(`backdrop-filter: blur(...) saturate(...)` + border + shadow). All animations
respect `prefers-reduced-motion`.

## App shell & routing (`src/App.jsx`)

Routes, with code-splitting via `React.lazy` (each page is its own chunk):
- `/` → Login (eager, in the main bundle)
- `/rooms` → NearbyRooms (locality intro + room grid)
- `/rooms/:roomId` → ChatRoom (group stream)
- `/settings` → Settings
- `/profile` → Profile
- `*` → redirect to `/`

`/rooms`, `/settings`, `/profile` are wrapped in `ProtectedRoute` (token-gated).

## Shared components

| Component | Role |
|-----------|------|
| `src/components/Footer.jsx` | Floating glass bottom nav: **Settings** (left), **Chats** (centre), **Profile avatar** (right). |
| `src/components/Avatar.jsx` | Initials avatar with a deterministic colour — no image requests. |
| `src/components/ProtectedRoute.jsx` | Redirects to `/` when no token is stored. |

## Stylesheets

| File | Scope |
|------|-------|
| `src/index.css` | Tokens, reset, global aurora, scrollbars, `.glass`. |
| `src/auth.css` | Login card. |
| `src/styles/rooms.css` | Locality intro + room grid + start box. |
| `src/styles/chat.css` | Chat room, roster, bubbles, composer, footer, settings/profile. |

## Performance / deploy notes

- Route-level code-splitting keeps the initial JS ~76 kB gzip.
- Avatars are CSS/initials (no network).
- Lint-clean against React 19's strict hook rules (no synchronous `setState`
  inside effects; loading states are derived).

## Responsiveness

- Room grid reflows (`auto-fill, minmax(220px, 1fr)`).
- On phones (≤ 760px) the chat room hides the roster sidebar and shows the group
  stream full-width with a back button.

---

## Changelog

### 2026-06-10
- Introduced the liquid-glass design system (tokens, aurora backdrop, `.glass`).
- Built the app shell: lazy routes, protected routes, glass footer nav,
  Settings and Profile pages.
- Replaced the earlier red/white chat mock styling with glass throughout.
