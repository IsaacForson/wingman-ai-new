/**
 * Provider API keys, encrypted at rest with the OS keychain (Electron safeStorage).
 * The renderer never sees a key after it is saved - only whether one is set.
 */
import { app, safeStorage } from 'electron'
import fs from 'fs'
import path from 'path'
import type { BackendConnection } from './backend'

export interface KeyStatus {
  configured: boolean
  hint: string | null // last 4 characters, to tell keys apart
}

export class SecretVault {
  private keys: Record<string, string> = {}
  private readonly file = path.join(app.getPath('userData'), 'provider-keys.bin')

  constructor() {
    this.load()
  }

  get encrypted(): boolean {
    return safeStorage.isEncryptionAvailable()
  }

  private load(): void {
    try {
      if (!fs.existsSync(this.file) || !this.encrypted) return
      this.keys = JSON.parse(safeStorage.decryptString(fs.readFileSync(this.file)))
    } catch (err) {
      console.error('[secrets] could not read stored keys:', err)
      this.keys = {}
    }
  }

  private save(): void {
    // Without OS encryption (some Linux setups) keys stay in memory for this session only.
    if (!this.encrypted) return
    fs.mkdirSync(path.dirname(this.file), { recursive: true })
    fs.writeFileSync(this.file, safeStorage.encryptString(JSON.stringify(this.keys)), { mode: 0o600 })
  }

  status(): Record<string, KeyStatus> {
    return Object.fromEntries(
      Object.entries(this.keys).map(([p, k]) => [p, { configured: true, hint: k.slice(-4) }]),
    )
  }

  async set(provider: string, key: string | null, conn: BackendConnection | null): Promise<void> {
    const trimmed = key?.trim()
    if (trimmed) this.keys[provider] = trimmed
    else delete this.keys[provider]
    this.save()
    if (conn) await this.push(conn, { [provider]: trimmed || null })
  }

  async pushAll(conn: BackendConnection): Promise<void> {
    if (Object.keys(this.keys).length) await this.push(conn, this.keys)
  }

  private async push(conn: BackendConnection, keys: Record<string, string | null>): Promise<void> {
    const res = await fetch(`${conn.url}/api/secrets`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${conn.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ keys }),
    })
    if (!res.ok) throw new Error(`Backend rejected keys (HTTP ${res.status})`)
  }
}
