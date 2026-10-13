/**
 * Starts (or attaches to) the Python backend and owns its auth token.
 *
 * - If nothing is listening, we spawn the backend with a fresh random token.
 * - If a backend is already running (e.g. `scripts/dev.sh`), we read the token
 *   it wrote to ~/.wingman/auth_token and verify it before using it.
 * - If the backend dies unexpectedly we restart it a few times with backoff.
 */
import { app } from 'electron'
import { ChildProcess, spawn } from 'child_process'
import crypto from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'

export interface BackendConnection {
  url: string
  token: string
}

const HOST = '127.0.0.1'
const PORT = Number(process.env.WINGMAN_PORT || 8765)
const MAX_RESTARTS = 3

export class BackendManager {
  readonly url = `http://${HOST}:${PORT}`
  readonly dataDir = process.env.WINGMAN_DATA_DIR || path.join(os.homedir(), '.wingman')
  private token: string | null = null
  private child: ChildProcess | null = null
  private stopping = false
  private restarts: number[] = []
  // Guards against concurrent callers (main + renderer IPC) each spawning
  // their own backend process. Without this, the second spawn fights the
  // first for port 8765, dies, retries, and the renderer ends up holding a
  // token that doesn't match the backend that actually bound the port.
  private ensurePromise: Promise<BackendConnection> | null = null

  constructor(private readonly onRestart: (conn: BackendConnection) => void = () => {}) {}

  get connection(): BackendConnection | null {
    return this.token ? { url: this.url, token: this.token } : null
  }

  ensure(): Promise<BackendConnection> {
    if (!this.ensurePromise) {
      this.ensurePromise = this._ensure().catch((err) => {
        this.ensurePromise = null
        throw err
      })
    }
    return this.ensurePromise
  }

  private async _ensure(): Promise<BackendConnection> {
    if (this.connection && (await this.healthy())) return this.connection
    if (await this.healthy()) {
      const token = this.readTokenFile()
      if (token && (await this.authorized(token))) {
        console.log('[backend] attached to running backend')
        this.token = token
        return this.connection!
      }
      throw new Error(`Port ${PORT} is in use by another program. Quit it or set WINGMAN_PORT.`)
    }
    this.token = crypto.randomBytes(32).toString('base64url')
    this.spawn()
    if (!(await this.waitHealthy(45))) throw new Error('The Wingman backend did not start. See ~/.wingman/logs/backend.log')
    return this.connection!
  }

  stop(): void {
    this.stopping = true
    if (this.child) {
      this.child.kill()
      this.child = null
    }
  }

  private readTokenFile(): string | null {
    try {
      return fs.readFileSync(path.join(this.dataDir, 'auth_token'), 'utf8').trim()
    } catch {
      return null
    }
  }

  private command(): { cmd: string; args: string[]; cwd: string } {
    const exe = process.platform === 'win32' ? 'wingman-backend.exe' : 'wingman-backend'
    const bundled = path.join(process.resourcesPath || '', 'backend', exe)
    if (app.isPackaged && fs.existsSync(bundled)) {
      return { cmd: bundled, args: [], cwd: path.dirname(bundled) }
    }
    const backendDir = path.resolve(app.getAppPath(), '..', 'backend')
    const venv = process.platform === 'win32'
      ? path.join(backendDir, 'venv', 'Scripts', 'python.exe')
      : path.join(backendDir, 'venv', 'bin', 'python')
    const python = fs.existsSync(venv) ? venv : process.platform === 'win32' ? 'python' : 'python3'
    return { cmd: python, args: ['main.py'], cwd: backendDir }
  }

  private spawn(): void {
    const { cmd, args, cwd } = this.command()
    console.log(`[backend] starting ${cmd} ${args.join(' ')}`)
    this.child = spawn(cmd, args, {
      cwd,
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1',
        WINGMAN_AUTH_TOKEN: this.token!,
        WINGMAN_DATA_DIR: this.dataDir,
        PORT: String(PORT),
        HOST,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    this.child.stdout?.on('data', (d) => process.stdout.write(`[backend] ${d}`))
    this.child.stderr?.on('data', (d) => process.stderr.write(`[backend] ${d}`))
    this.child.on('exit', (code) => {
      this.child = null
      if (this.stopping) return
      console.error(`[backend] exited with code ${code}`)
      void this.restart()
    })
  }

  private async restart(): Promise<void> {
    const now = Date.now()
    this.restarts = this.restarts.filter((t) => now - t < 5 * 60_000)
    if (this.restarts.length >= MAX_RESTARTS) {
      console.error('[backend] crashed repeatedly; not restarting')
      return
    }
    this.restarts.push(now)
    await new Promise((r) => setTimeout(r, 1000 * this.restarts.length))
    this.spawn()
    if (await this.waitHealthy(45)) this.onRestart(this.connection!)
  }

  private async healthy(): Promise<boolean> {
    try {
      const res = await fetch(`${this.url}/health`, { signal: AbortSignal.timeout(1500) })
      return res.ok
    } catch {
      return false
    }
  }

  private async authorized(token: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.url}/api/status`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(2000),
      })
      return res.ok
    } catch {
      return false
    }
  }

  private async waitHealthy(seconds: number): Promise<boolean> {
    for (let i = 0; i < seconds * 4; i++) {
      if (await this.healthy()) return true
      await new Promise((r) => setTimeout(r, 250))
    }
    return false
  }
}
