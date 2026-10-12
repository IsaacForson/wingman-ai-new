/** Global shortcuts that the user can change in Settings → Shortcuts. */
import { globalShortcut } from 'electron'

export type ShortcutAction =
  | 'toggleVisibility'
  | 'commandPalette'
  | 'toggleListening'
  | 'pauseResume'
  | 'captureScreen'
  | 'emergencyHide'

// Cmd+Space belongs to Spotlight on macOS, so the palette uses Cmd+Shift+Space.
export const DEFAULT_SHORTCUTS: Record<ShortcutAction, string> = {
  toggleVisibility: 'CommandOrControl+Shift+W',
  commandPalette: 'CommandOrControl+Shift+Space',
  toggleListening: 'CommandOrControl+Shift+L',
  pauseResume: 'CommandOrControl+Shift+P',
  captureScreen: 'CommandOrControl+Shift+S',
  emergencyHide: 'CommandOrControl+Shift+Escape',
}

export class Shortcuts {
  private current: Record<ShortcutAction, string> = { ...DEFAULT_SHORTCUTS }

  constructor(private readonly handlers: Record<ShortcutAction, () => void>) {}

  get bindings(): Record<ShortcutAction, string> {
    return { ...this.current }
  }

  /** Re-register everything. Returns the actions whose shortcut could not be registered. */
  apply(bindings: Partial<Record<ShortcutAction, string>>): ShortcutAction[] {
    this.current = { ...this.current, ...bindings }
    globalShortcut.unregisterAll()
    const failed: ShortcutAction[] = []
    for (const [action, accelerator] of Object.entries(this.current) as [ShortcutAction, string][]) {
      if (!accelerator) continue
      try {
        if (!globalShortcut.register(accelerator, this.handlers[action])) failed.push(action)
      } catch {
        failed.push(action)
      }
    }
    return failed
  }
}
