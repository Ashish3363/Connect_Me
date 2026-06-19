import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'motion/react'
import Avatar from '../components/Avatar'
import MessageList from '../components/MessageList'
import { getRoom, getRoomMessages, connectRoom, getCurrentPosition, avatarUrl } from '../services/chat'
import ConfettiBackground from '../components/ui/confetti-background'
import '../styles/chat.css'

const LOCATION_REFRESH_MS = 4 * 60 * 1000

const NAV_ITEMS = [
  { label: '← Back',   path: '/rooms'    },
  { label: 'Settings', path: '/settings' },
  { label: 'Profile',  path: '/profile'  },
]

function ChatRoom() {
  const { roomId } = useParams()
  const navigate = useNavigate()

  const [room, setRoom] = useState(null)
  const [messages, setMessages] = useState([])
  const [loadedFor, setLoadedFor] = useState(null)
  const [draft, setDraft] = useState('')
  const [notice, setNotice] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)

  const myId   = localStorage.getItem('user_id') || ''
  const myName = localStorage.getItem('display_name') || localStorage.getItem('email')?.split('@')[0] || 'You'
  const myPhoto = myId ? avatarUrl(myId, localStorage.getItem('avatar_v')) : undefined

  const connRef = useRef(null)
  const lastAttemptRef = useRef(null)
  const pendingResendRef = useRef(null)

  useEffect(() => {
    const conn = connectRoom(roomId)
    connRef.current = conn
    let disposed = false
    let refreshTimer = null
    let recheckTimer = null

    const pushLocation = async () => {
      try {
        const { lat, lng } = await getCurrentPosition()
        if (!disposed) conn.sendLocation(lat, lng)
      } catch (err) {
        if (disposed) return
        setNotice(
          err?.code === 1
            ? 'Location permission denied — enable it to chat in this area.'
            : "Can't read your location — messaging is paused until it's back.",
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
        setNotice("You've left this area — returning to nearby rooms.")
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

    refreshTimer = setInterval(pushLocation, LOCATION_REFRESH_MS)

    return () => {
      disposed = true
      if (refreshTimer) clearInterval(refreshTimer)
      if (recheckTimer) clearTimeout(recheckTimer)
      conn.close()
      connRef.current = null
    }
  }, [roomId, navigate])

  useEffect(() => {
    let alive = true
    Promise.all([getRoom(roomId), getRoomMessages(roomId)]).then(([r, msgs]) => {
      if (!alive) return
      setRoom(r)
      setMessages(msgs)
      setLoadedFor(roomId)
    })
    return () => { alive = false }
  }, [roomId])

  const loading = loadedFor !== roomId

  const handleSend = useCallback(
    (e) => {
      e.preventDefault()
      const text = draft.trim()
      if (!text) return
      setDraft('')
      lastAttemptRef.current = text
      connRef.current?.send(text)
    },
    [draft],
  )

  return (
    <div className="chat-room">
      <ConfettiBackground />
      <div className="chat-container">
        <main className="chat-body">

          {/* ── Animated left nav (hamburger → expands into menu) ── */}
          <motion.nav
            className="chat-left-nav"
            animate={{ width: menuOpen ? 220 : 52 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            onMouseEnter={() => setMenuOpen(true)}
            onMouseLeave={() => setMenuOpen(false)}
          >
            {/* Hamburger bars */}
            <div className="chat-hamburger-bars">
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  animate={{ width: menuOpen ? (i === 1 ? 14 : 20) : 20 }}
                  transition={{ duration: 0.25, ease: 'easeInOut' }}
                  className="chat-bar"
                  style={{ width: 20 }}
                />
              ))}
            </div>

            {/* Menu items — stagger in on open, fade out on close */}
            <AnimatePresence>
              {menuOpen && (
                <motion.div
                  className="chat-nav-items"
                  initial={{ opacity: 0, scaleY: 0.9, y: -4 }}
                  animate={{ opacity: 1, scaleY: 1,   y: 0  }}
                  exit={{    opacity: 0, scaleY: 0.9,  y: -4 }}
                  transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                  style={{ transformOrigin: 'top' }}
                >
                  {/* User avatar + name */}
                  <motion.div
                    className="chat-nav-user"
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0, duration: 0.2, ease: 'easeOut' }}
                  >
                    <Avatar name={myName} size={36} src={myPhoto} />
                    <span className="chat-nav-username">{myName}</span>
                  </motion.div>

                  <div className="chat-nav-divider" />

                  {NAV_ITEMS.map(({ label, path }, i) => (
                    <motion.button
                      key={label}
                      className="chat-nav-btn"
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: (i + 1) * 0.055, duration: 0.2, ease: 'easeOut' }}
                      onClick={() => navigate(path)}
                    >
                      {label}
                    </motion.button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.nav>

          {/* ── Chat panel (auto-shrinks as nav expands) ── */}
          <section className="chat-panel">
            <MessageList
              messages={messages}
              loading={loading}
              emptyHint="You started this room. Say hi to your neighbourhood 👋"
            />

            {notice && (
              <div
                role="status"
                style={{
                  margin: '0 12px 10px',
                  padding: '8px 14px',
                  borderRadius: 12,
                  background: 'rgba(255, 176, 32, 0.14)',
                  border: '1px solid rgba(255, 176, 32, 0.35)',
                  color: '#fbbf24',
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
      </div>
    </div>
  )
}

export default ChatRoom
