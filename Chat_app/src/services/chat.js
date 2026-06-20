// ============================================================================
// Chat data service — talks to the real FastAPI backend.
//   REST  via the Vite proxy:  /api/* -> http://localhost:8000/*
//   WS    via the Vite proxy:  /ws/*  -> ws://localhost:8000/ws/*
//
// Endpoints:
//   POST /rooms/start                -> startLocalRoom()  (create-or-join cell)
//   GET  /rooms/nearby?lat&lng       -> getNearbyRooms()  (PostGIS ST_DWithin)
//   GET  /rooms/{id}                 -> getRoom()
//   GET  /rooms/{id}/messages        -> getRoomMessages()
//   WS   /ws/rooms/{id}?token=       -> connectRoom()
// ============================================================================

const API =
  import.meta.env.VITE_API_URL || '/api'

function authHeaders() {
  const token = localStorage.getItem('token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function toError(res) {
  let detail
  try {
    const data = await res.json()
    detail = typeof data.detail === 'string' ? data.detail : data.detail?.[0]?.msg
  } catch {
    // no body
  }
  return new Error(detail || `Request failed (${res.status})`)
}

async function apiGet(path) {
  const res = await fetch(`${API}${path}`, { headers: authHeaders() })
  if (!res.ok) throw await toError(res)
  return res.json()
}

async function apiPost(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw await toError(res)
  return res.json()
}

// ---- shape mappers (backend -> UI) ----
function mapRoom(r) {
  return {
    id: r.id,
    name: r.name,
    geohash: r.geohash,
    distanceM: Math.round(r.distance_m ?? 0),
    members: r.members ?? 0,
  }
}

function formatTime(iso) {
  const d = new Date(iso)
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function mapMessage(raw) {
  const myId = localStorage.getItem('user_id')
  return {
    id: String(raw.id),
    senderId: raw.sender_id, // used to load the sender's avatar
    from: raw.sender_id === myId ? 'me' : 'them',
    sender: raw.sender_name,
    text: raw.content,
    time: formatTime(raw.sent_at),
  }
}

// ---- REST ----
export async function getNearbyRooms({ lat, lng }) {
  const rooms = await apiGet(`/rooms/nearby?lat=${lat}&lng=${lng}`)
  return rooms.map(mapRoom)
}

export async function startLocalRoom({ lat, lng, message }) {
  const room = await apiPost('/rooms/start', { lat, lng, message })
  return mapRoom(room)
}

export async function getRoom(roomId) {
  return mapRoom(await apiGet(`/rooms/${roomId}`))
}

function mapUser(u) {
  return {
    id: u.id,
    email: u.email,
    username: u.username,
    displayName: u.display_name,
    hasAvatar: u.has_avatar,
    avatarUpdatedAt: u.avatar_updated_at,
  }
}

// Total registered accounts — public, no auth needed (GET /users/count).
export async function getUserCount() {
  const res = await fetch(`${API}/users/count`)
  if (!res.ok) throw await toError(res)
  const data = await res.json()
  return data.count
}

// The authenticated user's own profile (GET /users/me).
export async function getMe() {
  return mapUser(await apiGet('/users/me'))
}

// Public avatar URL for an <img src>. `version` (avatar_updated_at) busts the
// cache after a photo change.
export function avatarUrl(userId, version) {
  const v = version ? `?v=${encodeURIComponent(version)}` : ''
  return `${API}/users/${userId}/avatar${v}`
}

// PATCH /users/me — update the display name.
export async function updateProfile({ displayName }) {
  const res = await fetch(`${API}/users/me`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ display_name: displayName }),
  })
  if (!res.ok) throw await toError(res)
  return mapUser(await res.json())
}

// POST /users/me/avatar — raw image bytes as the body (no multipart).
export async function uploadAvatar(file) {
  const res = await fetch(`${API}/users/me/avatar`, {
    method: 'POST',
    headers: { 'Content-Type': file.type, ...authHeaders() },
    body: file,
  })
  if (!res.ok) throw await toError(res)
  return mapUser(await res.json())
}

// POST /users/me/password — returns 204 (no body) on success.
export async function changePassword({ currentPassword, newPassword, confirmPassword }) {
  const res = await fetch(`${API}/users/me/password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({
      current_password: currentPassword,
      new_password: newPassword,
      confirm_password: confirmPassword,
    }),
  })
  if (!res.ok) throw await toError(res)
}

export async function getRoomMessages(roomId) {
  const msgs = await apiGet(`/rooms/${roomId}/messages`)
  return msgs.map(mapMessage)
}

// ---- geolocation ----
// Resolves to { lat, lng }. `maximumAge` lets the browser serve a recent cached
// fix (battery-friendly); we don't need high accuracy for a ~1 km geofence.
export function getCurrentPosition(opts = {}) {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Geolocation unavailable'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      reject,
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 10_000, ...opts },
    )
  })
}

// ---- WebSocket ----
// Frames are routed by their `type`. Real chat messages carry NO `type` (just
// id/content/sent_at); everything with a `type` is a control frame and must NOT
// be rendered as a message (doing so produced "Invalid Date" bubbles).
function routeFrame(frame, handlers) {
  const type = frame.type
  if (!type || type === 'message') {
    handlers.onMessage?.(mapMessage(frame))
    return
  }
  switch (type) {
    case 'location_required':
      handlers.onLocationRequired?.(frame)
      break
    case 'location_ack':
      handlers.onLocationAck?.(frame)
      break
    case 'geofence_warning':
      handlers.onGeofenceWarning?.(frame)
      break
    case 'geofence_exit':
      handlers.onGeofenceExit?.(frame)
      break
    case 'error':
      handlers.onError?.(frame)
      break
    default:
      break // unknown control frame — ignore
  }
}

export function connectRoom(roomId, initialHandlers = {}) {
  let handlers = initialHandlers
  let closed = false
  const queue = []

  const token = localStorage.getItem('token') || ''
  const wsBase =
    import.meta.env.VITE_WS_URL ||
    `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`;

  const url =
    `${wsBase}/ws/rooms/${roomId}?token=${encodeURIComponent(token)}`
  const ws = new WebSocket(url)

  const sendRaw = (obj) => {
    if (closed) return
    const payload = JSON.stringify(obj)
    if (ws.readyState === WebSocket.OPEN) ws.send(payload)
    else queue.push(payload)
  }

  ws.onopen = () => {
    while (queue.length) ws.send(queue.shift())
    handlers.onOpen?.()
  }
  ws.onmessage = (e) => {
    let frame
    try {
      frame = JSON.parse(e.data)
    } catch {
      return // ignore malformed frames
    }
    routeFrame(frame, handlers)
  }

  return {
    setHandlers(next) {
      handlers = next || {}
    },
    send(text) {
      const t = (text || '').trim()
      if (!t) return
      sendRaw({ type: 'message', content: t })
    },
    sendLocation(lat, lng) {
      sendRaw({ type: 'location', lat, lng })
    },
    close() {
      closed = true
      try {
        ws.close()
      } catch {
        // already closed
      }
    },
  }
}
