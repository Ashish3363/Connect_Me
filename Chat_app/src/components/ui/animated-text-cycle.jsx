import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'motion/react'

export default function AnimatedTextCycle({
  words,
  interval = 5000,
  className = '',
}) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [width, setWidth] = useState('auto')
  const measureRef = useRef(null)

  useEffect(() => {
    if (measureRef.current) {
      const elements = measureRef.current.children
      if (elements.length > currentIndex) {
        const newWidth = elements[currentIndex].getBoundingClientRect().width
        setWidth(`${newWidth}px`)
      }
    }
  }, [currentIndex])

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % words.length)
    }, interval)
    return () => clearInterval(timer)
  }, [interval, words.length])

  const containerVariants = {
    hidden: { y: -14, opacity: 0, filter: 'blur(5px)' },
    visible: {
      y: 0,
      opacity: 1,
      filter: 'blur(0px)',
      transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] },
    },
    exit: {
      y: 14,
      opacity: 0,
      filter: 'blur(5px)',
      transition: { duration: 0.25, ease: 'easeIn' },
    },
  }

  return (
    <>
      {/* Hidden measurement div */}
      <div
        ref={measureRef}
        aria-hidden="true"
        className="absolute opacity-0 pointer-events-none"
        style={{ visibility: 'hidden' }}
      >
        {words.map((word, i) => (
          <span key={i} className={`font-bold ${className}`}>
            {word}
          </span>
        ))}
      </div>

      {/* Animated word */}
      <motion.span
        className="relative inline-block"
        animate={{
          width,
          transition: { type: 'spring', stiffness: 200, damping: 22, mass: 0.8 },
        }}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={currentIndex}
            className={`inline-block font-bold ${className}`}
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            style={{ whiteSpace: 'nowrap' }}
          >
            {words[currentIndex]}
          </motion.span>
        </AnimatePresence>
      </motion.span>
    </>
  )
}
