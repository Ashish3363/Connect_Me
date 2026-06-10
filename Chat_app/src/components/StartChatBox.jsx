import { useState } from 'react'

// "Start chatting" composer on the landing page. Typing the first message
// creates (or joins) your locality room and posts it.
function StartChatBox({ onStart, busy, disabled }) {
  const [text, setText] = useState('')

  function submit(e) {
    e.preventDefault()
    const t = text.trim()
    if (t && !busy && !disabled) onStart(t)
  }

  return (
    <form className="start-box glass" onSubmit={submit}>
      <div className="start-box-head">
        <span className="start-box-title">Start chatting</span>
        <span className="start-box-sub">
          Say something to people within 1&nbsp;km — it opens a room they can join.
        </span>
      </div>
      <div className="start-box-row">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={
            disabled
              ? 'Enable location to start a chat…'
              : 'Say something to your neighbourhood…'
          }
          aria-label="Start a message"
          maxLength={500}
          disabled={disabled}
        />
        <button
          type="submit"
          className="start-send"
          disabled={busy || disabled || !text.trim()}
        >
          {busy ? '…' : (
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          )}
        </button>
      </div>
    </form>
  )
}

export default StartChatBox
