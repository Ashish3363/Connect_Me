# Signup First/Last Name → Display Name

**Status:** Implemented (frontend)
**Last updated:** 2026-06-20

The **Create New Profile** (register) screen collects **First Name** and **Last
Name**. These are now combined into a single `display_name` and persisted, and
the same value appears pre-filled on the **Edit Profile** screen.

---

## 1. The bug this fixed

Previously the First/Last Name inputs were **dead code**: bound to React state
and rendered, but the submit handler only sent `{ email, password }`. The names
were never sent, validated, or stored. (The backend already supported an
optional `display_name`; it was simply never populated.)

---

## 2. Approach

Per product decision, first + last are **merged into the existing
`display_name`** column — no new DB columns, no migration. `display_name` is
the value already used everywhere (chat roster, profile, localStorage).

`display_name = \`${firstName} ${lastName}\`.trim()`

---

## 3. Changes

| File | Change |
|------|--------|
| `Chat_app/src/api.js` | `signup()` now accepts `displayName` and sends `display_name` in the POST body. |
| `Chat_app/src/pages/Login.jsx` | Register mode requires a first name; `handleSubmit` builds `displayName` from first + last and passes it to `signup()`. |

No backend changes were required:
- `SignupIn` (`backend/app/schemas/auth.py`) already has
  `display_name: str | None`.
- `register_user` (`backend/app/services/auth.py`) already stores it.
- `AuthOut` returns `user.display_name`, which `Login.jsx` writes to
  `localStorage.display_name` (existing behavior).

---

## 4. Edit Profile visibility

`EditProfile.jsx` already pre-fills its **Display name** field from
`getMe().displayName`, so the name saved at signup shows up there automatically
with no further change. Because option 1 merges the two names, Edit Profile
presents a single "Display name" field rather than separate First/Last inputs.

---

## 5. Verification

Signed up against the running backend with `display_name: "Ashish Singh"`:

- `POST /auth/signup` → response `user.display_name = "Ashish Singh"`
- `GET /users/me` → `display_name = "Ashish Singh"` (the value Edit Profile loads)
