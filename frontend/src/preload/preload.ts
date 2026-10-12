/**
 * Wingman AI - preload. The only bridge between the sandboxed UI and Electron.
 */
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

type Unsubscribe = () => void

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function listen(channel: string, callback: (...args: any[]) => void): Unsubscribe {
  const handler = (_: IpcRendererEvent, ...args: unknown[]) => callback(...args)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api = {
  platform: process.platform,

  backend: {
    connection: (): Promise<{ url: string; token: string }> => ipcRenderer.invoke('backend:connection'),
    onRestarted: (cb: () => void) => listen('backend:restarted', cb),
    onError: (cb: (message: string) => void) => listen('backend:error', cb),
  },
  secrets: {
    status: (): Promise<{ keys: Record<string, { configured: boolean; hint: string | null }>; encrypted: boolean }> =>
      ipcRenderer.invoke('secrets:status'),
    set: (provider: string, key: string | null) => ipcRenderer.invoke('secrets:set', provider, key),
    push: () => ipcRenderer.invoke('secrets:push'),
  },
  shortcuts: {
    get: (): Promise<Record<string, string>> => ipcRenderer.invoke('shortcuts:get'),
    set: (bindings: Record<string, string>): Promise<string[]> => ipcRenderer.invoke('shortcuts:set', bindings),
  },
  media: {
    requestMicrophone: (): Promise<boolean> => ipcRenderer.invoke('media:request-mic'),
  },
  window: {
    setIgnoreMouse: (ignore: boolean) => ipcRenderer.invoke('window:set-ignore-mouse', ignore),
    mouseEnterIsland: () => ipcRenderer.send('window:mouse-enter-island'),
    mouseLeaveIsland: () => ipcRenderer.send('window:mouse-leave-island'),
    setAlwaysOnTop: (flag: boolean) => ipcRenderer.invoke('window:set-always-on-top', flag),
    setOpacity: (opacity: number) => ipcRenderer.invoke('window:set-opacity', opacity),
    setContentProtection: (hide: boolean) => ipcRenderer.invoke('window:set-content-protection', hide),
  },
  app: {
    setLaunchAtStartup: (enabled: boolean) => ipcRenderer.invoke('app:set-launch-at-startup', enabled),
    setShowInDock: (show: boolean) => ipcRenderer.invoke('app:set-show-in-dock', show),
    openExternal: (url: string) => ipcRenderer.invoke('app:open-external', url),
    quit: () => ipcRenderer.invoke('app:quit'),
  },
  on: {
    setMode: (cb: (mode: string) => void) => listen('app:set-mode', cb),
    togglePause: (cb: () => void) => listen('app:toggle-pause', cb),
    toggleListening: (cb: () => void) => listen('app:toggle-listening', cb),
    captureScreen: (cb: () => void) => listen('app:capture-screen', cb),
    openSettings: (cb: () => void) => listen('app:open-settings', cb),
    openCommandPalette: (cb: () => void) => listen('app:open-command-palette', cb),
    emergencyHide: (cb: () => void) => listen('app:emergency-hide', cb),
  },
}

export type WingmanAPI = typeof api

contextBridge.exposeInMainWorld('wingman', api)
