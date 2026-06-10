// Browser geolocation -> { lat, lng }. Rejects with a code we can branch on:
//  'unsupported' | 'denied' | 'unavailable' | 'timeout'
export function getPosition(options = {}) {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject({ code: 'unsupported' })
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => {
        const map = { 1: 'denied', 2: 'unavailable', 3: 'timeout' }
        reject({ code: map[err.code] || 'unavailable' })
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000, ...options },
    )
  })
}
