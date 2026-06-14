# User Profile & Edit

**Status:** Implemented (backend + frontend)
**Last updated:** 2026-06-15

View and edit your own profile: display name, profile photo, and password. MVP
scope — focused, validated, and secured to the authenticated user.

> **Note:** the original brief mentioned a read-only *phone number*. The app is
> email+password only (no phone anywhere in the system), so per the product
> decision phone was **left out**; the Profile page shows the account email.

---

## 1. Pages (frontend)

| Route | Page | Shows / does |
|-------|------|--------------|
| `/profile` | `Profile.jsx` | Photo (or initials), name, email (read-only), **Edit Profile** + **Log out** |
| `/profile/edit` | `EditProfile.jsx` | Edit display name, upload/replace photo (with preview), change password |

`Avatar.jsx` gained an optional `src` prop: with a photo it renders the image,
otherwise the deterministic initials chip — and if the image fails to load (e.g.
a user with no photo, so the public avatar route 404s) it falls back to initials.
The chat service (`services/chat.js`) exposes `getMe`, `updateProfile`,
`uploadAvatar`, `changePassword`, and `avatarUrl(id, version)` (the `version` =
`avatar_updated_at`, a cache-buster).

### Photos in the chat room

Profile photos also appear inside `/rooms/:roomId` (`ChatRoom.jsx`):

- **Message bubbles** — the sender's photo shows beside the first bubble of each
  run (grouped messages keep an empty slot so bubbles stay aligned); on the left
  for your own messages, on the right for others. Messages now carry `senderId`
  (`mapMessage`) and the bubble builds `avatarUrl(senderId)`.
- **Roster** — members are keyed by sender id (so each person appears once, with
  "You" for yourself) and each shows their photo, falling back to initials.

Other users' photos load via the **public** `GET /users/{id}/avatar`; no extra
per-message metadata is needed.

### Edit form behaviour

One form with **Save Changes** + **Cancel**, a `Saving…` loading state, and inline
success/error messages.

- **Display name** — required, 3–30 chars (trimmed). Validated client-side and
  again by the API schema.
- **Photo** — `Upload/Change photo` opens a file picker (`image/jpeg,png,webp`),
  shows an **instant preview** via `URL.createObjectURL`, and replaces any
  existing photo. Type and ≤ 2 MB size are checked before upload.
- **Password** — optional; only changed when any of the three fields is filled.
  Then all three are required and `new === confirm` (min 8 chars).

On save it calls only the endpoints that changed (name / photo / password), then
refreshes the cached identity.

---

## 2. API (backend)

All routes are under `/users` and (except the public avatar GET) require the
bearer token; they act on **the caller's own row only** — no endpoint takes
another user's id to modify. Password hashes are never serialized (`UserOut`).

| Method & path | Body | Result |
|---------------|------|--------|
| `GET /users/me` | — | `UserOut` (incl. `has_avatar`, `avatar_updated_at`) |
| `PATCH /users/me` | `{ display_name }` | `422` if not 3–30 chars; else updated `UserOut` |
| `POST /users/me/avatar` | raw image bytes (Content-Type = image type) | `415` bad type, `413` too big, `400` empty; else `UserOut` |
| `POST /users/me/password` | `{ current_password, new_password, confirm_password }` | `400` wrong current, `422` mismatch/short; else `204` |
| `GET /users/{id}/avatar` | — (public) | image bytes + content-type, or `404` |

The avatar upload sends **raw bytes** (not multipart) so no `python-multipart`
dependency is needed. The server validates the image by **magic bytes**
(`sniff_image_type`) and stores the canonical content-type — the client-declared
type is not trusted.

### Storage

Avatars live **inline in Postgres** (migration `0008_user_avatar`):

| Column | Type | Purpose |
|--------|------|---------|
| `avatar_data` | BYTEA (deferred) | image bytes; deferred so normal user fetches don't load them |
| `avatar_content_type` | text | canonical MIME type from magic bytes |
| `avatar_updated_at` | timestamptz | "has a photo" flag + client cache-buster |

`User.has_avatar` is derived from `avatar_updated_at` (never touches the deferred
bytes). The `GET /users/{id}/avatar` route selects the bytes directly, so it's
the only path that reads them.

---

## 3. Security

- **Own profile only** — every mutation depends on `get_current_user`; there is no
  route to edit another user. An unauthenticated mutation returns `401`.
- **Image validation** — type checked by magic bytes (JPG/PNG/WEBP) and size
  capped at 2 MB; non-images are rejected with `415` even if mislabelled.
- **No hash exposure** — `UserOut` omits `password_hash`; password change verifies
  the current password (`400` on mismatch) before hashing the new one (bcrypt).

---

## 4. Tests & verification

- `backend/tests/test_users.py` — magic-byte sniffing (accepts JPG/PNG/WEBP,
  rejects non-images and a RIFF/WAV masquerading as an image). `uv run pytest -q`.
- End-to-end smoke (manual, against a running server) confirmed: name validation
  (422), avatar upload (415 for non-image, 200 + `has_avatar`), public avatar GET
  (200 `image/png`), password change (400 wrong current, 422 mismatch, 204 ok,
  then login with the new password), and `401` on unauthenticated edit.
- Frontend: `npm run lint`, `npm run build`, `npm test` all green.

---

## 5. Files

| File | Role |
|------|------|
| `backend/app/models/user.py` | avatar columns + `has_avatar` |
| `backend/app/schemas/user.py` | `UserOut` avatar fields, `ProfileUpdateIn`, `PasswordChangeIn` |
| `backend/app/services/users.py` | name/avatar/password mutations + `sniff_image_type` |
| `backend/app/api/users.py` | the five routes above |
| `backend/alembic/versions/0008_user_avatar.py` | avatar columns migration |
| `Chat_app/src/pages/Profile.jsx` | profile view |
| `Chat_app/src/pages/EditProfile.jsx` | edit form |
| `Chat_app/src/components/Avatar.jsx` | optional photo `src` |
| `Chat_app/src/services/chat.js` | profile API calls + `avatarUrl` |
