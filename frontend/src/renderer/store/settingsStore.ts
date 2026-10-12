/**
 * Two kinds of settings:
 *  - UI preferences that only matter on this machine (persisted in localStorage)
 *  - Backend runtime settings (provider, model, audio...) which the backend owns
 *    and persists; `runtime` here is a mirror refreshed from the server.
 * API keys are in neither: they live encrypted in the main process (see main/secrets.ts).
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { RuntimeConfig, RuntimeUpdate } from '../types/generated'
import { api } from '../services/backend'
import { call } from '../services/socket'

export interface UIPreferences {
  alwaysOnTop: boolean
  launchAtStartup: boolean
  showInDock: boolean
  windowOpacity: number
  hideFromScreenCapture: boolean
  autoScrollAnswers: boolean
  micDeviceId: string
  captureCallAudio: boolean
  autoStartListening: boolean
}

const DEFAULTS: UIPreferences = {
  alwaysOnTop: true,
  launchAtStartup: false,
  showInDock: false,
  windowOpacity: 1,
  hideFromScreenCapture: true,
  autoScrollAnswers: true,
  micDeviceId: 'default',
  captureCallAudio: false,
  autoStartListening: false,
}

interface SettingsState extends UIPreferences {
  setPreference: <K extends keyof UIPreferences>(key: K, value: UIPreferences[K]) => void
  applyWindowPreferences: () => void
  resetPreferences: () => void

  runtime: RuntimeConfig | null
  loadRuntime: () => Promise<void>
  updateRuntime: (update: RuntimeUpdate) => Promise<string | null>
}

function applyToWindow(key: keyof UIPreferences, value: unknown): void {
  const w = window.wingman
  if (!w) return
  if (key === 'alwaysOnTop') void w.window.setAlwaysOnTop(Boolean(value))
  if (key === 'windowOpacity') void w.window.setOpacity(Number(value))
  if (key === 'hideFromScreenCapture') void w.window.setContentProtection(Boolean(value))
  if (key === 'launchAtStartup') void w.app.setLaunchAtStartup(Boolean(value))
  if (key === 'showInDock') void w.app.setShowInDock(Boolean(value))
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      ...DEFAULTS,
      setPreference: (key, value) => {
        set({ [key]: value } as Partial<UIPreferences>)
        applyToWindow(key, value)
      },
      applyWindowPreferences: () => {
        const state = get()
        ;(['alwaysOnTop', 'windowOpacity', 'hideFromScreenCapture', 'showInDock'] as const).forEach((k) =>
          applyToWindow(k, state[k]),
        )
      },
      resetPreferences: () => {
        set(DEFAULTS)
        get().applyWindowPreferences()
      },

      runtime: null,
      loadRuntime: async () => {
        set({ runtime: await api<RuntimeConfig>('/api/settings') })
      },
      updateRuntime: async (update) => {
        const ack = await call('update_settings', update)
        if (!ack.ok) return ack.error ?? 'Could not save the setting.'
        set({ runtime: ack.config as RuntimeConfig })
        return null
      },
    }),
    {
      name: 'wingman-ui',
      version: 2,
      partialize: (state) =>
        Object.fromEntries(Object.keys(DEFAULTS).map((k) => [k, state[k as keyof UIPreferences]])) as unknown as UIPreferences,
    },
  ),
)

/**
 * One-time migration from v1, which stored API keys in plain text in localStorage.
 * Moves them into the encrypted vault and deletes the old entry.
 */
export async function migrateLegacySettings(): Promise<number> {
  const raw = localStorage.getItem('wingman-settings')
  if (!raw || !window.wingman) return 0
  let moved = 0
  try {
    const legacy = JSON.parse(raw)?.state ?? {}
    const keyNames: Record<string, string> = { google: 'gemini', anthropic: 'anthropic', groq: 'groq', openai: 'openai', together: 'together', mistral: 'mistral' }
    for (const [name, key] of Object.entries((legacy.apiKeys ?? {}) as Record<string, string>)) {
      const provider = keyNames[name]
      if (provider && key) {
        await window.wingman.secrets.set(provider, key)
        moved += 1
      }
    }
  } finally {
    localStorage.removeItem('wingman-settings')
  }
  return moved
}
