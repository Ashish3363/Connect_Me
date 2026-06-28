# Contact Us page — 2026-06-28

**Status:** Implemented (frontend only; no backend / no form)
**Route:** `/contact` (public — reachable without login)
**Entry point:** Rooms screen hamburger menu → **"Contact Us"**

A simple, on-brand page giving three ways to reach the maintainer — **Email,
GitHub, LinkedIn** — styled in the app's own visual language (liquid-glass over
the dark aurora, thin highlighted heading, glass cards with a staggered entrance
and hover-lift glow). No contact form and no backend: the links are direct
`mailto:` / external profile links, plus copy-to-clipboard for the email.

---

## 1. What the page is

- **Header:** "Get in **touch**." + a short subtitle.
- **Three glass cards** (responsive 1 → 3 column grid):
  - **Email** — `Mail` icon, `mailto:` link, plus a copy-to-clipboard button.
  - **GitHub** — GitHub brand mark, opens the profile in a new tab.
  - **LinkedIn** — LinkedIn brand mark, opens the profile in a new tab.

> **Icons note:** `lucide-react` (v1.x here) dropped its brand icons, so the
> GitHub / LinkedIn marks are small inline-SVG components defined at the top of
> `Contact.jsx`. They take the same `size` prop and use `currentColor`, so they
> drop into `<ContactCard icon={…} />` exactly like a lucide icon. Only `Mail`,
> `Copy`, and `Check` are still imported from `lucide-react`.
- A fixed top-left back button (`‹`, `navigate(-1)`).

---

## 2. Where it lives / wiring

| File | Role |
|------|------|
| `Chat_app/src/pages/Contact.jsx` | The page. Details live in one `CONTACT` constant at the top. |
| `Chat_app/src/styles/contact.css` | Page styling (mirrors `styles/about.css` / `styles/rooms.css`). |
| `Chat_app/src/App.jsx` | Lazy import `Contact` + public route `<Route path="/contact" element={<Contact />} />` (before the catch-all). |
| `Chat_app/src/pages/NearbyRooms.jsx` | Hamburger `MENU_ITEMS` — "Contact Us" entry points at `/contact`. |

---

## 3. Theme / UI / animation (matches the rest of the app)

Built to match the **About / Rooms** look rather than a generic card style:

- **Font:** Inter (global, from `index.css`).
- **Heading:** thin weight (`font-weight: 300`), large `clamp()` size, low-opacity
  `rgba(255,255,255,0.4)` with a solid-white `.heading-highlight` keyword —
  "Get in **touch**." (same pattern as "Find people near **YOU**." and
  "What makes it **unique**.").
- **Surfaces:** the shared `.glass` primitive for the three cards.
- **Design tokens:** `--accent`, `--accent-soft`, `--glass*`, `--text`,
  `--text-dim`, `--radius` — no hard-coded colours beyond what `rooms.css` uses.
- **Animation:**
  - Page wrapper fades up on mount (`contactFadeUp`).
  - Cards enter with the staggered `contactCardIn` (`translateY(18px)` → `0`),
    delayed per card (0 / 70 / 140 ms) using the signature easing
    `cubic-bezier(0.16, 1, 0.3, 1)` — same feel as the Rooms grid.
  - Cards **hover-lift** `translateY(-4px)` with the purple glow
    `0 18px 44px rgba(139,123,255,0.4)` (copied from `.room-card:hover`).
  - The copy button swaps `Copy` → `Check` (green) with a small `motion/react`
    scale/fade pop; reverts after ~1.5 s.
  - Respects `prefers-reduced-motion`.

---

## 4. Page copy

> # Get in **touch**.
> Have a question or some feedback? Reach out anytime.

| Card | Value |
|------|-------|
| **Email** | `ashishsingh3363@gmail.com` (with copy button) |
| **GitHub** | `github.com/Ashish3363` |
| **LinkedIn** | `www.linkedin.com/in/ashish-kumar-772797231/` |

---

## 5. Editing the details

All values live in one constant at the top of `Chat_app/src/pages/Contact.jsx`:

```js
const CONTACT = {
  email: 'ashishsingh3363@gmail.com',
  github: 'https://github.com/Ashish3363',
  linkedin: 'https://www.linkedin.com/in/ashish-kumar-772797231/',
}
```

The `https://` prefix is stripped automatically for display on the GitHub /
LinkedIn cards. To add another channel (e.g. Twitter/X), add a value here, import
the matching `lucide-react` icon, and drop in another `<ContactCard … />`.

---

## 6. How to verify

1. From `Chat_app/`, run `npm run dev`.
2. Open `http://localhost:5173/contact` (no login), or in-app: Rooms screen →
   hamburger (top-left) → **"Contact Us"**.
3. Confirm the heading shows the thin style with the white highlighted keyword
   and the three cards fade/slide in staggered.
4. Hovering a card lifts it with a purple glow.
5. Click the email copy button → icon turns to a green check for ~1.5 s; the
   clipboard holds the email.
6. GitHub / LinkedIn open in a new tab; the email link opens the mail client.
7. Back button returns to the previous screen; cards stack to one column on
   narrow widths.
8. `npx eslint src/pages/Contact.jsx` is clean.

---

## Related
- `documentation/about-page-2026-06-28.md` — sibling About page (same styling system).
- `documentation/design-system.md` — tokens and the glass/aurora language.
