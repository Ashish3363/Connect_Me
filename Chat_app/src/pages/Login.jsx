import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { login, signup } from '../api'
import '../auth.css'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function Login() {
  const navigate = useNavigate()
  const [mode, setMode] = useState('login') // 'login' | 'register'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const isRegister = mode === 'register'

  function switchMode() {
    setMode(isRegister ? 'login' : 'register')
    setError('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (!EMAIL_RE.test(email)) {
      setError('Please enter a valid email address.')
      return
    }
    // Signup requires >= 8 chars (backend rule); login just needs a value.
    if (isRegister && password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (!isRegister && password.length < 1) {
      setError('Please enter your password.')
      return
    }

    setLoading(true)
    try {
      const data = isRegister
        ? await signup({ email, password })
        : await login({ email, password })

      // Persist the JWT + our user id so the session survives a refresh and we
      // can tell our own messages from others'.
      if (data?.access_token) {
        localStorage.setItem('token', data.access_token)
      }
      if (data?.user?.id) {
        localStorage.setItem('user_id', data.user.id)
      }
      // Cache the signed-in identity so Profile can show it instantly (it's
      // re-confirmed from GET /users/me on that page).
      if (data?.user?.email) {
        localStorage.setItem('email', data.user.email)
      }
      if (data?.user?.display_name) {
        localStorage.setItem('display_name', data.user.display_name)
      }
      // Cache-buster for the avatar URL (footer/roster); '' when no photo yet.
      localStorage.setItem('avatar_v', data?.user?.avatar_updated_at || '')
      // Fresh login → play the "Connect to your locality" intro once. It's
      // suppressed on later visits to /rooms (e.g. coming back from a chat).
      sessionStorage.removeItem('localityIntroSeen')
      navigate('/rooms')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-stage">
      <form className="glass-card" onSubmit={handleSubmit} noValidate>
        <h1>{isRegister ? 'Create account' : 'Welcome back'}</h1>
        <p className="subtitle">
          {isRegister
            ? 'Sign up to start using ChatArena'
            : 'Sign in to continue to ChatArena'}
        </p>

        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </div>

        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            placeholder={isRegister ? 'At least 8 characters' : '••••••••'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={isRegister ? 'new-password' : 'current-password'}
          />
        </div>

        {error && <p className="error-text">{error}</p>}

        <button type="submit" className="glass-btn" disabled={loading}>
          {loading
            ? 'Please wait…'
            : isRegister
              ? 'Create account'
              : 'Sign in'}
        </button>

        <button
          type="button"
          className="glass-btn glass-btn--ghost"
          onClick={switchMode}
          disabled={loading}
        >
          {isRegister
            ? 'Already have an account? Sign in'
            : 'Create account'}
        </button>
      </form>
    </div>
  )
}

export default Login
