import { memo } from 'react'

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

function Avatar({ name = '?', size = 44, online }) {
  return (
    <span
      className="avatar"
      style={{
        width: size,
        height: size,
        background: colorFor(name),
        fontSize: size * 0.4,
      }}
      aria-hidden="true"
    >
      {initials(name)}
      {online != null && (
        <span className={`avatar-dot ${online ? 'is-online' : ''}`} />
      )}
    </span>
  )
}

export default memo(Avatar)
