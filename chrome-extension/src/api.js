// Talks to the Wingman desktop app. The pairing key (from Wingman → Settings →
// Browser extension) only allows the /api/extension endpoints.
export const BACKEND = 'http://127.0.0.1:8765'

export async function getKey() {
  const { pairingKey } = await chrome.storage.local.get('pairingKey')
  return pairingKey || ''
}

export async function explain({ text, instruction, pageTitle }) {
  const key = await getKey()
  if (!key) throw new Error('Not paired yet. Open the extension options and paste the pairing key from Wingman.')
  let res
  try {
    res = await fetch(`${BACKEND}/api/extension/explain`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ text: text.slice(0, 20000), instruction, page_title: pageTitle }),
    })
  } catch {
    throw new Error("Can't reach Wingman. Make sure the desktop app is running.")
  }
  if (res.status === 401) throw new Error('The pairing key is no longer valid. Copy a new one from Wingman → Settings → Browser extension.')
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.detail || `Wingman returned an error (HTTP ${res.status}).`)
  return body
}

export async function checkConnection(key) {
  try {
    const health = await fetch(`${BACKEND}/health`)
    if (!health.ok) return 'Wingman is not running.'
  } catch {
    return 'Wingman is not running.'
  }
  const res = await fetch(`${BACKEND}/api/extension/ping`, { headers: { Authorization: `Bearer ${key}` } }).catch(() => null)
  if (!res) return 'Wingman is not running.'
  if (res.status === 401) return 'That pairing key was not accepted.'
  return null
}
