import { useCallback, useEffect, useRef, useState } from 'react'
import Avatar from './Avatar'
import MessageList from './MessageList'
import AttachMenu from './AttachMenu'
import { getDmMessages, connectDm, getCurrentPosition, avatarUrl, markDmRead } from '../services/chat'
import { uploadDmPhoto } from '../services/photos'
import { useSendPhoto } from '../hooks/useSendPhoto'
import { validatePhotoFile } from '../types/messages'

const LOCATION_REFRESH_MS = 4 * 60 * 1000

// Full-screen 1-on-1 chat that replaces the room view. It reuses MessageList /
// MessageBubble / .chat-composer so the bubbles, fonts and spacing are identical
// to the room. The composer is enabled ONLY while both people are inside the
// active room's geofence — sending and receiving pause the moment either leaves,
// and resume automatically on return (the same connection, never a new thread).
function DmPanel({ roomId, connection, onClose }) {
  const { id: connectionId, otherUserId, otherUserName, otherHasAvatar } = connection

  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState('')
  // null = not yet known (don't alarm the user before the first location check);
  // true / false once the server reports our standing and the peer's presence.
  const [selfInside, setSelfInside] = useState(null)
  const [peerPresent, setPeerPresent] = useState(null)
  const [notice, setNotice] = useState(null)

  const connRef = useRef(null)
  const lastAttemptRef = useRef(null)
  const pendingResendRef = useRef(null)

  // Load history (visible even when out of range). The panel is remounted per
  // connection (keyed by id in ChatRoom), so `loading` starts true on mount and
  // we never need to reset it synchronously here.
  useEffect(() => {
    let alive = true
    getDmMessages(roomId, connectionId)
      .then((msgs) => {
        if (alive) {
          setMessages(msgs)
          setLoading(false)
        }
      })
      .catch(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [roomId, connectionId])

  // Mark this conversation read while it's open (on open, and again on close to
  // catch anything received during the session), so the unread badge clears.
  useEffect(() => {
    markDmRead(connectionId).catch(() => {})
    return () => {
      markDmRead(connectionId).catch(() => {})
    }
  }, [connectionId])

  // Live socket + periodic location push (mirrors ChatRoom's geofence loop).
  useEffect(() => {
    const conn = connectDm(roomId, connectionId)
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
            ? 'Location permission denied — enable it to chat here.'
            : "Can't read your location — messaging is paused until it's back.",
        )
      }
    }

    conn.setHandlers({
      onOpen: () => pushLocation(),
      onMessage: (msg) =>
        setMessages((m) => (m.some((x) => x.id === msg.id) ? m : [...m, msg])),
      // The peer entered/left the area — flip the composer accordingly.
      onPeerPresence: (f) => {
        if (String(f.user_id) === String(otherUserId)) setPeerPresent(!!f.present)
      },
      onLocationRequired: () => {
        setNotice('Updating your location…')
        pushLocation()
      },
      onLocationAck: () => {
        setSelfInside(true)
        setNotice(null)
        const pending = pendingResendRef.current
        if (pending) {
          pendingResendRef.current = null
          conn.send(pending)
        }
      },
      onGeofenceWarning: (f) => {
        setSelfInside(false)
        if (recheckTimer) clearTimeout(recheckTimer)
        recheckTimer = setTimeout(pushLocation, (f.recheck_interval_seconds || 30) * 1000)
      },
      onGeofenceExit: () => setSelfInside(false),
      onError: (f) => {
        if (f.code === 'stale_location') {
          pendingResendRef.current = lastAttemptRef.current
          setNotice('Refreshing your location…')
          pushLocation()
        } else if (f.code === 'out_of_range') {
          setSelfInside(false)
        } else if (f.code === 'recipient_unavailable') {
          setPeerPresent(false)
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
  }, [roomId, connectionId, otherUserId])

  const canSend = selfInside === true && peerPresent === true

  const handleSend = useCallback(
    (e) => {
      e.preventDefault()
      const text = draft.trim()
      if (!text || !canSend) return
      setDraft('')
      lastAttemptRef.current = text
      connRef.current?.send(text)
    },
    [draft, canSend],
  )

  // Photo send over REST; the socket broadcast delivers it back. The two-sided
  // gate is enforced server-side, and the + button is disabled unless canSend.
  const sendPhoto = useSendPhoto((file) => uploadDmPhoto(roomId, connectionId, file))
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

  // Only show an out-of-range banner once we KNOW someone is out (=== false),
  // never while presence is still unknown (null) — that was the false
  // "you're outside" flash on open.
  const banner =
    peerPresent === false
      ? `${otherUserName} is outside the area — messaging paused.`
      : selfInside === false
        ? "You're outside this room's area — messaging paused."
        : notice

  const statusText = canSend
    ? ''
    : peerPresent === false
      ? `${otherUserName} is away`
      : selfInside === false
        ? 'Out of range'
        : 'Connecting…'

  return (
    <section className="chat-panel">
      <header className="dm-header">
        <button className="dm-back" onClick={onClose} aria-label="Back to room">
          ←
        </button>
        <Avatar
          name={otherUserName}
          size={40}
          src={otherHasAvatar ? avatarUrl(otherUserId) : undefined}
        />
        <div className="dm-peer">
          <span className="dm-peer-name">{otherUserName}</span>
          <span className="dm-peer-status">
            {canSend && <span className="dot-live" />}
            {statusText}
          </span>
        </div>
      </header>

      <MessageList
        messages={messages}
        loading={loading}
        emptyHint={`This is the start of your private chat with ${otherUserName}. Say hi 👋`}
      />

      {banner && (
        <div className="dm-banner" role="status">
          {banner}
        </div>
      )}

      <form className="chat-composer" onSubmit={handleSend}>
        <AttachMenu
          onPickImage={handlePickImage}
          disabled={!canSend || sendPhoto.isPending}
        />
        <input
          type="text"
          placeholder={
            sendPhoto.isPending
              ? 'Sending photo…'
              : canSend
                ? `Message ${otherUserName}…`
                : 'Messaging paused — both must be in the area'
          }
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={!canSend}
          aria-label="Message"
        />
        <button
          type="submit"
          className="send-btn"
          disabled={!canSend || !draft.trim()}
          aria-label="Send"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </form>
    </section>
  )
}

export default DmPanel
