import { useEffect } from 'react'

// Hard-block the browser Back (and Forward) button on the page that calls this.
// We pin an extra history entry on mount and re-pin on every popstate, so a Back
// gesture is always absorbed — it never navigates away or leaves the app while
// this page is mounted. Leaving the page through normal in-app navigation
// (e.g. opening a room, which pushes a new route) unmounts the page and releases
// the block; coming back to it re-arms it.
//
// Used for "Find people near you" (/rooms), the post-login home: it's the end of
// the back-stack, so Back must do nothing — the only way out is Logout.
export function useBlockBack() {
  useEffect(() => {
    const pin = () => window.history.pushState(null, '', window.location.href)
    pin() // an entry to absorb the first Back press
    window.addEventListener('popstate', pin)
    return () => window.removeEventListener('popstate', pin)
  }, [])
}
