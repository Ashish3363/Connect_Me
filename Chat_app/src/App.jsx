import { lazy, Suspense, useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import GuestRoute from './components/GuestRoute'
import { MouseGlow } from './components/ui/mouse-glow'
import analytics from './analytics'

// Login ships in the main bundle (first paint); everything behind auth is
// code-split so the initial download stays small.
import Login from './pages/Login.jsx'

const Splash = lazy(() => import('./pages/Splash.jsx'))
const NearbyRooms = lazy(() => import('./pages/NearbyRooms.jsx'))
const ChatRoom = lazy(() => import('./pages/ChatRoom.jsx'))
const Settings = lazy(() => import('./pages/Settings.jsx'))
const Profile = lazy(() => import('./pages/Profile.jsx'))
const EditProfile = lazy(() => import('./pages/EditProfile.jsx'))
const Contact = lazy(() => import('./pages/Contact.jsx'))
const About = lazy(() => import('./pages/About.jsx'))

function App() {
  const location = useLocation()

  useEffect(() => {
    analytics.trackPageView({
      path: location.pathname,
      search: location.search,
    })
  }, [location])

  useEffect(() => {
    analytics.trackAppOpened()
    analytics.trackSessionStarted()

    const handleVisibilityChange = () => {
      if (document.hidden) {
        analytics.trackUserBecameInactive()
      } else {
        analytics.trackUserBecameActive()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  return (
    <>
      <MouseGlow />
      <Suspense fallback={<div className="route-fallback">Loading…</div>}>
        <Routes>
          <Route
            path="/"
            element={
              <GuestRoute>
                <Login />
              </GuestRoute>
            }
          />
          <Route
            path="/splash"
            element={
              <ProtectedRoute>
                <Splash />
              </ProtectedRoute>
            }
          />
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
          <Route
            path="/profile/edit"
            element={
              <ProtectedRoute>
                <EditProfile />
              </ProtectedRoute>
            }
          />
          <Route path="/contact" element={<Contact />} />
          <Route path="/about" element={<About />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </>
  )
}

export default App
