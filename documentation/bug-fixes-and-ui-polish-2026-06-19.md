# Bug Fixes & UI Polish — 2026-06-19

Branch: `demo`

---

## 1. Vite Proxy Fix (Login was broken)

**File:** `Chat_app/vite.config.js`

The proxy `rewrite` rule that strips `/api` from request paths before forwarding to the FastAPI backend was correct and was left in place. The backend exposes routes at `/auth/*` and `/users/*` (no `/api` prefix), so the Vite proxy must strip `/api` from frontend calls before they reach the server.

```js
'/api': {
  target: 'http://127.0.0.1:8000',
  changeOrigin: true,
  rewrite: (path) => path.replace(/^\/api/, ''),
}
```

**Root cause investigated:** A stale uvicorn worker process was responding to some test requests with inconsistent routes. The proxy config itself was always correct.

---

## 2. Login Page — `display_name` not cleared on new session

**File:** `Chat_app/src/pages/Login.jsx`

**Bug:** After logging in as Account A (with a display name) and then logging in as Account B (no display name), the old display name from A persisted in `localStorage` and appeared on Account B's profile.

**Fix:** Always write `display_name` to localStorage unconditionally on login, even if it is empty:

```js
// Before (only wrote if truthy — old value persisted for new users)
if (data?.user?.display_name) localStorage.setItem('display_name', data.user.display_name)

// After (always overwrites, clearing any previous account's value)
localStorage.setItem('display_name', data?.user?.display_name || '')
```

**Also:** Login now redirects to `/splash` instead of directly to `/rooms`, so new users see the intro animation on first login.

---

## 3. Profile Page — multiple fixes

**File:** `Chat_app/src/pages/Profile.jsx`

### 3a. No default stock photo for new users
New users without an avatar were shown a Pexels stock photo as a placeholder. This was replaced with a dark gradient panel showing the user's initials.

```jsx
// Before: fell back to a hardcoded Pexels URL
const photo = me.hasAvatar && me.id ? avatarUrl(...) : FALLBACK_PHOTO

// After: null when no avatar — renders an initials placeholder div instead
const photo = me.hasAvatar && me.id ? avatarUrl(...) : null
const initials = name.slice(0, 2).toUpperCase()
```

### 3b. Name falls back to "You" instead of email prefix
The profile heading used `email.split('@')[0]` as a fallback when no display name was set, which looked like the email was being used as the name.

```js
// Before
const name = me.displayName || (me.email ? me.email.split('@')[0] : 'You')

// After
const name = me.displayName || 'You'
```

### 3c. `getMe()` no longer overwrites a good display name with null
When the Profile page loaded, the `getMe()` API call could return `displayName: null` briefly (e.g., first visit after signup before the backend write propagated). `setMe(u)` would overwrite the correctly-seeded localStorage value with null, causing the name to flash to "You" or the email.

```js
// Before: replaced entire me object including displayName: null
setMe(u)

// After: preserves existing displayName if API returns null
setMe((prev) => ({ ...u, displayName: u.displayName || prev.displayName }))
```

**Also:** `localStorage.display_name` is now always written (not conditionally on truthy value).

### 3d. Back button uses browser history
```js
// Before: always went to /rooms regardless of origin
onClick={() => navigate('/rooms')}

// After: goes back to wherever the user came from (chat room, rooms list, etc.)
onClick={() => navigate(-1)}
```

---

## 4. Edit Profile Page — multiple fixes

**File:** `Chat_app/src/pages/EditProfile.jsx`

### 4a. No default stock photo
Same fix as Profile — new users see a dark gradient circle with initials instead of the Pexels photo.

### 4b. Name heading shows "Your name" instead of email prefix
```js
// Before
const name = displayName.trim() || me?.email?.split('@')[0] || 'You'

// After
const name = displayName.trim() || 'Your name'
```

### 4c. Cancel / back arrow no longer cause a profile ↔ edit loop
Both the back arrow `‹` and the Cancel button were calling `navigate('/profile')`, which pushed a new history entry every time. Pressing back would go to edit, pressing cancel would go to profile, and so on infinitely.

```js
// Before: pushed a new /profile entry on each click
onClick={() => navigate('/profile')}

// After: pops the history stack — one click, one step back
onClick={() => navigate(-1)}
```

The Save action still uses `navigate('/profile', { replace: true })` so it replaces the edit entry rather than stacking.

### 4d. Password fields no longer autofill from browser
Password fields had `autoComplete="current-password"` and `autoComplete="new-password"`, which caused browsers to inject saved credentials from other accounts.

```jsx
// Before — browser autofills with saved account credentials
autoComplete="current-password"
autoComplete="new-password"

// After — disabled
autoComplete="off"
```

---

## 5. Settings Page — back button fix

**File:** `Chat_app/src/pages/Settings.jsx`

Same fix as Profile — back button changed from `navigate('/rooms')` to `navigate(-1)`.

---

## 6. Splash Screen — blue-purple flash on exit

**File:** `Chat_app/src/pages/Splash.jsx`

**Bug:** After the "You need to Connect, Express, Enjoy" animation completed, a brief blue-purple flash appeared before the rooms page loaded. The flash was the body's animated aurora gradient (`background-color: #0a0b18` with radial gradients) showing through as the Splash component faded to `opacity: 0`.

**Root cause:** The entire `<motion.main>` (including its `bg-black`) was animated to `opacity: 0`. At zero opacity the black background became transparent, exposing the body underneath.

**Fix:** The outer wrapper is now a static `<main>` (never animates). Only the inner content div fades out. The black background stays solid until React replaces the route with NearbyRooms.

```jsx
// Before: entire page (including black bg) faded to transparent
<motion.main className="... bg-black" animate={{ opacity: exiting ? 0 : 1 }}>

// After: black wrapper stays opaque; only content fades
<main className="... bg-black">
  <motion.div animate={{ opacity: exiting ? 0 : 1 }}
    onAnimationComplete={() => { if (exiting) navigate('/rooms', { replace: true }) }}>
```

**Also:** Navigation is now triggered via `onAnimationComplete` instead of a separate `setTimeout`, eliminating the 100ms window between animation end and navigation where the body could briefly show.

---

## Verification

All fixes were verified end-to-end with a Playwright/Chromium headless test run against the live Vite dev server and FastAPI backend:

| Check | Result |
|---|---|
| Signup → splash → rooms | ✅ |
| No stock photo for new users | ✅ |
| Profile name shows "You" (not email) | ✅ |
| Display name save persists on profile | ✅ |
| Cancel from edit → no loop | ✅ |
| Second cancel also exits cleanly | ✅ |
| Back from profile (came from rooms) → rooms | ✅ |
| No blue-purple flash on splash exit | ✅ |
| Zero console errors across full session | ✅ |
| Location granted → `/rooms/nearby` 200 | ✅ |
| Location denied → prompt shown | ✅ |
