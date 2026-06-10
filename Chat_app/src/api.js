// Thin client for the FastAPI auth backend.
// Requests go through the Vite dev proxy: /api/* -> http://localhost:8000/*

const BASE = '/api'

async function request(path, body) {
  let res
  try {
    res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    // Network / proxy failure — backend probably not running.
    throw new Error('Cannot reach the server. Is the backend running on port 8000?')
  }

  let data = null
  try {
    data = await res.json()
  } catch {
    // No / non-JSON body.
  }

  if (!res.ok) {
    throw new Error(extractError(data) || `Request failed (${res.status})`)
  }
  return data
}

// FastAPI returns errors as { detail: "..." } or, for validation,
// { detail: [{ msg, loc, ... }] }.
function extractError(data) {
  if (!data) return null
  const { detail } = data
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail) && detail.length) {
    return detail[0]?.msg || 'Invalid input.'
  }
  return null
}

export function login({ email, password }) {
  return request('/auth/login', { email, password })
}

export function signup({ email, password }) {
  return request('/auth/signup', { email, password })
}
