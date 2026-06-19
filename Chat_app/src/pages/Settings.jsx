import { useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'

function Settings() {
  const navigate = useNavigate()

  return (
    <>
      <style>
        {`
          .settings-card {
            transition: transform 700ms ease-out, box-shadow 250ms ease;
          }

          .settings-card:hover {
            transform: scale(1.02);
            box-shadow: 0 18px 44px rgba(139, 123, 255, 0.4), var(--glass-inset);
          }
        `}
      </style>

      <div className="relative flex min-h-screen w-full items-center justify-center overflow-y-auto bg-gradient-to-b from-gray-50 to-gray-100 px-4 py-8 dark:from-black dark:to-zinc-950" style={{ perspective: 1200 }}>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="fixed left-5 top-5 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/80 text-2xl leading-none text-gray-900 shadow-sm backdrop-blur transition hover:bg-white dark:bg-zinc-900/80 dark:text-zinc-100 dark:hover:bg-zinc-800"
          aria-label="Go back"
        >
          ‹
        </button>

        <motion.main
          className="settings-card w-full max-w-md overflow-hidden rounded-3xl bg-white p-5 shadow-lg dark:bg-zinc-900 dark:shadow-2xl dark:shadow-black/80 sm:mx-4"
          initial={{ rotateY: 90, opacity: 0 }}
          animate={{ rotateY: 0, opacity: 1 }}
          transition={{ duration: 0.35, ease: 'easeInOut' }}
          style={{ transformOrigin: 'center center', backfaceVisibility: 'hidden' }}
        >
          <div className="mb-5 text-center">
            <h1 className="text-2xl font-medium text-gray-900 dark:text-zinc-100">Settings</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-zinc-500">
              Manage your chat preferences
            </p>
          </div>

          <section className="space-y-3 rounded-2xl border border-gray-200 p-4 dark:border-zinc-700">
            <h2 className="text-sm font-medium text-gray-700 dark:text-zinc-200">Location</h2>
            <label className="flex items-center justify-between gap-4">
              <span className="text-sm text-gray-600 dark:text-zinc-300">Share my location</span>
              <input type="checkbox" defaultChecked className="h-4 w-4 accent-gray-900 dark:accent-zinc-100" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm text-gray-600 dark:text-zinc-300">
                Discovery radius
              </span>
              <select
                defaultValue="1000"
                className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 text-sm text-gray-900 outline-none transition focus:border-gray-400 focus:bg-gray-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:border-zinc-500 dark:focus:bg-zinc-700"
              >
                <option value="500">500 m</option>
                <option value="1000">1 km</option>
                <option value="2000">2 km</option>
              </select>
            </label>
          </section>

          <section className="mt-4 space-y-3 rounded-2xl border border-gray-200 p-4 dark:border-zinc-700">
            <h2 className="text-sm font-medium text-gray-700 dark:text-zinc-200">Notifications</h2>
            <label className="flex items-center justify-between gap-4">
              <span className="text-sm text-gray-600 dark:text-zinc-300">New messages</span>
              <input type="checkbox" defaultChecked className="h-4 w-4 accent-gray-900 dark:accent-zinc-100" />
            </label>
            <label className="flex items-center justify-between gap-4">
              <span className="text-sm text-gray-600 dark:text-zinc-300">Someone joins my room</span>
              <input type="checkbox" className="h-4 w-4 accent-gray-900 dark:accent-zinc-100" />
            </label>
          </section>

          <p className="mt-4 text-center text-xs text-gray-500 dark:text-zinc-500">
            These are placeholders. They will be wired to the backend once the settings endpoints exist.
          </p>
        </motion.main>
      </div>
    </>
  )
}

export default Settings
