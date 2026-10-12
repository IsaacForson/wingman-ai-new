/**
 * Connection details + authenticated fetch for the local backend.
 * The token comes from the Electron main process; without Electron (plain
 * `vite` in a browser) set VITE_WINGMAN_TOKEN to the contents of ~/.wingman/auth_token.
 */

export interface Connection {
  url: string
  token: string
}

let connectionPromise: Promise<Connection> | null = null

export function getConnection(): Promise<Connection> {
  if (!connectionPromise) {
    connectionPromise = window.wingman
      ? window.wingman.backend.connection()
      : Promise.resolve({
          url: import.meta.env.VITE_WINGMAN_URL || 'http://127.0.0.1:8765',
          token: import.meta.env.VITE_WINGMAN_TOKEN || '',
        })
    connectionPromise.catch(() => (connectionPromise = null))
  }
  return connectionPromise
}

export function resetConnection(): void {
  connectionPromise = null
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

async function errorMessage(res: Response): Promise<string> {
  try {
    const body = await res.json()
    if (typeof body.detail === 'string') return body.detail
    if (Array.isArray(body.detail)) return body.detail.map((d: { msg: string }) => d.msg).join('; ')
  } catch {
    /* not JSON */
  }
  return `Request failed (HTTP ${res.status})`
}

export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { url, token } = await getConnection()
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${token}`)
  let body = init.body
  if (init.json !== undefined) {
    headers.set('Content-Type', 'application/json')
    body = JSON.stringify(init.json)
  }
  const res = await fetch(`${url}${path}`, { ...init, headers, body })
  if (!res.ok) throw new ApiError(await errorMessage(res), res.status)
  const type = res.headers.get('content-type') || ''
  return (type.includes('application/json') ? res.json() : res.text()) as Promise<T>
}
