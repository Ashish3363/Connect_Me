import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getNearbyRooms, startLocalRoom } from '../services/chat'
import { getPosition } from '../services/geo'
import { LOCALITY_IMAGES } from '../assets/locality'
import Footer from '../components/Footer'
import StartChatBox from '../components/StartChatBox'
import '../styles/rooms.css'

const HEADLINE = 'Connect to your locality'

const GEO_MESSAGES = {
  denied: 'Location permission is blocked. Enable it to see and start chats within 1 km of you.',
  unavailable: "We couldn't get your location. Check that location services are on.",
  timeout: 'Getting your location took too long. Try again.',
  unsupported: "This browser doesn't support location.",
}

function NearbyRooms() {
  const navigate = useNavigate()
  const [rooms, setRooms] = useState(null) // null = not loaded yet
  const [coords, setCoords] = useState(null)
  const [geoError, setGeoError] = useState(null)
  const [slide, setSlide] = useState(0)
  const [typed, setTyped] = useState('')
  const [vanishing, setVanishing] = useState(false)
  const [phase, setPhase] = useState('intro') // 'intro' | 'rooms'
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState('')

  // Ask for the user's location on mount.
  useEffect(() => {
    let alive = true
    getPosition()
      .then((c) => alive && setCoords(c))
      .catch((e) => alive && setGeoError(e.code))
    return () => {
      alive = false
    }
  }, [])

  // Fetch nearby rooms once we have coordinates.
  useEffect(() => {
    if (!coords) return
    let alive = true
    getNearbyRooms(coords)
      .then((data) => alive && setRooms(data))
      .catch(() => alive && setRooms([]))
    return () => {
      alive = false
    }
  }, [coords])

  // Dimmed slideshow.
  useEffect(() => {
    const id = setInterval(
      () => setSlide((s) => (s + 1) % LOCALITY_IMAGES.length),
      4500,
    )
    return () => clearInterval(id)
  }, [])

  // Typewriter -> hold -> fade/blur away -> reveal rooms.
  useEffect(() => {
    let cancelled = false
    const timers = []
    const push = (fn, ms) => timers.push(setTimeout(fn, ms))
    let i = 0
    const typeNext = () => {
      if (cancelled) return
      i += 1
      setTyped(HEADLINE.slice(0, i))
      if (i < HEADLINE.length) {
        push(typeNext, 70)
      } else {
        push(() => {
          if (cancelled) return
          setVanishing(true)
          push(() => !cancelled && setPhase('rooms'), 850)
        }, 1100)
      }
    }
    push(typeNext, 450)
    return () => {
      cancelled = true
      timers.forEach(clearTimeout)
    }
  }, [])

  function retryLocation() {
    setGeoError(null)
    setRooms(null)
    setCoords(null)
    getPosition()
      .then(setCoords)
      .catch((e) => setGeoError(e.code))
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
      ? 'Finding chats within 1 km…'
      : rooms.length
        ? `${rooms.length} active within 1 km`
        : 'No active chats within 1 km yet'

  return (
    <div className="locality-stage">
      <div className="locality-bg" aria-hidden="true">
        {LOCALITY_IMAGES.map((src, i) => (
          <div
            key={i}
            className={`locality-slide ${i === slide ? 'is-active' : ''}`}
            style={{ backgroundImage: `url(${src})` }}
          />
        ))}
        <div className="locality-dim" />
      </div>

      {phase === 'intro' && (
        <div className={`intro-headline ${vanishing ? 'is-vanishing' : ''}`}>
          <h1>
            {typed}
            <span className="type-caret" />
          </h1>
        </div>
      )}

      {phase === 'rooms' && (
        <>
          <div className="rooms-wrap">
            <header className="rooms-header">
              <h2>Chats near you</h2>
              <p>{subtitle}</p>
            </header>

            {geoError ? (
              <div className="rooms-empty glass">
                <span className="rooms-empty-icon">📍</span>
                <p>Location needed</p>
                <span>{GEO_MESSAGES[geoError] || GEO_MESSAGES.unavailable}</span>
                {geoError !== 'unsupported' && (
                  <button className="retry-btn" onClick={retryLocation}>
                    Enable location
                  </button>
                )}
              </div>
            ) : (
              <>
                <StartChatBox onStart={handleStart} busy={starting} disabled={!coords} />
                {startError && <p className="start-error">{startError}</p>}

                {rooms === null ? (
                  <div className="rooms-empty glass">
                    <span className="rooms-empty-icon">📡</span>
                    <p>Finding chats within 1&nbsp;km…</p>
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
                        <span className="room-card-top">
                          <span className="room-pin">📍 nearby</span>
                          <span className="room-dist">{room.distanceM} m</span>
                        </span>
                        <span className="room-card-name">{room.name}</span>
                        <span className="room-card-meta">
                          <span className="dot-live" />
                          {room.members} {room.members === 1 ? 'person' : 'people'} here
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="rooms-empty glass">
                    <span className="rooms-empty-icon">🛰️</span>
                    <p>No one's chatting around you right now.</p>
                    <span>Be the first — start a chat above.</span>
                  </div>
                )}
              </>
            )}
          </div>
          <Footer />
        </>
      )}
    </div>
  )
}

export default NearbyRooms
