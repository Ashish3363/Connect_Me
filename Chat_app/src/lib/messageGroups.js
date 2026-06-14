// Pure presentation logic for the chat stream — shared by <MessageList> and
// unit-tested in isolation (no React or DOM needed).
//
// Each message is mapped to a "row" carrying the display flags the UI needs:
//   mine        — sent by the current user (rendered on the LEFT)
//   showSender  — show the sender's name above this bubble (others only, and
//                 only when a new sender starts a run of messages)
//   grouped     — this message continues a run from the same sender as the one
//                 directly above it → tighter spacing, no repeated name
//
// `from === 'me'` is decided upstream in services/chat.js by comparing the
// message's sender_id to the authenticated user's id — the source of truth.
// The same mapper is used for historical (REST) and live (WebSocket) messages,
// so alignment and grouping are identical for both.

export function isOwn(message) {
  return message.from === 'me'
}

export function groupMessages(messages) {
  return messages.map((message, i) => {
    const prev = i > 0 ? messages[i - 1] : null
    const mine = isOwn(message)
    // "Same run" = same author as the message directly above. Others are keyed
    // by sender name; our own messages have no name, so identity is just "me".
    const sameAsPrev =
      prev != null &&
      isOwn(prev) === mine &&
      (mine || prev.sender === message.sender)
    return {
      ...message,
      mine,
      grouped: sameAsPrev,
      // Name only for others, and only at the start of a run.
      showSender: !mine && !sameAsPrev,
    }
  })
}
