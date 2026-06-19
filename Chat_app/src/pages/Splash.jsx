import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import AnimatedTextCycle from '@/components/ui/animated-text-cycle'

// 3 words × 1500 ms = 4500 ms for one full cycle.
// Fade starts at 4100 ms (while Enjoy is still visible), navigate at 4700 ms.
const WORDS = ['Connect', 'Express', 'Enjoy']
const INTERVAL = 1500

export default function Splash() {
  const navigate = useNavigate()
  const [exiting, setExiting] = useState(false)

  useEffect(() => {
    import('./NearbyRooms.jsx')
    const t1 = setTimeout(() => setExiting(true), 4100)
    return () => clearTimeout(t1)
  }, [])

  return (
    // Outer wrapper stays fully opaque black — never fades, so the aurora body
    // can never bleed through during the exit transition.
    <main className="flex min-h-screen w-full items-center justify-center bg-black px-8">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: exiting ? 0 : 1, y: exiting ? -8 : 0 }}
        transition={{ duration: 0.5, ease: 'easeInOut' }}
        onAnimationComplete={() => { if (exiting) navigate('/rooms', { replace: true }) }}
      >
        <h1 className="text-4xl font-light text-white/40 sm:text-5xl">
          You need to&nbsp;
          <AnimatedTextCycle
            words={WORDS}
            interval={INTERVAL}
            className="text-white"
          />
          .
        </h1>
      </motion.div>
    </main>
  )
}
