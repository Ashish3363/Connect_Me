import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'

// Login ships in the main bundle (first paint); everything behind auth is
// code-split so the initial download stays small.
import Login from './pages/Login.jsx'

const NearbyRooms = lazy(() => import('./pages/NearbyRooms.jsx'))
const ChatRoom = lazy(() => import('./pages/ChatRoom.jsx'))
const Settings = lazy(() => import('./pages/Settings.jsx'))
const Profile = lazy(() => import('./pages/Profile.jsx'))

function App() {
  return (
    <Suspense fallback={<div className="route-fallback">Loading…</div>}>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route
          path="/rooms"
          element={
            <ProtectedRoute>
              <NearbyRooms />
            </ProtectedRoute>
          }
        />
        <Route
          path="/rooms/:roomId"
          element={
            <ProtectedRoute>
              <ChatRoom />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <Settings />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}

export default App
