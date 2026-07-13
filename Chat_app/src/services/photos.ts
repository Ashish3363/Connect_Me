// Photo message API — upload a photo and fetch a photo's bytes (auth-gated).
//
// Uploads POST the raw File bytes (Content-Type = the image type), mirroring the
// avatar upload. The serving route requires the bearer token, so a photo can't
// be a plain <img src> — we fetch it here and hand back a Blob that the UI turns
// into an object URL (see usePhotoBlob / AuthImage).

const API = import.meta.env.VITE_API_URL || '/api'

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function toError(res: Response): Promise<Error> {
  let detail: string | undefined
  try {
    const data = await res.json()
    // Backend sends either {detail: "..."} or {detail: {code, message}}.
    if (typeof data.detail === 'string') detail = data.detail
    else if (data.detail?.message) detail = data.detail.message
  } catch {
    // no/invalid body
  }
  return new Error(detail || `Request failed (${res.status})`)
}

async function uploadPhoto(path: string, file: File): Promise<unknown> {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': file.type, ...authHeaders() },
    body: file,
  })
  if (!res.ok) throw await toError(res)
  return res.json()
}

// POST a photo to a public room. Resolves when stored; the socket broadcast then
// delivers the rendered message to every client (including us).
export function uploadRoomPhoto(roomId: string, file: File): Promise<unknown> {
  return uploadPhoto(`/rooms/${roomId}/messages/photo`, file)
}

// POST a photo to a DM connection (opened from a room).
export function uploadDmPhoto(
  roomId: string,
  connectionId: string,
  file: File,
): Promise<unknown> {
  return uploadPhoto(`/rooms/${roomId}/dm/${connectionId}/messages/photo`, file)
}

// Fetch a photo's bytes with the bearer header. Returns a Blob (cached by
// usePhotoBlob); the component makes/revokes the object URL per mount.
export async function fetchPhotoBlob(photoUrl: string): Promise<Blob> {
  const res = await fetch(`${API}${photoUrl}`, { headers: authHeaders() })
  if (!res.ok) throw await toError(res)
  return res.blob()
}
