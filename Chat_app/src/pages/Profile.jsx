import { useNavigate } from 'react-router-dom'
import Avatar from '../components/Avatar'
import Footer from '../components/Footer'
import '../styles/chat.css'

function Profile() {
  const navigate = useNavigate()
  // Mock identity until GET /users/me is wired in.
  const name = 'You'
  const email = 'you@example.com'

  function handleLogout() {
    localStorage.removeItem('token')
    localStorage.removeItem('user_id')
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
          <Avatar name={name} size={96} />
          <h2>{name}</h2>
          <p>{email}</p>
          <button className="logout-btn" onClick={handleLogout}>Log out</button>
        </div>
      </div>

      <Footer />
    </div>
  )
}

export default Profile
