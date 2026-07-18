import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import {
  getMe,
  avatarUrl,
  updateProfile,
  uploadAvatar,
  changePassword,
} from '../services/chat'
import mixpanel from '../mixpanel'

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
      const fieldsChanged = []

      if (trimmed !== (me?.displayName || '')) {
        updated = await updateProfile({ displayName: trimmed })
        fieldsChanged.push('displayName')
      }
      if (file) {
        updated = await uploadAvatar(file)
        mixpanel.track('Avatar Changed')
      }
      if (pwTouched) {
        await changePassword({ currentPassword, newPassword, confirmPassword })
        fieldsChanged.push('password')
      }

      if (fieldsChanged.length > 0) {
        mixpanel.track('Profile Updated', { fields_changed: fieldsChanged })
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
      navigate('/profile', { replace: true })
    } catch (err) {
      setError(err.message || 'Could not save your changes.')
    } finally {
      setSaving(false)
    }
  }

  const name = displayName.trim() || 'Your name'
  const previewSrc =
    previewUrl ||
    (me?.hasAvatar && me?.id ? avatarUrl(me.id, me.avatarUpdatedAt) : null)
  const initials = name.slice(0, 2).toUpperCase()

  return (
    <>
      <style>
        {`
          .profile-edit-card {
            transition: transform 700ms ease-out, box-shadow 250ms ease;
          }

          .profile-edit-card:hover {
            transform: scale(1.02);
            box-shadow: 0 18px 44px rgba(139, 123, 255, 0.4), var(--glass-inset);
          }
        `}
      </style>

      <div className="relative flex min-h-screen w-full items-center justify-center overflow-y-auto bg-gradient-to-b from-gray-50 to-gray-100 px-4 py-8 dark:from-black dark:to-zinc-950" style={{ perspective: 1200 }}>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="fixed left-5 top-5 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/80 text-2xl leading-none text-gray-900 shadow-sm backdrop-blur transition hover:bg-white dark:bg-zinc-900/80 dark:text-zinc-100 dark:hover:bg-zinc-800"
          aria-label="Back to profile"
        >
          ‹
        </button>

        <motion.form
          className="profile-edit-card w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-lg dark:bg-zinc-900 dark:shadow-2xl dark:shadow-black/80 sm:mx-4"
          onSubmit={handleSave}
          noValidate
          initial={{ rotateY: 90, opacity: 0 }}
          animate={{ rotateY: 0, opacity: 1 }}
          transition={{ duration: 0.35, ease: 'easeInOut' }}
          style={{ transformOrigin: 'center center', backfaceVisibility: 'hidden' }}
        >
          <div className="flex flex-col items-center gap-3 px-5 pb-4 pt-7">
            <div className="h-24 w-24 overflow-hidden rounded-full ring-2 ring-gray-200 dark:ring-zinc-700">
              {previewSrc ? (
                <img src={previewSrc} alt="Profile" className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full bg-linear-to-br from-zinc-800 to-zinc-950 flex items-center justify-center">
                  <span className="text-2xl font-light text-white/30 select-none">{initials}</span>
                </div>
              )}
            </div>
            <h2 className="text-xl font-medium text-gray-900 dark:text-zinc-100">{name}</h2>
            <div className="flex justify-center">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={onPickFile}
              hidden
            />
            <button
              type="button"
              className="rounded-lg bg-white/90 px-4 py-2 text-sm font-medium text-gray-900 shadow-sm backdrop-blur transition-all duration-500 ease-out hover:scale-105 hover:bg-white active:scale-95"
              onClick={() => fileInputRef.current?.click()}
            >
              {me?.hasAvatar || file ? 'Change photo' : 'Upload photo'}
            </button>
            </div>
          </div>

          <div className="space-y-4 p-5">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-zinc-200">
                Display name
              </span>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              minLength={3}
              maxLength={30}
              placeholder="Your name"
                className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 text-sm text-gray-900 outline-none transition focus:border-gray-400 focus:bg-gray-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:border-zinc-500 dark:focus:bg-zinc-700"
            />
              <span className="mt-1 block text-xs text-gray-500 dark:text-zinc-500">
                JPG, PNG, or WEBP photo up to 2 MB. Name should be 3-30 characters.
              </span>
          </label>

            <fieldset className="space-y-3 rounded-2xl border border-gray-200 p-4 dark:border-zinc-700">
              <legend className="px-1 text-sm font-medium text-gray-700 dark:text-zinc-200">
                Change password
              </legend>
              <p className="text-xs text-gray-500 dark:text-zinc-500">
                Leave blank to keep your current password.
              </p>
              <label className="block">
                <span className="mb-1.5 block text-sm text-gray-600 dark:text-zinc-300">
                  Current password
                </span>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="off"
                  className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 text-sm text-gray-900 outline-none transition focus:border-gray-400 focus:bg-gray-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:border-zinc-500 dark:focus:bg-zinc-700"
              />
            </label>
              <label className="block">
                <span className="mb-1.5 block text-sm text-gray-600 dark:text-zinc-300">
                  New password
                </span>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="off"
                  className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 text-sm text-gray-900 outline-none transition focus:border-gray-400 focus:bg-gray-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:border-zinc-500 dark:focus:bg-zinc-700"
              />
            </label>
              <label className="block">
                <span className="mb-1.5 block text-sm text-gray-600 dark:text-zinc-300">
                  Confirm new password
                </span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="off"
                  className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 text-sm text-gray-900 outline-none transition focus:border-gray-400 focus:bg-gray-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:border-zinc-500 dark:focus:bg-zinc-700"
              />
            </label>
          </fieldset>

            {error && <p className="text-sm text-red-500 dark:text-red-400">{error}</p>}
            {success && <p className="text-sm text-emerald-600 dark:text-emerald-400">{success}</p>}

            <div className="flex justify-center gap-3 pt-1">
            <button
              type="button"
                className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition-all duration-500 ease-out hover:scale-105 hover:bg-gray-200 active:scale-95 disabled:opacity-60 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
              onClick={() => navigate(-1)}
              disabled={saving}
            >
              Cancel
            </button>
              <button
                type="submit"
                className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-all duration-500 ease-out hover:scale-105 hover:bg-gray-800 hover:shadow-md active:scale-95 disabled:opacity-60 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700 dark:hover:shadow-lg dark:hover:shadow-black/50"
                disabled={saving}
              >
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
            </div>
          </div>
        </motion.form>
      </div>
    </>
  )
}

export default EditProfile
