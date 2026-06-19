import { useState } from 'react'
import { motion } from 'motion/react'

export default function CinematicSwitch({ onSuccess, onError }) {
  const [isOn, setIsOn] = useState(false)
  const [busy, setBusy] = useState(false)

  function handleClick() {
    if (busy || isOn) return

    // Flip ON immediately so the animation renders before the geo call fires
    setIsOn(true)
    setBusy(true)

    // setTimeout(0) breaks React 18's batching — ensures the ON state
    // renders to screen before getCurrentPosition (which may error instantly
    // when the browser has already denied the permission).
    setTimeout(() => {
      if (!navigator.geolocation) {
        setIsOn(false)
        setBusy(false)
        onError?.({ code: 'unsupported' })
        return
      }

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setBusy(false)
          onSuccess?.({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        },
        (err) => {
          // Delay the revert so the green animation is visible for at least 500 ms
          // even when the browser denies permission instantly.
          setTimeout(() => {
            setBusy(false)
            setIsOn(false)
          }, 500)
          const map = { 1: 'denied', 2: 'unavailable', 3: 'timeout' }
          onError?.({ code: map[err.code] || 'unavailable' })
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
      )
    }, 0)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      className={`flex items-center gap-4 p-4 rounded-2xl bg-zinc-900/50 border border-zinc-800 backdrop-blur-sm shadow-xl ${busy ? 'cursor-wait' : 'cursor-pointer'}`}
    >
      <span className={`text-xs font-bold tracking-wider transition-colors duration-300 ${!isOn ? 'text-zinc-400' : 'text-zinc-700'}`}>
        OFF
      </span>

      <motion.div
        className="relative w-16 h-8 rounded-full shadow-inner"
        initial={false}
        animate={{ backgroundColor: isOn ? '#064e3b' : '#27272a' }}
        transition={{ duration: 0.3 }}
      >
        <motion.div
          className="absolute top-1 left-1 w-6 h-6 rounded-full border border-white/10 shadow-md"
          initial={false}
          animate={{
            x: isOn ? 32 : 0,
            backgroundColor: isOn ? '#34d399' : '#52525b',
          }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          whileTap={{ scale: 0.9 }}
        >
          <div className="absolute top-1 left-1.5 w-2 h-1 bg-white/30 rounded-full blur-[1px]" />
        </motion.div>
      </motion.div>

      <span className={`text-xs font-bold tracking-wider transition-colors duration-300 ${isOn ? 'text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]' : 'text-zinc-700'}`}>
        ON
      </span>
    </button>
  )
}
