import { useEffect, useMemo, useRef } from 'react'
import MessageBubble from './MessageBubble'
import { groupMessages } from '../lib/messageGroups'

// How close to the bottom (px) the user must be for an incoming message to
// auto-scroll. If they've scrolled up to read older messages, we leave them
// there instead of yanking them down.
const NEAR_BOTTOM_PX = 120

// The scrollable message stream. Owns two concerns so <ChatRoom> doesn't have
// to: grouping consecutive messages (via groupMessages) and scroll behavior.
function MessageList({ messages, loading, emptyHint }) {
  const scrollRef = useRef(null)
  const prevLenRef = useRef(0)
  const rows = useMemo(() => groupMessages(messages), [messages])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const prevLen = prevLenRef.current
    prevLenRef.current = rows.length

    const isInitialLoad = prevLen === 0 && rows.length > 0
    const appended = rows.length > prevLen
    const lastIsMine = rows.length > 0 && rows[rows.length - 1].mine
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    const nearBottom = distanceFromBottom <= NEAR_BOTTOM_PX

    // Jump to newest on first load, when the user sends, or when a message
    // arrives while they're already at the bottom. Otherwise preserve their
    // scroll position (they're reading history).
    if (isInitialLoad || (appended && (lastIsMine || nearBottom))) {
      el.scrollTop = el.scrollHeight
    }
  }, [rows])

  return (
    <div className="chat-scroll" ref={scrollRef}>
      {loading ? (
        <div className="chat-loading">Loading conversation…</div>
      ) : rows.length === 0 ? (
        <div className="chat-empty">{emptyHint}</div>
      ) : (
        rows.map((row) => (
          <MessageBubble
            key={row.id}
            mine={row.mine}
            grouped={row.grouped}
            showSender={row.showSender}
            senderId={row.senderId}
            sender={row.sender}
            text={row.text}
            time={row.time}
          />
        ))
      )}
    </div>
  )
}

export default MessageList
