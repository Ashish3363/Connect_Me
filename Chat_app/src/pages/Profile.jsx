import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Avatar from '../components/Avatar'
import Footer from '../components/Footer'
import { getMe, avatarUrl } from '../services/chat'
import '../styles/chat.css'

function Profile() {
  const navigate = useNavigate()
  // Seed from the values cached at login for an instant paint, then confirm
  // against GET /users/me (authoritative, and covers refreshed sessions).
  const [me, setMe] = useState(() => ({
    id: localStorage.getItem('user_id') || '',
    email: localStorage.getItem('email') || '',
    displayName: localStorage.getItem('display_name') || '',
    hasAvatar: false,
    avatarUpdatedAt: null,
  }))

  useEffect(() => {
    let alive = true
    getMe()
      .then((u) => {
        if (!alive) return
        setMe(u)
        localStorage.setItem('email', u.email)
        if (u.displayName) localStorage.setItem('display_name', u.displayName)
        localStorage.setItem('avatar_v', u.avatarUpdatedAt || '')
      })
      .catch(() => {
        // Keep the cached values if the request fails (e.g. backend down).
      })
    return () => {
      alive = false
    }
  }, [])

  // Display name falls back to the email's local part, then a neutral label.
  const name = me.displayName || (me.email ? me.email.split('@')[0] : 'You')
  const photo = me.hasAvatar && me.id ? avatarUrl(me.id, me.avatarUpdatedAt) : undefined

  function handleLogout() {
    localStorage.removeItem('token')
    localStorage.removeItem('user_id')
    localStorage.removeItem('email')
    localStorage.removeItem('display_name')
    localStorage.removeItem('avatar_v')
    navigate('/')
  }

  return (
    <div className="page-shell">
      <header className="page-head">
        <button className="back-rooms" onClick={() => navigate('/rooms')} aria-label="Back">‹</button>
        <h1>Profile</h1>
      </header>

      <div className="page-content">
        <div className="profile-card">
          <Avatar name={name} size={96} src={photo} />
          <h2>{name}</h2>
          <p>{me.email || '—'}</p>
          <div className="profile-actions">
            <button className="primary-btn" onClick={() => navigate('/profile/edit')}>
              Edit Profile
            </button>
            <button className="logout-btn" onClick={handleLogout}>Log out</button>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  )
}

export default Profile
