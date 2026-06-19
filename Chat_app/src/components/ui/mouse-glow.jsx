import { useMousePosition } from "../hooks/use-mouse-position"

const SIZE = 16

export function MouseGlow() {
  const { x, y } = useMousePosition()

  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 50,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          width: SIZE,
          height: SIZE,
          borderRadius: "50%",
          background: "#3b82f6",
          boxShadow: "0 0 8px 2px rgba(59, 130, 246, 0.6)",
          transform: `translate(${x - SIZE / 2}px, ${y - SIZE / 2}px)`,
          transition: "transform 0.08s ease-out",
          willChange: "transform",
          left: 0,
          top: 0,
        }}
      />
    </div>
  )
}
