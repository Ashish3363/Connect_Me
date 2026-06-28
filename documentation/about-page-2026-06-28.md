# About page — 2026-06-28

**Status:** Implemented (frontend only; no backend)
**Route:** `/about` (public — reachable without login)
**Entry point:** Rooms screen hamburger menu → **"About our app"**

The About page tells a first-time visitor what Hyperlocal Chat is, what makes it
different, and answers the common questions — all in the app's own visual
language (liquid-glass over the dark aurora, thin highlighted headings, glass
cards with a staggered entrance and hover-lift glow).

---

## 1. What the page is

A single scrollable, public info page with three sections:

1. **Overview** — "The big **idea**." One glass card explaining the concept.
2. **What makes it unique** — "What makes it **unique**." Four glass cards, the
   newest feature (Personal Chats) headlined first.
3. **FAQ** — "Frequently asked **questions**." Five collapsible accordion items.

A fixed top-left back button (`‹`, `navigate(-1)`) returns to the previous screen.

---

## 2. Where it lives / wiring

| File | Role |
|------|------|
| `Chat_app/src/pages/About.jsx` | The page. All copy lives in three constants at the top: `OVERVIEW`, `HIGHLIGHTS`, `FAQS`. |
| `Chat_app/src/styles/about.css` | Page styling (mirrors `styles/rooms.css`). |
| `Chat_app/src/App.jsx` | Lazy import `About` + public route `<Route path="/about" element={<About />} />` (before the catch-all). |
| `Chat_app/src/pages/NearbyRooms.jsx` | Hamburger `MENU_ITEMS` — "About our app" entry points at `/about`. |

---

## 3. Theme / UI / animation (matches the rest of the app)

Built to match the **Rooms** screen's signature look rather than a generic card style:

- **Font:** Inter (global, from `index.css`). No custom fonts.
- **Headings:** thin weight (`font-weight: 300`), large `clamp()` sizes, low-opacity
  `rgba(255,255,255,0.4)` with a solid-white `.heading-highlight` keyword — e.g.
  "About our **app**.", "What makes it **unique**." (same pattern as the Rooms
  heading "Find people near **YOU**.").
- **Surfaces:** the shared `.glass` primitive (`index.css`) for the overview card,
  feature cards, and FAQ items.
- **Design tokens:** `--accent`, `--accent-soft`, `--glass*`, `--text`,
  `--text-dim`, `--radius`, `--radius-sm` — no hard-coded colours beyond what
  `rooms.css` already uses.
- **Animation:**
  - Page wrapper fades up on mount (`aboutFadeUp`).
  - Cards enter with the staggered `aboutCardIn` (`translateY(18px)` → `0`),
    delayed per index via inline `animationDelay`, using the app's signature
    easing `cubic-bezier(0.16, 1, 0.3, 1)` — identical feel to the Rooms grid.
  - The overview ("big idea") card, the feature cards, and the FAQ items all
    **hover-lift** `translateY(-4px)` with the purple glow
    `0 18px 44px rgba(139,123,255,0.4)` (copied from `.room-card:hover`).
  - FAQ answers expand/collapse via `motion/react` height animation; the chevron
    rotates 180° — consistent with the `motion`-driven hamburger dropdown.
  - Respects `prefers-reduced-motion` (animations disabled), like `rooms.css`.

---

## 4. Full page copy

### Header
> # About our **app**.
> Hyperlocal Chat — talk to the people right around you.

### Overview ("The big **idea**.")
> Hyperlocal Chat connects you with the people who are physically near you — not a
> contact list, not the whole internet. Turn on your location and you drop into a
> room for your immediate surroundings (about a 1 km radius). Chat with whoever is
> around: ask if a café is busy, find a lost item, organise a quick meetup, or just
> talk to your neighbourhood. Conversations are ephemeral and tied to place, so the
> chat lives where you are and fades when it is done.

### What makes it unique
| Icon | Title | Body |
|------|-------|------|
| `Sparkles` | **Personal Chats — proximity-gated DMs** | Our newest feature. Tap anyone you meet in a room to start a private 1-on-1 chat. The connection is permanent — cross paths weeks later in a different part of the city and you resume the same chat instantly. But you can only send and receive while you are both physically together inside the area. Step away and it pauses; come back and it picks up exactly where it left off. |
| `MapPin` | **Location-gated rooms** | You only see and join the room for where you actually are. No global feeds, no strangers from across the world — just the people sharing your local moment. |
| `Clock` | **Ephemeral by design** | Messages expire automatically (24 hours by default). The chat is about the here and now, not a permanent record to manage. |
| `Radio` | **Real-time & private** | Live messaging with a privacy-first model: chats are tied to a place, not to your identity or a saved contact list. |

> The Personal Chats description is sourced from `documentation/private-messages.md`
> (persistent connection + room-bound, two-sided proximity gate).

### FAQ (5 items)
1. **How does the app know who is nearby?** — With your permission, the app uses
   your device location to place you in a room covering roughly a 1 km radius
   around you. Only people inside that same area appear — nobody further out.
2. **Do I need to add friends or share my phone number?** — No. There is no contact
   list and no phone number required. You simply talk to whoever is around you
   right now.
3. **What happens to my messages?** — Messages are ephemeral — they expire
   automatically after the retention window (24 hours by default). Personal Chat
   connections persist, but the messages inside them expire the same way.
4. **Why did a Personal Chat stop letting me send messages?** — Personal Chats are
   proximity-gated: you can exchange messages only while both of you are physically
   inside the area. If either person leaves, sending pauses and resumes
   automatically once you are together again.
5. **Is my location shared with other users?** — Your exact location is never shown
   to anyone. It is used only to decide which room you belong to and whether you
   are within range of a chat.

---

## 5. Editing the content

All copy is plain data at the top of `Chat_app/src/pages/About.jsx`:

- `OVERVIEW` — string.
- `HIGHLIGHTS` — array of `{ icon, title, body }` (`icon` is a `lucide-react`
  component; add the import to use a new one). Cards lay out in a responsive
  1→2 column grid automatically.
- `FAQS` — array of `{ q, a }`. Add/remove items freely; the accordion and
  stagger delays adapt.

Numbers (1 km radius, 24-hour expiry) are the app defaults; if those config
values change, update the copy here too.

---

## 6. How to verify

1. From `Chat_app/`, run `npm run dev`.
2. Open `http://localhost:5173/about` (no login), or in-app: Rooms screen →
   hamburger (top-left) → **"About our app"**.
3. Confirm headings show the thin style with the white highlighted keyword.
4. Cards fade/slide in staggered; hovering a feature card lifts it with a purple
   glow.
5. Click an FAQ question → it expands/collapses smoothly and the chevron rotates.
6. Back button returns to the previous screen; layout collapses to one column on
   narrow widths.
7. `npx eslint src/pages/About.jsx` is clean.

---

## Related
- `documentation/contact-us-page-2026-06-28.md` — sibling Contact page.
- `documentation/private-messages.md` — source for the Personal Chats highlight.
- `documentation/design-system.md` — tokens and the glass/aurora language.
