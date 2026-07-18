import { useCallback, useEffect, useRef, useState } from 'react'
import { Plus, Image as ImageIcon } from 'lucide-react'

import mixpanel from '../mixpanel'

// The round "+" button at the LEFT of the composer (WhatsApp-style). Tapping it
// rotates the icon 45° (+ becomes ×) and pops up a small menu. Picking an option
// fires the hidden <input type="file"> and hands the chosen File back via
// onPickImage; the parent validates + uploads.
//
//   [ + ]  →  rotates to ×, menu above:  🖼 Photo Library
function AttachMenu({ onPickImage, disabled = false }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const libraryRef = useRef(null)

  const close = useCallback(() => setOpen(false), [])

  // Dismiss on outside click or Esc.
  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) close()
    }
    const onKey = (e) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, close])

  const pick = (ref) => {
    close()
    ref.current?.click()
  }

  const handleChange = (e) => {
    const file = e.target.files?.[0]
    // Reset so picking the same file again still fires onChange.
    e.target.value = ''
    if (file) onPickImage(file)
  }

  return (
    <div className="attach" ref={rootRef}>
      {open && (
        <div className="attach-menu" role="menu">
          <button
            type="button"
            className="attach-menu-item"
            role="menuitem"
            onClick={() => pick(libraryRef)}
          >
            <ImageIcon size={18} />
            <span>Photo Library</span>
          </button>
        </div>
      )}

      <button
        type="button"
        className={`attach-btn ${open ? 'open' : ''}`}
        onClick={() => {
          const next = !open
          setOpen(next)
          if (next) {
            mixpanel.track('Attachment Menu Opened')
          }
        }}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Add photo"
        title="Add photo"
      >
        <Plus size={22} />
      </button>

      {/* Hidden input for the photo library picker. */}
      <input
        ref={libraryRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleChange}
        hidden
      />
    </div>
  )
}

export default AttachMenu
