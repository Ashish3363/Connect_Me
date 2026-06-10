import { useNavigate } from 'react-router-dom'
import Footer from '../components/Footer'
import '../styles/chat.css'

function Settings() {
  const navigate = useNavigate()

  return (
    <div className="page-shell">
      <header className="page-head">
        <button className="back-rooms" onClick={() => navigate('/rooms')} aria-label="Back">‹</button>
        <h1>Settings</h1>
      </header>

      <div className="page-content">
        <section className="setting-card">
          <h2>Location</h2>
          <label className="setting-row">
            <span>Share my location</span>
            <input type="checkbox" defaultChecked />
          </label>
          <label className="setting-row">
            <span>Discovery radius</span>
            <select defaultValue="1000">
              <option value="500">500 m</option>
              <option value="1000">1 km</option>
              <option value="2000">2 km</option>
            </select>
          </label>
        </section>

        <section className="setting-card">
          <h2>Notifications</h2>
          <label className="setting-row">
            <span>New messages</span>
            <input type="checkbox" defaultChecked />
          </label>
          <label className="setting-row">
            <span>Someone joins my room</span>
            <input type="checkbox" />
          </label>
        </section>

        <p className="setting-note">
          These are placeholders — they'll be wired to the backend once the
          settings endpoints exist.
        </p>
      </div>

      <Footer />
    </div>
  )
}

export default Settings
