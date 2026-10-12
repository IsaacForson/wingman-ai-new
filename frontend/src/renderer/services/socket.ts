/**
 * The one Socket.IO connection. Handlers are attached once (in useBackend),
 * so StrictMode double-mounts can't register duplicates.
 */
import { io, type Socket } from 'socket.io-client'
import type { ServerEvents } from '../types/generated'
import { getConnection } from './backend'

export interface Ack {
  ok: boolean
  error?: string
  [key: string]: unknown
}

let socket: Socket | null = null

export async function connectSocket(): Promise<Socket> {
  if (socket) return socket
  const { url, token } = await getConnection()
  socket = io(url, {
    transports: ['websocket'],
    auth: { token },
    reconnection: true,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5000,
  })
  return socket
}

export function disconnectSocket(): void {
  socket?.disconnect()
  socket = null
}

export function onEvent<E extends keyof ServerEvents>(event: E, handler: (data: ServerEvents[E]) => void): () => void {
  if (!socket) throw new Error('Socket not connected yet')
  socket.on(event as string, handler)
  return () => socket?.off(event as string, handler)
}

/** Emit with an acknowledgement. Rejects if the backend doesn't reply in time. */
export async function call(event: string, data: unknown = {}, timeoutMs = 15000): Promise<Ack> {
  const s = await connectSocket()
  if (!s.connected) return { ok: false, error: 'Not connected to the Wingman backend.' }
  try {
    return (await s.timeout(timeoutMs).emitWithAck(event, data)) as Ack
  } catch {
    return { ok: false, error: 'The backend took too long to respond.' }
  }
}

/** Fire-and-forget binary audio frame. */
export function sendAudio(channel: 'me' | 'them', pcm: ArrayBuffer): void {
  if (socket?.connected) socket.volatile.emit('audio', channel, pcm)
}
