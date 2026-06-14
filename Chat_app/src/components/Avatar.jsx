import { memo, useState } from 'react'

// Initials avatar with a deterministic colour derived from the name.
// No network requests — keeps the bundle light and works offline.

const COLORS = [
  '#f5333f', '#7b61ff', '#00b3a4', '#ff8c42',
  '#e84393', '#0984e3', '#6c5ce7', '#e17055',
]

function colorFor(name) {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0
  }
  return COLORS[Math.abs(hash) % COLORS.length]
}

function initials(name) {
  const parts = name.trim().split(/\s+/)
  const first = parts[0]?.[0] ?? ''
  const second = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return (first + second).toUpperCase()
}

// `src` renders a photo instead of initials (e.g. a profile avatar). When it's
// absent — or the image fails to load (e.g. the user has no photo, so the
// public avatar route 404s) — we fall back to the deterministic initials chip.
function Avatar({ name = '?', size = 44, online, src }) {
  // Remember which src failed (rather than a bare boolean) so that when `src`
  // changes to a new user, the photo is attempted again — no effect needed.
  const [failedSrc, setFailedSrc] = useState(null)

  const showPhoto = src && failedSrc !== src
  return (
    <span
      className="avatar"
      style={{
        width: size,
        height: size,
        background: showPhoto ? 'transparent' : colorFor(name),
        fontSize: size * 0.4,
      }}
      aria-hidden="true"
    >
      {showPhoto ? (
        <img
          className="avatar-img"
          src={src}
          alt=""
          width={size}
          height={size}
          onError={() => setFailedSrc(src)}
        />
      ) : (
        initials(name)
      )}
      {online != null && (
        <span className={`avatar-dot ${online ? 'is-online' : ''}`} />
      )}
    </span>
  )
}

export default memo(Avatar)
