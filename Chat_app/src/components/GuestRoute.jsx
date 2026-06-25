import { Navigate } from 'react-router-dom'

// The inverse of ProtectedRoute: the login screen is for logged-OUT users only.
// If a token is already stored, bounce into the app — so the browser Back button
// can never surface the login page to an authenticated user. The only way back
// to login is an explicit logout (which clears the token).
function GuestRoute({ children }) {
  const token = localStorage.getItem('token')
  if (token) return <Navigate to="/rooms" replace />
  return children
}

export default GuestRoute
