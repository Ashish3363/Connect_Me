import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'motion/react'
import { Eye, EyeOff } from 'lucide-react'
import { login, signup } from '../api'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function InputGroup({ label, placeholder, type = 'text', children, ...props }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-white">{label}</label>
      <div className="relative">
        <input
          type={type}
          placeholder={placeholder}
          className="w-full bg-brand-gray border-none rounded-xl h-11 px-4 text-white placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-white/20 transition-all"
          {...props}
        />
        {children}
      </div>
    </div>
  )
}

export default function Login() {
  const navigate = useNavigate()
  const [mode, setMode] = useState('login')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const isRegister = mode === 'register'

  function switchMode() {
    setMode(isRegister ? 'login' : 'register')
    setFirstName('')
    setLastName('')
    setEmail('')
    setPassword('')
    setShowPassword(false)
    setError('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (isRegister && !firstName.trim()) {
      setError('Please enter your first name.')
      return
    }
    if (!EMAIL_RE.test(email)) {
      setError('Please enter a valid email address.')
      return
    }
    if (isRegister && password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (!isRegister && !password) {
      setError('Please enter your password.')
      return
    }

    setLoading(true)
    try {
      const displayName = `${firstName.trim()} ${lastName.trim()}`.trim()
      const data = isRegister
        ? await signup({ email, password, displayName })
        : await login({ email, password })

      if (data?.access_token) localStorage.setItem('token', data.access_token)
      if (data?.user?.id) localStorage.setItem('user_id', data.user.id)
      if (data?.user?.email) localStorage.setItem('email', data.user.email)
      localStorage.setItem('display_name', data?.user?.display_name || '')
      localStorage.setItem('avatar_v', data?.user?.avatar_updated_at || '')
      // replace: drop the login page from history so Back doesn't return to it.
      navigate('/splash', { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-black px-4 selection:bg-white/30">
      {/* Page entry animation — runs once on mount */}
      <motion.div
        className="w-full max-w-md"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        style={{ perspective: 1200 }}
      >
        {/* Flip container — re-mounts on mode change, triggering the flip */}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={mode}
            initial={{ rotateY: 90, opacity: 0 }}
            animate={{ rotateY: 0, opacity: 1 }}
            exit={{ rotateY: -90, opacity: 0 }}
            transition={{ duration: 0.35, ease: 'easeInOut' }}
            style={{ transformOrigin: 'center center', backfaceVisibility: 'hidden' }}
            className="space-y-8"
          >
            {/* Header */}
            <div>
              <h1 className="text-3xl font-medium tracking-tight text-white">
                {isRegister ? 'Create New Profile' : 'Welcome back'}
              </h1>
              <p className="text-white/40 text-sm mt-2">
                {isRegister
                  ? 'Input your basic details to begin the journey.'
                  : 'Sign in to continue.'}
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} noValidate className="space-y-4">
              {isRegister && (
                <div className="grid grid-cols-2 gap-4">
                  <InputGroup
                    label="First Name"
                    placeholder="Ashish"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                  />
                  <InputGroup
                    label="Last Name"
                    placeholder="Singh"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                  />
                </div>
              )}

              <InputGroup
                label="Email"
                placeholder="you@example.com"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />

              {/* Password with eye toggle */}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-white">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder={isRegister ? 'At least 8 characters' : '••••••••'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={isRegister ? 'new-password' : 'current-password'}
                    className="w-full bg-brand-gray border-none rounded-xl h-11 px-4 pr-12 text-white placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-white/20 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition-colors"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {isRegister && (
                  <p className="text-xs text-white/30">Requires at least 8 symbols.</p>
                )}
              </div>

              {error && <p className="text-red-400 text-sm">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="w-full h-14 bg-white text-black font-semibold rounded-xl hover:bg-white/90 active:scale-[0.98] mt-4 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading
                  ? 'Please wait…'
                  : isRegister
                    ? 'Create Account'
                    : 'Sign In'}
              </button>
            </form>

            {/* Footer link */}
            <p className="text-sm text-white/40 text-center">
              {isRegister ? (
                <>
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={switchMode}
                    className="text-white hover:underline underline-offset-2"
                  >
                    Log in
                  </button>
                </>
              ) : (
                <>
                  New here?{' '}
                  <button
                    type="button"
                    onClick={switchMode}
                    className="text-white hover:underline underline-offset-2"
                  >
                    Create account
                  </button>
                </>
              )}
            </p>
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </main>
  )
}
