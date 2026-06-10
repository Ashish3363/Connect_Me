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

const API = '/api'

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

export async function getRoomMessages(roomId) {
  const msgs = await apiGet(`/rooms/${roomId}/messages`)
  return msgs.map(mapMessage)
}

// ---- WebSocket ----
export function connectRoom(roomId, initialHandlers = {}) {
  let handlers = initialHandlers
  let closed = false
  const queue = []

  const token = localStorage.getItem('token') || ''
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
  const url = `${proto}://${window.location.host}/ws/rooms/${roomId}?token=${encodeURIComponent(token)}`

  const ws = new WebSocket(url)

  ws.onopen = () => {
    while (queue.length) ws.send(queue.shift())
  }
  ws.onmessage = (e) => {
    try {
      handlers.onMessage?.(mapMessage(JSON.parse(e.data)))
    } catch {
      // ignore malformed frames
    }
  }

  return {
    setHandlers(next) {
      handlers = next || {}
    },
    send(text) {
      const t = (text || '').trim()
      if (!t || closed) return
      const payload = JSON.stringify({ content: t })
      if (ws.readyState === WebSocket.OPEN) ws.send(payload)
      else queue.push(payload)
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
