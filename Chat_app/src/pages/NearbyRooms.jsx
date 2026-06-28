import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'motion/react'
import { getNearbyRooms, startLocalRoom, getUserCount, logout as logoutUser } from '../services/chat'
import { getPosition } from '../services/geo'
import StartChatBox from '../components/StartChatBox'
import CinematicSwitch from '../components/ui/cinematic-glow-toggle'
import { useBlockBack } from '../components/hooks/use-block-back'
import '../styles/rooms.css'

const GEO_MESSAGES = {
  denied: 'Location permission is blocked. Enable it to see and start chats within 1 km of you.',
  unavailable: "We couldn't get your location. Check that location services are on.",
  timeout: 'Getting your location took too long. Try again.',
  unsupported: "This browser doesn't support location.",
}

const MENU_ITEMS = [
  { label: 'Profile',    path: '/profile' },
  { label: 'Settings',   path: '/settings' },
  { label: 'About our app', path: '/about' },
  { label: 'Contact Us', path: '/contact' },
]

async function logout(navigate) {
  await logoutUser() // clears server-side presence + the local session
  navigate('/', { replace: true })
}

function HamburgerMenu() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  return (
    <div
      className="fixed top-5 left-5 z-50"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      {/* Hamburger icon */}
      <div className="flex cursor-pointer flex-col gap-1.25 p-2">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            animate={{ width: open ? (i === 1 ? '14px' : '20px') : '20px' }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="block h-0.5 rounded-full bg-white origin-left"
            style={{ width: 20 }}
          />
        ))}
      </div>

      {/* Dropdown */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scaleY: 0.85, y: -6 }}
            animate={{ opacity: 1, scaleY: 1,    y: 0  }}
            exit={{    opacity: 0, scaleY: 0.85,  y: -6 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            style={{ transformOrigin: 'top left' }}
            className="absolute left-0 top-full mt-1 min-w-42 overflow-hidden rounded-xl border border-white/10 bg-black/90 backdrop-blur-md"
          >
            {MENU_ITEMS.map(({ label, path }, i) => (
              <motion.button
                key={label}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.055, duration: 0.2, ease: 'easeOut' }}
                onClick={() => path && navigate(path)}
                disabled={!path}
                className={`block w-full px-5 py-3 text-left text-sm transition-colors ${path ? 'text-white/80 hover:bg-white/10 hover:text-white cursor-pointer' : 'text-white/30 cursor-not-allowed'}`}
              >
                {label}
              </motion.button>
            ))}

            {/* Divider */}
            <div className="mx-3 border-t border-white/10" />

            {/* Logout */}
            <motion.button
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: MENU_ITEMS.length * 0.055, duration: 0.2, ease: 'easeOut' }}
              onClick={() => logout(navigate)}
              className="block w-full px-5 py-3 text-left text-sm text-red-400/80 transition-colors hover:bg-red-500/10 hover:text-red-400"
            >
              Log Out
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function NearbyRooms() {
  const navigate = useNavigate()
  // This is the post-login home and the end of the back-stack: hard-block Back so
  // it never loops into a chat room or leaves the app. Only Logout gets you out.
  useBlockBack()
  const [rooms, setRooms] = useState(null)
  const [coords, setCoords] = useState(null)
  const [geoError, setGeoError] = useState(null)
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState('')
  const [userCount, setUserCount] = useState(null)

  useEffect(() => {
    let alive = true
    getUserCount()
      .then((n) => alive && setUserCount(n))
      .catch(() => {})
    return () => { alive = false }
  }, [])

  useEffect(() => {
    let alive = true
    getPosition()
      .then((c) => alive && setCoords(c))
      .catch((e) => alive && setGeoError(e.code))
    return () => { alive = false }
  }, [])

  useEffect(() => {
    if (!coords) return
    let alive = true
    getNearbyRooms(coords)
      .then((data) => alive && setRooms(data))
      .catch(() => alive && setRooms([]))
    return () => { alive = false }
  }, [coords])

  function handleLocationSuccess(c) {
    setGeoError(null)
    setCoords(c)
  }

  function handleLocationError(e) {
    setGeoError(e.code)
  }

  async function handleStart(text) {
    if (!coords) return
    setStarting(true)
    setStartError('')
    try {
      const room = await startLocalRoom({ lat: coords.lat, lng: coords.lng, message: text })
      navigate(`/rooms/${room.id}`)
    } catch (e) {
      setStartError(e.message || 'Could not start the chat.')
      setStarting(false)
    }
  }

  const subtitle = geoError
    ? 'Location needed'
    : rooms === null
      ? 'Finding peoples within 1 km…'
      : rooms.length
        ? `${rooms.length} active within 1 km`
        : 'No active chats within 1 km yet'

  return (
    <div className="locality-stage" style={{ background: '#000' }}>
      <HamburgerMenu />

      <div className="rooms-wrap">
        <header className="rooms-header">
          <h2>Find people near <span className="heading-highlight">YOU</span>.</h2>
          <p>{subtitle}</p>
        </header>

        {geoError ? (
          <div className="flex flex-col items-center justify-center gap-6 mt-24">
            <p className="text-white/40 font-light text-lg">
              {GEO_MESSAGES[geoError] || 'Enable location to find chats near you.'}
            </p>
            <CinematicSwitch onSuccess={handleLocationSuccess} onError={handleLocationError} />
          </div>
        ) : rooms === null ? (
          <div className="rooms-empty glass">
            <span className="rooms-empty-icon">📡</span>
            <p>Finding peoples within 1&nbsp;km…</p>
          </div>
        ) : rooms.length ? (
          <div className="rooms-grid">
            {rooms.map((room, i) => (
              <button
                key={room.id}
                className="room-card glass"
                style={{ animationDelay: `${i * 70}ms` }}
                onClick={() => navigate(`/rooms/${room.id}`)}
              >
                <span className="room-card-name"><span className="heading-highlight">Click Me</span> to Enter the chat.</span>
              </button>
            ))}
          </div>
        ) : (
          <>
            <StartChatBox onStart={handleStart} busy={starting} disabled={!coords} />
            {startError && <p className="start-error">{startError}</p>}
            <div className="rooms-empty glass">
              <span className="rooms-empty-icon">🛰️</span>
              <p>No one&apos;s chatting around you right now.</p>
              <span>Be the first — start a chat above.</span>
            </div>
          </>
        )}
      </div>

      <div className="room-card users-stat-card">
        <span className="room-card-name">
          Users: <span className="heading-highlight">
            {userCount !== null ? userCount.toLocaleString() : '…'}
          </span>
        </span>
      </div>
    </div>
  )
}

export default NearbyRooms
