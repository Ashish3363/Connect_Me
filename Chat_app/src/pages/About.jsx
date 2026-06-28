import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'motion/react'
import { MapPin, Clock, Radio, Sparkles, ChevronDown } from 'lucide-react'
import '../styles/about.css'

// ---- App overview ----
const OVERVIEW =
  'Connect Me is a location-based social app that helps you connect with people nearby in real time. Instead of chatting with your entire contact list or the whole internet, you can discover and talk to people who are around you. Simply enable your location to join a local chat room for your surrounding area. Whether you want to ask if a nearby café is crowded, find a lost item, organize a quick meetup, get local recommendations, or simply chat with your neighborhood, Connect Me makes it easy to connect with the people closest to you. Our conversations are designed to be local, relevant, and temporary. As you move to a new place, you\'ll join a new local community, ensuring every conversation stays connected to where you are right now.Connect Me is all about bringing real people together, building stronger local communities, and making everyday interactions more meaningful.'

// ---- What makes it unique ----
const HIGHLIGHTS = [
  {
    icon: Sparkles,
    title: 'Personal Chats — proximity-gated DMs',
    body: 'Our newest feature. Tap anyone you meet in a room to start a private 1-on-1 chat. The connection is permanent — cross paths weeks later in a different part of the city and you resume the same chat instantly. But you can only send and receive while you are both physically together inside the area. Step away and it pauses; come back and it picks up exactly where it left off.',
  },
  {
    icon: MapPin,
    title: 'Location-gated rooms',
    body: 'You only see and join the room for where you actually are. No global feeds, no strangers from across the world — just the people sharing your local moment.',
  },
  {
    icon: Clock,
    title: 'Ephemeral by design',
    body: 'Messages expire automatically (24 hours by default). The chat is about the here and now, not a permanent record to manage.',
  },
  {
    icon: Radio,
    title: 'Real-time & private',
    body: 'Live messaging with a privacy-first model: chats are tied to a place, not to your identity or a saved contact list.',
  },
]

// ---- FAQ ----
const FAQS = [
  {
    q: 'How does the app know who is nearby?',
    a: 'With your permission, the app uses your device location to place you in a local room covering roughly a 1 km radius. You can only see and chat with people who are currently in the same area.',
  },
  {
    q: 'Do I need to add friends or share my phone number?',
    a: 'No. You don’t need a phone number, contact list, or friend requests. Just open the app and start chatting with people nearby.',
  },
  {
    q: 'What happens to my messages?',
    a: 'All messages are temporary. They automatically disappear after the retention period (24 hours by default). Personal Chats remain available, but the messages inside them expire the same way.',
  },
  {
    q: 'Why can’t I send messages in a Personal Chat?',
    a: 'Personal Chats only work while both people are physically within the same local area. If either person leaves, messaging is paused and automatically resumes when you’re nearby again.',
  },
  {
    q: 'Can other users see my location?',
    a: 'No. Your exact location is never shared with anyone. It is used only to determine your local room and whether you’re close enough to participate in a Personal Chat.',
  },
]

function FaqItem({ q, a, index }) {
  const [open, setOpen] = useState(false)

  return (
    <div
      className="about-faq-item glass"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <button
        type="button"
        className="about-faq-q"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span>{q}</span>
        <motion.span
          className="about-faq-icon"
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.25 }}
        >
          <ChevronDown size={20} />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          >
            <p className="about-faq-a">{a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function About() {
  const navigate = useNavigate()

  return (
    <div className="about-stage" style={{ background: '#000' }}>
      <button
        type="button"
        className="about-back"
        onClick={() => navigate(-1)}
        aria-label="Go back"
      >
        ‹
      </button>

      <div className="about-wrap">
        {/* Header */}
        <header className="about-header">
          <h1>
            About our <span className="heading-highlight">app</span>.
          </h1>
          <p>Connect Me — talk to the people right around you.</p>
        </header>

        {/* Overview */}
        <section className="about-section">
          <h2 className="about-section-title">
            The big <span className="heading-highlight">idea</span>.
          </h2>
          <p className="about-overview glass">{OVERVIEW}</p>
        </section>

        {/* What makes it unique */}
        <section className="about-section">
          <h2 className="about-section-title">
            What makes it <span className="heading-highlight">unique</span>.
          </h2>
          <div className="about-grid">
            {HIGHLIGHTS.map(({ icon: Icon, title, body }, i) => (
              <div
                key={title}
                className="about-card glass"
                style={{ animationDelay: `${i * 70}ms` }}
              >
                <div className="about-card-head">
                  <span className="about-card-icon">
                    <Icon size={20} />
                  </span>
                  <h3 className="about-card-title">{title}</h3>
                </div>
                <p className="about-card-body">{body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section className="about-section">
          <h2 className="about-section-title">
            Frequently asked <span className="heading-highlight">questions</span>.
          </h2>
          <div className="about-faq">
            {FAQS.map((item, i) => (
              <FaqItem key={item.q} index={i} {...item} />
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

export default About
