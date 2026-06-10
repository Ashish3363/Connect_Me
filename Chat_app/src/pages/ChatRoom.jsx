import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Avatar from '../components/Avatar'
import Footer from '../components/Footer'
import { getRoom, getRoomMessages, connectRoom } from '../services/chat'
import '../styles/chat.css'

function ChatRoom() {
  const { roomId } = useParams()
  const navigate = useNavigate()

  const [room, setRoom] = useState(null)
  const [messages, setMessages] = useState([])
  const [loadedFor, setLoadedFor] = useState(null)
  const [draft, setDraft] = useState('')
  const scrollRef = useRef(null)
  const connRef = useRef(null)

  // Open the room WebSocket. It's created INSIDE the effect (not useMemo) so
  // React StrictMode's mount→cleanup→mount cycle yields a fresh, open socket
  // each time, instead of reusing one its own cleanup already closed.
  useEffect(() => {
    const conn = connectRoom(roomId)
    conn.setHandlers({
      onMessage: (msg) =>
        setMessages((m) => (m.some((x) => x.id === msg.id) ? m : [...m, msg])),
    })
    connRef.current = conn
    return () => {
      conn.close()
      connRef.current = null
    }
  }, [roomId])

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

  // Auto-scroll to newest.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  const loading = loadedFor !== roomId

  // Members = everyone who has spoken (You + neighbours), newest last.
  const members = useMemo(() => {
    const seen = []
    for (const m of messages) {
      if (m.sender && !seen.includes(m.sender)) seen.push(m.sender)
    }
    if (!seen.includes('You')) seen.unshift('You')
    return seen
  }, [messages])

  const handleSend = useCallback(
    (e) => {
      e.preventDefault()
      const text = draft.trim()
      if (!text) return
      setDraft('')
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
            {members.map((name) => (
              <div className="roster-item" key={name}>
                <Avatar name={name} size={40} online />
                <span className="roster-name">{name === 'You' ? 'You' : name}</span>
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

          <div className="chat-scroll" ref={scrollRef}>
            {loading ? (
              <div className="chat-loading">Loading conversation…</div>
            ) : messages.length === 0 ? (
              <div className="chat-empty">
                You started this room. Say hi to your neighbourhood 👋
              </div>
            ) : (
              messages.map((m, i) => {
                const mine = m.from === 'me'
                const showSender =
                  !mine && (i === 0 || messages[i - 1].sender !== m.sender)
                return (
                  <div key={m.id} className={`bubble-row ${mine ? 'mine' : 'theirs'}`}>
                    <div className="bubble-group">
                      {showSender && <span className="bubble-sender">{m.sender}</span>}
                      <div className="bubble">
                        {m.text}
                        <span className="bubble-time">{m.time}</span>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>

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
