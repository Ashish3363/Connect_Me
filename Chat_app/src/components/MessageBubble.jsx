import { memo } from 'react'
import Avatar from './Avatar'
import { avatarUrl } from '../services/chat'

// A single chat bubble. Purely presentational: every "which side / show name /
// group" decision is made upstream by groupMessages(), so this component just
// maps those flags to classes and renders. Own messages get `mine` (LEFT,
// gradient); others get `theirs` (RIGHT, glass) — styled in styles/chat.css.
//
// The sender's profile photo sits beside the first bubble of each run (the
// avatar route is public; Avatar falls back to initials when there's no photo).
// Grouped messages keep an empty avatar slot so bubbles stay aligned.
function MessageBubble({ mine, grouped, showSender, senderId, sender, text, time, onStartDm }) {
  const rowClass = `bubble-row ${mine ? 'mine' : 'theirs'}${grouped ? ' grouped' : ''}`
  // Tapping another person's name/avatar opens a private chat with them. Own
  // messages are never DM targets.
  const canDm = !mine && !!onStartDm && !!senderId
  const startDm = canDm ? () => onStartDm(senderId, sender) : undefined
  const avatar = (
    <Avatar name={sender} size={32} src={senderId ? avatarUrl(senderId) : undefined} />
  )
  return (
    <div className={rowClass}>
      <div className="bubble-avatar">
        {!grouped &&
          (canDm ? (
            <button
              type="button"
              className="avatar-dm-btn"
              onClick={startDm}
              title={`Message ${sender}`}
              aria-label={`Message ${sender}`}
            >
              {avatar}
            </button>
          ) : (
            avatar
          ))}
      </div>
      <div className="bubble-group">
        {showSender &&
          (canDm ? (
            <button
              type="button"
              className="bubble-sender bubble-sender-btn"
              onClick={startDm}
              title={`Message ${sender}`}
            >
              {sender}
            </button>
          ) : (
            <span className="bubble-sender">{sender}</span>
          ))}
        <div className="bubble">
          <span className="bubble-text">{text}</span>
          <span className="bubble-time">{time}</span>
        </div>
      </div>
    </div>
  )
}

export default memo(MessageBubble)
