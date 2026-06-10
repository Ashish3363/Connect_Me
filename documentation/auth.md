# Authentication (Login / Register UI)

**Status:** Implemented
**Last updated:** 2026-06-10

Email + password authentication. The backend (built earlier, 2026-06-07) issues
a long-lived JWT; this feature covers the **frontend** UI and its wiring, plus
how the session is stored.

---

## Behaviour

- A single liquid-glass card on `/` that **toggles** between *Sign in* and
  *Create account* modes (no page navigation).
- **Register:** `POST /api/auth/signup` with `{ email, password }`. Password must
  be ≥ 8 characters (backend rule, enforced in the UI). On success the user is
  auto-signed-in and sent to `/rooms`.
- **Sign in:** `POST /api/auth/login`. Wrong credentials → backend `401`, shown
  inline as red error text. Only valid credentials proceed.
- Client-side validation: valid email format + non-empty password before any
  network call.

## Session storage

On success the frontend stores in `localStorage`:
- `token` — the JWT (`Authorization: Bearer <token>` on every API call).
- `user_id` — used to distinguish the user's own messages from others' in rooms.

Logout (Profile page) clears both and returns to `/`.

## Backend endpoints (pre-existing)

- `POST /auth/signup` → `{ access_token, token_type, expires_in, user }`
- `POST /auth/login` → same shape; `401` invalid creds, `403` banned/suspended.
- Passwords hashed with **bcrypt**; JWT is HS256, 7-day expiry. Email normalised
  to lowercase. Login runs bcrypt even on misses (anti-enumeration timing).

## Files

| File | Responsibility |
|------|----------------|
| `src/pages/Login.jsx` | The toggle card, validation, calls + session storage. |
| `src/api.js` | `login()` / `signup()` fetch helpers; unwraps FastAPI `{detail}` errors. |
| `src/auth.css` | Liquid-glass styling for the auth card. |
| `src/components/ProtectedRoute.jsx` | Gates `/rooms`, `/settings`, `/profile` on a stored token. |

## Known limitations

- No "forgot password", email verification, or refresh-token flow (stateless JWT;
  logout just discards the token client-side).
- Only email + password collected (backend also supports optional
  `username`/`display_name`).

---

## Changelog

### 2026-06-10
- Built the login/register UI (liquid glass), wired to the real auth backend.
- Switched post-login destination to `/rooms`; store `user_id` alongside `token`.
