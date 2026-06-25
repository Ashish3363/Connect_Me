import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { getMe, avatarUrl, logout as logoutUser } from '../services/chat'


function Profile() {
  const navigate = useNavigate()
  // Seed from the values cached at login for an instant paint, then confirm
  // against GET /users/me (authoritative, and covers refreshed sessions).
  const [me, setMe] = useState(() => ({
    id: localStorage.getItem('user_id') || '',
    email: localStorage.getItem('email') || '',
    displayName: localStorage.getItem('display_name') || '',
    hasAvatar: false,
    avatarUpdatedAt: null,
  }))

  useEffect(() => {
    let alive = true
    getMe()
      .then((u) => {
        if (!alive) return
        setMe((prev) => ({ ...u, displayName: u.displayName || prev.displayName }))
        localStorage.setItem('email', u.email)
        localStorage.setItem('display_name', u.displayName || '')
        localStorage.setItem('avatar_v', u.avatarUpdatedAt || '')
      })
      .catch(() => {
        // Keep the cached values if the request fails (e.g. backend down).
      })
    return () => {
      alive = false
    }
  }, [])

  const name = me.displayName || 'You'
  const photo = me.hasAvatar && me.id ? avatarUrl(me.id, me.avatarUpdatedAt) : null
  const initials = name.slice(0, 2).toUpperCase()

  async function handleLogout() {
    await logoutUser() // clears server-side presence + the local session
    // replace: after logout, Forward shouldn't be able to re-enter the app.
    navigate('/', { replace: true })
  }

  return (
    <>
      <style>
        {`
          .profile-hover-scale {
            transition: transform 700ms ease-out, box-shadow 250ms ease;
          }

          .profile-hover-scale:hover {
            transform: scale(1.02);
            box-shadow: 0 18px 44px rgba(139, 123, 255, 0.4), var(--glass-inset);
          }

          .profile-image-scale {
            transition: transform 700ms ease-out;
          }

          .profile-image-container:hover .profile-image-scale {
            transform: scale(1.03);
          }

          .profile-hover-translate {
            transition: transform 500ms ease-out;
          }

          .profile-hover-translate:hover {
            transform: translateX(4px);
          }

          .profile-hover-scale-sm {
            transition: transform 500ms ease-out;
          }

          .profile-hover-scale-sm:hover {
            transform: scale(1.1);
          }
        `}
      </style>

      <div className="relative flex h-screen w-full items-center justify-center overflow-hidden bg-gradient-to-b from-gray-50 to-gray-100 px-4 dark:from-black dark:to-zinc-950" style={{ perspective: 1200 }}>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="absolute left-5 top-5 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/80 text-2xl leading-none text-gray-900 shadow-sm backdrop-blur transition hover:bg-white dark:bg-zinc-900/80 dark:text-zinc-100 dark:hover:bg-zinc-800"
          aria-label="Go back"
        >
          ‹
        </button>

        <button
          type="button"
          onClick={handleLogout}
          className="absolute right-5 top-5 z-10 rounded-lg bg-white/80 px-4 py-2 text-sm font-medium text-gray-700 shadow-sm backdrop-blur transition hover:bg-white hover:text-gray-950 dark:bg-zinc-900/80 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white"
        >
          Log out
        </button>

        <div className="w-full max-w-md">
          <motion.div
            className="profile-hover-scale mx-0 overflow-hidden rounded-3xl bg-white shadow-lg dark:bg-zinc-900 dark:shadow-2xl dark:shadow-black/80 sm:mx-4"
            initial={{ rotateY: -90, opacity: 0 }}
            animate={{ rotateY: 0, opacity: 1 }}
            transition={{ duration: 0.35, ease: 'easeInOut' }}
            style={{ transformOrigin: 'center center', backfaceVisibility: 'hidden' }}
          >
            <div className="profile-image-container relative overflow-hidden">
              {photo ? (
                <img
                  src={photo}
                  alt="Profile"
                  className="profile-image-scale aspect-square w-full object-cover"
                />
              ) : (
                <div className="profile-image-scale aspect-square w-full bg-linear-to-br from-zinc-800 to-zinc-950 flex items-center justify-center">
                  <span className="text-7xl font-light text-white/30 select-none">{initials}</span>
                </div>
              )}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/30 to-transparent dark:from-black/60" />
              <div className="absolute left-6 top-6">
                <h2 className="text-2xl font-medium text-white drop-shadow-lg">{name}</h2>
              </div>
            </div>

            <div className="flex justify-center p-4">
              <button
                type="button"
                onClick={() => navigate('/profile/edit')}
                className="shrink-0 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-all duration-500 ease-out hover:scale-105 hover:bg-gray-800 hover:shadow-md active:scale-95 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700 dark:hover:shadow-lg dark:hover:shadow-black/50"
              >
                Edit Profile
              </button>
            </div>
          </motion.div>
        </div>
      </div>
    </>
  )
}

export default Profile
