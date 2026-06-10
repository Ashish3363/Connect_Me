# Locality Intro Experience

**Status:** Implemented
**Last updated:** 2026-06-10

The cinematic opening shown on `/rooms` after login, before the room grid appears.

---

## Behaviour

On `/rooms`, a single page plays two phases over a dimmed, cross-fading
slideshow of three aerial locality photos:

1. **Intro** — the headline **"Connect to your locality"** types on letter-by-letter
   (with a glowing caret), holds briefly, then **fades and blurs away**.
2. **Reveal** — the "start chatting" box and the nearby-rooms grid animate in
   over the still-running (dimmed) slideshow. (Room data is fetched up front via
   geolocation so it's ready when the intro ends — see
   [hyperlocal-rooms.md](hyperlocal-rooms.md).)

Timings live at the top of `NearbyRooms.jsx` (type speed, hold, fade) and are
easy to retune. Respects `prefers-reduced-motion`.

## Image optimization

The source drone photos in `Chat_app/Photo/` were ~10.5 MB total — too heavy to
ship. A reusable script converts them to web-ready WebP:

- `scripts/optimize-images.mjs` (run via `npm run optimize:images`) →
  1920px-wide WebP at quality 76, written to `src/assets/locality/`.
- Result: **10.5 MB → 1.66 MB** (~84% smaller). Originals in `Photo/` are untouched.
- The optimized images are **code-split into the rooms chunk** — they only
  download after login, not on the initial page load.

## Files

| File | Responsibility |
|------|----------------|
| `src/pages/NearbyRooms.jsx` | Phase state machine (slideshow + typewriter + reveal). |
| `src/styles/rooms.css` | Slideshow, dim overlay, headline/caret, vanish animation. |
| `src/assets/locality/index.js` | Exports the three optimized WebP backdrops. |
| `scripts/optimize-images.mjs` | Regenerates the optimized WebP images. |

## Known limitations

- Fixed three background images; not configurable per locality.
- The intro plays on every visit to `/rooms` (no "seen it" skip).

---

## Changelog

### 2026-06-10
- Built the dimmed slideshow + typewriter headline that fades into the room grid.
- Added `sharp`-based image optimization script and WebP backdrops (10.5 MB → 1.66 MB).
