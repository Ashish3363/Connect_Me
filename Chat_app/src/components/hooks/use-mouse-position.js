import { useEffect, useRef, useState } from "react"

export function useMousePosition(containerRef) {
  const [position, setPosition] = useState({ x: 0, y: 0 })

  useEffect(() => {
    const updatePosition = (x, y) => {
      if (containerRef?.current) {
        const rect = containerRef.current.getBoundingClientRect()
        setPosition({ x: x - rect.left, y: y - rect.top })
      } else {
        setPosition({ x, y })
      }
    }

    const handleMouseMove = (ev) => updatePosition(ev.clientX, ev.clientY)
    const handleTouchMove = (ev) => {
      const touch = ev.touches[0]
      updatePosition(touch.clientX, touch.clientY)
    }

    window.addEventListener("mousemove", handleMouseMove)
    window.addEventListener("touchmove", handleTouchMove, { passive: true })

    return () => {
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("touchmove", handleTouchMove)
    }
  }, [containerRef])

  return position
}
