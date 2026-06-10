import { Navigate } from 'react-router-dom'

// Gate for authenticated routes. Without a stored token, bounce to login.
// (When the backend is wired, optionally validate the token via GET /users/me.)
function ProtectedRoute({ children }) {
  const token = localStorage.getItem('token')
  if (!token) return <Navigate to="/" replace />
  return children
}

export default ProtectedRoute
