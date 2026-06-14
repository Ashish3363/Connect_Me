import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Avatar from '../components/Avatar'
import Footer from '../components/Footer'
import {
  getMe,
  avatarUrl,
  updateProfile,
  uploadAvatar,
  changePassword,
} from '../services/chat'
import '../styles/chat.css'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_BYTES = 2 * 1024 * 1024

function EditProfile() {
  const navigate = useNavigate()
  const [me, setMe] = useState(null)
  const [displayName, setDisplayName] = useState('')
  const [file, setFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const fileInputRef = useRef(null)

  // Load the current profile to pre-fill the name and show the current photo.
  useEffect(() => {
    let alive = true
    getMe()
      .then((u) => {
        if (!alive) return
        setMe(u)
        setDisplayName(u.displayName || '')
      })
      .catch(() => alive && setError('Could not load your profile.'))
    return () => {
      alive = false
    }
  }, [])

  // Revoke the object URL when it changes or on unmount (no memory leak).
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  function onPickFile(e) {
    const f = e.target.files?.[0]
    e.target.value = '' // let the user re-pick the same file later
    if (!f) return
    if (!ALLOWED_TYPES.includes(f.type)) {
      setError('Photo must be a JPG, PNG, or WEBP image.')
      return
    }
    if (f.size > MAX_BYTES) {
      setError('Photo must be 2 MB or smaller.')
      return
    }
    setError('')
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setFile(f)
    setPreviewUrl(URL.createObjectURL(f))
  }

  async function handleSave(e) {
    e.preventDefault()
    setError('')
    setSuccess('')

    const trimmed = displayName.trim()
    if (trimmed.length < 3 || trimmed.length > 30) {
      setError('Display name must be 3–30 characters.')
      return
    }

    // Password is optional; only validated/changed if any field is filled.
    const pwTouched = currentPassword || newPassword || confirmPassword
    if (pwTouched) {
      if (!currentPassword) {
        setError('Enter your current password to change it.')
        return
      }
      if (newPassword.length < 8) {
        setError('New password must be at least 8 characters.')
        return
      }
      if (newPassword !== confirmPassword) {
        setError('New password and confirmation do not match.')
        return
      }
    }

    setSaving(true)
    try {
      let updated = null
      if (trimmed !== (me?.displayName || '')) {
        updated = await updateProfile({ displayName: trimmed })
      }
      if (file) {
        updated = await uploadAvatar(file)
      }
      if (pwTouched) {
        await changePassword({ currentPassword, newPassword, confirmPassword })
      }

      const fresh = updated || (await getMe())
      setMe(fresh)
      setDisplayName(fresh.displayName || trimmed)
      localStorage.setItem('display_name', fresh.displayName || trimmed)
      // Refresh the avatar cache-buster so the footer/roster pick up a new photo.
      localStorage.setItem('avatar_v', fresh.avatarUpdatedAt || '')

      // Clear sensitive fields + the staged photo.
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setFile(null)
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl)
        setPreviewUrl(null)
      }
      setSuccess('Your profile has been updated.')
    } catch (err) {
      setError(err.message || 'Could not save your changes.')
    } finally {
      setSaving(false)
    }
  }

  const name = displayName.trim() || me?.email?.split('@')[0] || 'You'
  const previewSrc =
    previewUrl ||
    (me?.hasAvatar && me?.id ? avatarUrl(me.id, me.avatarUpdatedAt) : undefined)

  return (
    <div className="page-shell">
      <header className="page-head">
        <button className="back-rooms" onClick={() => navigate('/profile')} aria-label="Back">‹</button>
        <h1>Edit Profile</h1>
      </header>

      <div className="page-content">
        <form className="edit-card" onSubmit={handleSave} noValidate>
          {/* Photo + preview */}
          <div className="edit-photo">
            <Avatar name={name} size={96} src={previewSrc} />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={onPickFile}
              hidden
            />
            <button
              type="button"
              className="ghost-btn"
              onClick={() => fileInputRef.current?.click()}
            >
              {me?.hasAvatar || file ? 'Change photo' : 'Upload photo'}
            </button>
            <span className="field-hint">JPG, PNG, or WEBP · up to 2 MB</span>
          </div>

          {/* Display name */}
          <label className="field">
            <span className="field-label">Display name</span>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              minLength={3}
              maxLength={30}
              placeholder="Your name"
            />
            <span className="field-hint">3–30 characters</span>
          </label>

          {/* Password (optional) */}
          <fieldset className="field-group">
            <legend>Change password</legend>
            <span className="field-hint">Leave blank to keep your current password.</span>
            <label className="field">
              <span className="field-label">Current password</span>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
              />
            </label>
            <label className="field">
              <span className="field-label">New password</span>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
              />
            </label>
            <label className="field">
              <span className="field-label">Confirm new password</span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
              />
            </label>
          </fieldset>

          {error && <p className="form-error">{error}</p>}
          {success && <p className="form-success">{success}</p>}

          <div className="edit-actions">
            <button
              type="button"
              className="ghost-btn"
              onClick={() => navigate('/profile')}
              disabled={saving}
            >
              Cancel
            </button>
            <button type="submit" className="primary-btn" disabled={saving}>
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>

      <Footer />
    </div>
  )
}

export default EditProfile
