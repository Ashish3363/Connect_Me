import React, { useMemo } from 'react'
import { motion } from 'motion/react'

export interface RadarRoom {
  id: string
  name?: string
  geohash?: string
  distanceM?: number
  members?: number
}

export interface RadarRoomScannerProps {
  rooms: RadarRoom[]
  onSelectRoom: (roomId: string) => void
  maxDistanceM?: number
}

export const RADAR_CONFIG = {
  DEFAULT_MAX_DISTANCE_M: 1000,
  MIN_RADIUS_PERCENT: 20,
  MAX_RADIUS_PERCENT: 76,
  RADAR_SIZE_PX: 580,
} as const

interface CalculatedBlip {
  room: RadarRoom
  displayName: string
  x: number // percentage -50 to 50 relative to center
  y: number // percentage -50 to 50 relative to center
  angleDeg: number
  distanceNormalized: number
  distanceDisplay: string
  membersCount: number
}

function getRoomDisplayName(room: RadarRoom, index: number): string {
  if (!room.name || room.name.trim().toLowerCase() === 'local area') {
    return `Room ${index + 1}`
  }
  return room.name
}

/**
 * Deterministically generates an angle (0-360 deg) from room ID or geohash
 * to visually space out rooms evenly across the circular dish.
 */
function getAngleForRoom(room: RadarRoom, index: number, total: number): number {
  try {
    let hash = 0
    const str = room.geohash || room.id || `room-${index}`
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i)
      hash |= 0
    }
    const baseAngle = Math.abs(hash) % 360
    const spreadOffset = (index * (360 / Math.max(total, 1))) % 360
    return (baseAngle + spreadOffset) % 360
  } catch (err) {
    console.error('Error calculating room angle:', err)
    return (index * 60) % 360
  }
}

export const RadarRoomScanner: React.FC<RadarRoomScannerProps> = ({
  rooms,
  onSelectRoom,
  maxDistanceM = RADAR_CONFIG.DEFAULT_MAX_DISTANCE_M,
}) => {
  const blips: CalculatedBlip[] = useMemo(() => {
    try {
      if (!Array.isArray(rooms)) return []

      return rooms.map((room, idx) => {
        const rawDist = room.distanceM ?? 0
        const clampedDist = Math.max(0, Math.min(rawDist, maxDistanceM))
        
        const distRatio = clampedDist / maxDistanceM
        const radiusPct =
          RADAR_CONFIG.MIN_RADIUS_PERCENT +
          distRatio * (RADAR_CONFIG.MAX_RADIUS_PERCENT - RADAR_CONFIG.MIN_RADIUS_PERCENT)

        const angleDeg = getAngleForRoom(room, idx, rooms.length)
        const angleRad = (angleDeg * Math.PI) / 180

        const x = radiusPct * Math.cos(angleRad)
        const y = radiusPct * Math.sin(angleRad)

        const distanceDisplay = rawDist > 0 ? `${rawDist}m` : 'Nearby'
        const membersCount = room.members ?? 1
        const displayName = getRoomDisplayName(room, idx)

        return {
          room,
          displayName,
          x,
          y,
          angleDeg,
          distanceNormalized: distRatio,
          distanceDisplay,
          membersCount,
        }
      })
    } catch (err) {
      console.error('Failed to calculate room coordinates:', err)
      return []
    }
  }, [rooms, maxDistanceM])

  const handleRoomClick = (roomId: string) => {
    try {
      if (roomId) {
        onSelectRoom(roomId)
      }
    } catch (err) {
      console.error('Failed to navigate to room:', err)
    }
  }

  return (
    <div className="radar-wrapper">
      {/* Main Circular Dish Container */}
      <div className="radar-dish-container">
        <div className="radar-dish">
          {/* Concentric Distance Rings */}
          <div className="radar-ring ring-outer" />
          <div className="radar-ring ring-far" />
          <div className="radar-ring ring-mid" />
          <div className="radar-ring ring-near" />

          {/* Grid Axes */}
          <div className="radar-grid-axis axis-h" />
          <div className="radar-grid-axis axis-v" />

          {/* Smooth Conical Sweep Light */}
          <motion.div
            className="radar-sweep-beam"
            animate={{ rotate: 360 }}
            transition={{
              repeat: Infinity,
              duration: 6,
              ease: 'linear',
            }}
          />

          {/* Center Point - YOU */}
          <div className="radar-center-node" title="Your Location">
            <div className="center-node-core" />
            <span className="center-node-label">YOU</span>
          </div>

          {/* Circular Room Nodes */}
          {blips.map(({ room, displayName, x, y, distanceDisplay }, idx) => {
            return (
              <div
                key={room.id}
                className="radar-room-circle"
                style={{
                  left: `calc(50% + ${x}%)`,
                  top: `calc(50% + ${y}%)`,
                  animationDelay: `${(idx % 4) * 0.85}s`,
                }}
                onClick={() => handleRoomClick(room.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    handleRoomClick(room.id)
                  }
                }}
              >
                <span className="room-circle-title">{displayName}</span>
                <span className="room-circle-dist">{distanceDisplay}</span>
              </div>
            )
          })}
        </div>
      </div>

      <p className="radar-instruction">
        Click any room on the radar to join the conversation.
      </p>
    </div>
  )
}

export default RadarRoomScanner
