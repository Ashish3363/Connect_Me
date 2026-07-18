import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { Mail, Copy, Check } from 'lucide-react'
import mixpanel from '../mixpanel'
import '../styles/contact.css'

// lucide-react dropped its brand icons, so the GitHub / LinkedIn marks are
// inline SVGs. They take the same `size` prop and use currentColor, so they
// drop into <ContactCard icon={…} /> exactly like a lucide icon.
function Github({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .5C5.37.5 0 5.78 0 12.292c0 5.211 3.438 9.63 8.205 11.188.6.111.82-.254.82-.567 0-.28-.01-1.022-.015-2.005-3.338.711-4.042-1.582-4.042-1.582-.546-1.361-1.335-1.725-1.335-1.725-1.087-.731.084-.716.084-.716 1.205.082 1.838 1.215 1.838 1.215 1.07 1.803 2.809 1.282 3.495.981.108-.763.417-1.282.76-1.577-2.665-.295-5.466-1.309-5.466-5.827 0-1.287.465-2.339 1.235-3.164-.135-.297-.54-1.486.105-3.097 0 0 1.005-.31 3.3 1.209.96-.262 1.98-.392 3-.398 1.02.006 2.04.136 3 .398 2.28-1.519 3.285-1.209 3.285-1.209.645 1.611.24 2.8.12 3.097.765.825 1.23 1.877 1.23 3.164 0 4.53-2.805 5.527-5.475 5.817.42.354.81 1.077.81 2.182 0 1.578-.015 2.846-.015 3.229 0 .315.21.689.825.572C20.565 21.917 24 17.498 24 12.292 24 5.78 18.627.5 12 .5z" />
    </svg>
  )
}

function Linkedin({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.852 3.37-1.852 3.601 0 4.267 2.37 4.267 5.455v6.288zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.225 0z" />
    </svg>
  )
}

// ---- Edit your contact details here ----
const CONTACT = {
  email: 'ashishsingh3363@gmail.com',
  github: 'https://github.com/Ashish3363',
  linkedin: 'https://www.linkedin.com/in/ashish-kumar-772797231/',
}

function CopyButton({ value }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
      mixpanel.track('Support Link Clicked', { type: 'email_copy' })
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  return (
    <button
      type="button"
      className="contact-copy"
      onClick={handleCopy}
      aria-label={copied ? 'Copied' : 'Copy email'}
    >
      <motion.span
        key={copied ? 'check' : 'copy'}
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        style={{ display: 'inline-flex' }}
      >
        {copied ? (
          <Check size={16} style={{ color: '#38e0a0' }} />
        ) : (
          <Copy size={16} />
        )}
      </motion.span>
    </button>
  )
}

function ContactCard({ icon: Icon, label, value, href, external, delay, children }) {
  const handleClick = () => {
    mixpanel.track('Support Link Clicked', { type: label.toLowerCase() })
  }

  return (
    <div className="contact-card glass" style={{ animationDelay: `${delay}ms` }}>
      <div className="contact-card-head">
        <span className="contact-card-icon">
          <Icon size={20} />
        </span>
        <span className="contact-card-label">{label}</span>
      </div>
      <div className="contact-card-row">
        <a
          className="contact-card-value"
          href={href}
          onClick={handleClick}
          {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        >
          {value}
        </a>
        {children}
      </div>
    </div>
  )
}

function Contact() {
  const navigate = useNavigate()

  return (
    <div className="contact-stage" style={{ background: '#000' }}>
      <button
        type="button"
        className="contact-back"
        onClick={() => navigate(-1)}
        aria-label="Go back"
      >
        ‹
      </button>

      <div className="contact-wrap">
        <header className="contact-header">
          <h1>
            Get in <span className="heading-highlight">touch</span>.
          </h1>
          <p>Have a question or some feedback? Reach out anytime.</p>
        </header>

        <div className="contact-grid">
          <ContactCard
            icon={Mail}
            label="Email"
            value={CONTACT.email}
            href={`mailto:${CONTACT.email}`}
            delay={0}
          >
            <CopyButton value={CONTACT.email} />
          </ContactCard>

          <ContactCard
            icon={Github}
            label="GitHub"
            value={CONTACT.github.replace(/^https?:\/\//, '')}
            href={CONTACT.github}
            external
            delay={70}
          />

          <ContactCard
            icon={Linkedin}
            label="LinkedIn"
            value={CONTACT.linkedin.replace(/^https?:\/\//, '')}
            href={CONTACT.linkedin}
            external
            delay={140}
          />
        </div>
      </div>
    </div>
  )
}

export default Contact
