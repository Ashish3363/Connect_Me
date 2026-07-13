import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'motion/react'
import Avatar from '../components/Avatar'
import MessageList from '../components/MessageList'
import DmPanel from '../components/DmPanel'
import AttachMenu from '../components/AttachMenu'
import { getRoom, getRoomMessages, connectRoom, getCurrentPosition, avatarUrl, startDm, getDmConnections } from '../services/chat'
import { uploadRoomPhoto } from '../services/photos'
import { useSendPhoto } from '../hooks/useSendPhoto'
import { validatePhotoFile } from '../types/messages'
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

  // getRoom() is still fetched to validate the room exists; the value itself is
  // not rendered, so only the setter is bound.
  const [, setRoom] = useState(null)
  const [messages, setMessages] = useState([])
  const [loadedFor, setLoadedFor] = useState(null)
  const [draft, setDraft] = useState('')
  const [notice, setNotice] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)
  // The active private chat (a connection object from startDm), or null. Opening
  // one full-screen-replaces the group stream; closing returns to the room.
  const [dm, setDm] = useState(null)
  // "Personal Chats" dropdown in the hamburger: all of the user's persistent
  // connections, fetched lazily when first opened.
  const [dmListOpen, setDmListOpen] = useState(false)
  const [connections, setConnections] = useState([])
  const [connectionsLoading, setConnectionsLoading] = useState(false)

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

  // Photo send: upload over REST; the socket broadcast then delivers the rendered
  // message back to us (like a text send). Server enforces the same location gate.
  const sendPhoto = useSendPhoto((file) => uploadRoomPhoto(roomId, file))
  const handlePickImage = useCallback(
    (file) => {
      const err = validatePhotoFile(file)
      if (err) {
        setNotice(err)
        return
      }
      setNotice(null)
      sendPhoto.mutate(file, {
        onError: (e) => setNotice(e?.message || 'Could not send photo.'),
      })
    },
    [sendPhoto],
  )

  // Tap a person's name/avatar in the room → open (or reopen) the persistent
  // private chat with them. The same pair always resolves to the same DM.
  const handleStartDm = useCallback(
    async (senderId) => {
      if (!senderId || senderId === myId) return
      try {
        const conn = await startDm(roomId, senderId)
        setDm(conn)
      } catch (err) {
        setNotice(err?.message || 'Could not open private chat.')
      }
    },
    [roomId, myId],
  )

  // Toggle the Personal Chats dropdown; fetch the connection list on first open.
  const toggleDmList = useCallback(() => {
    const next = !dmListOpen
    setDmListOpen(next)
    if (next) {
      setConnectionsLoading(true)
      getDmConnections(roomId)
        .then(setConnections)
        .catch(() => setConnections([]))
        .finally(() => setConnectionsLoading(false))
    }
  }, [dmListOpen, roomId])

  // Open a past contact from the list — bound to the current room's geofence.
  // Optimistically clear its unread badge (the panel marks it read on the server).
  const openDmFromList = useCallback((conn) => {
    setConnections((list) =>
      list.map((x) => (x.id === conn.id ? { ...x, unreadCount: 0 } : x)),
    )
    setDm(conn)
    setDmListOpen(false)
    setMenuOpen(false)
  }, [])

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

                  {/* Personal Chats — dropdown of all the user's connections */}
                  <motion.button
                    className="chat-nav-btn chat-nav-dm-toggle"
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: (NAV_ITEMS.length + 1) * 0.055, duration: 0.2, ease: 'easeOut' }}
                    onClick={toggleDmList}
                    aria-expanded={dmListOpen}
                  >
                    <span>Personal Chats</span>
                    <span className={`chat-nav-caret ${dmListOpen ? 'open' : ''}`}>▾</span>
                  </motion.button>

                  <AnimatePresence initial={false}>
                    {dmListOpen && (
                      <motion.div
                        className="chat-dm-list"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2, ease: 'easeInOut' }}
                      >
                        {connectionsLoading ? (
                          <div className="chat-dm-empty">Loading…</div>
                        ) : connections.length === 0 ? (
                          <div className="chat-dm-empty">
                            No personal chats yet. Tap someone in a room to start one.
                          </div>
                        ) : (
                          connections.map((c) => (
                            <button
                              key={c.id}
                              className="chat-dm-item"
                              onClick={() => openDmFromList(c)}
                              title={c.inRange ? `${c.otherUserName} is in range` : `${c.otherUserName} is out of range`}
                            >
                              <Avatar
                                name={c.otherUserName}
                                size={28}
                                src={c.otherHasAvatar ? avatarUrl(c.otherUserId) : undefined}
                                online={c.inRange}
                              />
                              <span className="chat-dm-name">{c.otherUserName}</span>
                              {c.unreadCount > 0 && (
                                <span className="chat-dm-badge">{c.unreadCount}</span>
                              )}
                            </button>
                          ))
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.nav>

          {/* ── Chat panel (auto-shrinks as nav expands). A DM full-screen
                 replaces the group stream while open. ── */}
          {dm ? (
            <DmPanel key={dm.id} roomId={roomId} connection={dm} onClose={() => setDm(null)} />
          ) : (
          <section className="chat-panel">
            <MessageList
              messages={messages}
              loading={loading}
              emptyHint="You started this room. Say hi to your neighbourhood 👋"
              onStartDm={handleStartDm}
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
              <AttachMenu onPickImage={handlePickImage} disabled={sendPhoto.isPending} />
              <input
                type="text"
                placeholder={sendPhoto.isPending ? 'Sending photo…' : 'Message your neighbourhood…'}
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
          )}

        </main>
      </div>
    </div>
  )
}

export default ChatRoom
