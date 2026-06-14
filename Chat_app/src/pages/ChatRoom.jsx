import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Avatar from '../components/Avatar'
import Footer from '../components/Footer'
import MessageList from '../components/MessageList'
import { getRoom, getRoomMessages, connectRoom, getCurrentPosition, avatarUrl } from '../services/chat'
import '../styles/chat.css'

// Keep the stored fix comfortably under the server's 5-min freshness window.
const LOCATION_REFRESH_MS = 4 * 60 * 1000

function ChatRoom() {
  const { roomId } = useParams()
  const navigate = useNavigate()

  const [room, setRoom] = useState(null)
  const [messages, setMessages] = useState([])
  const [loadedFor, setLoadedFor] = useState(null)
  const [draft, setDraft] = useState('')
  const [notice, setNotice] = useState(null)
  const connRef = useRef(null)
  // The last text we tried to send, and the text held back because the send was
  // rejected for a stale fix — resent on the next location_ack so the user's
  // message isn't silently lost.
  const lastAttemptRef = useRef(null)
  const pendingResendRef = useRef(null)

  // Open the room WebSocket. It's created INSIDE the effect (not useMemo) so
  // React StrictMode's mount→cleanup→mount cycle yields a fresh, open socket
  // each time, instead of reusing one its own cleanup already closed.
  useEffect(() => {
    const conn = connectRoom(roomId)
    connRef.current = conn
    let disposed = false
    let refreshTimer = null
    let recheckTimer = null

    // Read the device GPS and push it over the socket. The backend's freshness
    // gate blocks messaging until it receives one of these.
    const pushLocation = async () => {
      try {
        const { lat, lng } = await getCurrentPosition()
        if (!disposed) conn.sendLocation(lat, lng)
      } catch (err) {
        if (disposed) return
        setNotice(
          err?.code === 1 // PERMISSION_DENIED
            ? 'Location permission denied — enable it to chat in this area.'
            : 'Can’t read your location — messaging is paused until it’s back.',
        )
      }
    }

    conn.setHandlers({
      onOpen: () => pushLocation(),
      onMessage: (msg) =>
        setMessages((m) => (m.some((x) => x.id === msg.id) ? m : [...m, msg])),
      onLocationRequired: () => {
        setNotice('Updating your location…')
        pushLocation()
      },
      onLocationAck: () => {
        setNotice(null)
        const pending = pendingResendRef.current
        if (pending) {
          pendingResendRef.current = null
          conn.send(pending)
        }
      },
      onGeofenceWarning: (f) => {
        setNotice(
          `You're ${Math.round(f.distance_m)} m away — move back within ` +
            `${f.grace_seconds_remaining}s or you'll leave this room.`,
        )
        if (recheckTimer) clearTimeout(recheckTimer)
        recheckTimer = setTimeout(
          pushLocation,
          (f.recheck_interval_seconds || 30) * 1000,
        )
      },
      onGeofenceExit: () => {
        setNotice('You’ve left this area — returning to nearby rooms.')
        conn.close()
        navigate('/rooms')
      },
      onError: (f) => {
        if (f.code === 'stale_location') {
          pendingResendRef.current = lastAttemptRef.current
          setNotice('Refreshing your location…')
          pushLocation()
        } else if (f.code === 'rate_limited') {
          setNotice(`You're sending too fast — wait ${f.retry_after}s.`)
        } else {
          setNotice(f.detail || 'Something went wrong.')
        }
      },
    })

    // Proactively keep the fix fresh so messaging never stalls mid-session.
    refreshTimer = setInterval(pushLocation, LOCATION_REFRESH_MS)

    return () => {
      disposed = true
      if (refreshTimer) clearInterval(refreshTimer)
      if (recheckTimer) clearTimeout(recheckTimer)
      conn.close()
      connRef.current = null
    }
  }, [roomId, navigate])

  // Load room + group history.
  useEffect(() => {
    let alive = true
    Promise.all([getRoom(roomId), getRoomMessages(roomId)]).then(([r, msgs]) => {
      if (!alive) return
      setRoom(r)
      setMessages(msgs)
      setLoadedFor(roomId)
    })
    return () => {
      alive = false
    }
  }, [roomId])

  const loading = loadedFor !== roomId

  // Members = everyone who has spoken (You + neighbours), keyed by id so each
  // person appears once and carries the id needed to load their avatar.
  const members = useMemo(() => {
    const myId = localStorage.getItem('user_id')
    const map = new Map()
    if (myId) map.set(myId, { id: myId, name: 'You' })
    for (const m of messages) {
      if (m.senderId && !map.has(m.senderId)) {
        map.set(m.senderId, { id: m.senderId, name: m.from === 'me' ? 'You' : m.sender })
      }
    }
    return [...map.values()]
  }, [messages])

  const handleSend = useCallback(
    (e) => {
      e.preventDefault()
      const text = draft.trim()
      if (!text) return
      setDraft('')
      lastAttemptRef.current = text // so we can resend if the fix is stale
      connRef.current?.send(text) // server persists + echoes back to everyone (incl. us)
    },
    [draft],
  )

  return (
    <div className="chat-room">
      <main className="chat-body">
        <aside className="chat-sidebar">
          <div className="sidebar-head">
            <button className="back-rooms" onClick={() => navigate('/rooms')} aria-label="Back to rooms">‹</button>
            <div className="sidebar-title">
              <strong>{room?.name ?? 'Room'}</strong>
              <span>{loading ? 'loading…' : `${members.length} people within 1 km`}</span>
            </div>
          </div>
          <div className="roster">
            {members.map((mem) => (
              <div className="roster-item" key={mem.id}>
                <Avatar name={mem.name} size={40} online src={avatarUrl(mem.id)} />
                <span className="roster-name">{mem.name}</span>
              </div>
            ))}
          </div>
        </aside>

        <section className="chat-panel">
          <header className="chat-header">
            <button className="chat-back" onClick={() => navigate('/rooms')} aria-label="Back">‹</button>
            <div className="chat-peer">
              <span className="chat-peer-name">{room?.name ?? 'Room'}</span>
              <span className="chat-peer-status">
                <span className="dot-live" /> {members.length} people nearby
              </span>
            </div>
          </header>

          <MessageList
            messages={messages}
            loading={loading}
            emptyHint="You started this room. Say hi to your neighbourhood 👋"
          />

          {notice && (
            <div
              role="status"
              style={{
                margin: '0 16px 10px',
                padding: '8px 14px',
                borderRadius: 12,
                background: 'rgba(255, 176, 32, 0.14)',
                border: '1px solid rgba(255, 176, 32, 0.35)',
                color: '#b9791a',
                fontSize: 13,
                lineHeight: 1.4,
              }}
            >
              {notice}
            </div>
          )}

          <form className="chat-composer" onSubmit={handleSend}>
            <input
              type="text"
              placeholder="Message your neighbourhood…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              aria-label="Message"
            />
            <button type="submit" className="send-btn" disabled={!draft.trim()} aria-label="Send">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </form>
        </section>
      </main>

      <Footer />
    </div>
  )
}

export default ChatRoom
