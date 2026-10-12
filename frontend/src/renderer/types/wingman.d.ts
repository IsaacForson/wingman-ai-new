import type { WingmanAPI } from '../../preload/preload'

declare global {
  interface Window {
    /** Undefined when the UI runs in a plain browser (vite dev without Electron). */
    wingman?: WingmanAPI
  }
}

export {}
