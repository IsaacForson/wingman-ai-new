import { clsx, type ClassValue } from 'clsx'

export const cn = (...inputs: ClassValue[]) => clsx(inputs)

export const isMac = () => (window.wingman?.platform ?? navigator.platform.toLowerCase()).includes('mac') ||
  window.wingman?.platform === 'darwin'

/** "CommandOrControl+Shift+L" -> "⌘⇧L" on macOS, "Ctrl+Shift+L" elsewhere. */
export function formatAccelerator(accelerator: string): string {
  if (!accelerator) return 'Not set'
  const mac = isMac()
  return accelerator
    .split('+')
    .map((k) => {
      if (k === 'CommandOrControl' || k === 'CmdOrCtrl') return mac ? '⌘' : 'Ctrl'
      if (k === 'Shift') return mac ? '⇧' : 'Shift'
      if (k === 'Alt' || k === 'Option') return mac ? '⌥' : 'Alt'
      if (k === 'Escape') return 'Esc'
      return k
    })
    .join(mac ? '' : '+')
}
