// Shared message shape for the chat UI. Both room and DM messages are mapped to
// this by services/chat.js#mapMessage, so bubbles render them identically.

export type MessageKind = 'text' | 'photo'

export interface ChatMessage {
  id: string
  senderId: string
  from: 'me' | 'them'
  sender?: string
  time: string
  kind: MessageKind
  // Present for text messages.
  text?: string
  // Backend-relative serving path for photo messages (e.g. "/photos/<token>");
  // null/undefined for text. Fetched auth-gated via usePhotoBlob.
  photoUrl?: string | null
}

// Client-side upload constraints — mirror the backend (3 MB; JPG/PNG/WEBP).
export const MAX_PHOTO_BYTES = 3 * 1024 * 1024
export const ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

export interface PhotoValidationError {
  message: string
}

// Returns an error message if the file is unacceptable, or null if it's fine.
export function validatePhotoFile(file: File): string | null {
  if (!ALLOWED_PHOTO_TYPES.includes(file.type as (typeof ALLOWED_PHOTO_TYPES)[number])) {
    return 'Please choose a JPG, PNG, or WEBP image.'
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return 'Image is too large — the limit is 3 MB.'
  }
  return null
}
