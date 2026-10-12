import { useEffect, useState, type KeyboardEvent } from 'react'
import toast from 'react-hot-toast'
import { cn, formatAccelerator } from '../../lib/cn'
import { Button, Note, Section } from '../ui/controls'

const ACTIONS: { id: string; label: string }[] = [
  { id: 'toggleVisibility', label: 'Show or hide Wingman' },
  { id: 'commandPalette', label: 'Command palette' },
  { id: 'toggleListening', label: 'Start or stop listening' },
  { id: 'pauseResume', label: 'Pause or resume' },
  { id: 'captureScreen', label: 'Ask about my screen' },
  { id: 'emergencyHide', label: 'Hide and pause' },
]

/** KeyboardEvent -> Electron accelerator ("CommandOrControl+Shift+K"). */
function toAccelerator(e: KeyboardEvent): string | null {
  if (['Meta', 'Control', 'Shift', 'Alt'].includes(e.key)) return null
  const parts = []
  if (e.metaKey || e.ctrlKey) parts.push('CommandOrControl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  if (parts.length === 0) return null // global shortcuts need a modifier
  const key = e.code === 'Space' ? 'Space' : e.key === 'Escape' ? 'Escape' : e.key.length === 1 ? e.key.toUpperCase() : e.key
  return [...parts, key].join('+')
}

export function ShortcutsSection() {
  const [bindings, setBindings] = useState<Record<string, string>>({})
  const [recording, setRecording] = useState<string | null>(null)

  useEffect(() => { void window.wingman?.shortcuts.get().then(setBindings) }, [])

  const save = async (action: string, accelerator: string) => {
    const next = { ...bindings, [action]: accelerator }
    const failed = (await window.wingman?.shortcuts.set(next)) ?? []
    setBindings(await window.wingman!.shortcuts.get())
    setRecording(null)
    if (failed.includes(action)) toast.error('That shortcut is already used by another app. Try a different one.')
    else toast.success('Shortcut saved')
  }

  if (!window.wingman) return <Note>Shortcuts can be changed in the desktop app.</Note>

  return (
    <Section title="Global shortcuts" description="Work even when Wingman isn't focused.">
      {ACTIONS.map((a) => (
        <div key={a.id} className="flex items-center justify-between gap-3 py-2">
          <span className="text-sm text-white">{a.label}</span>
          <div className="flex items-center gap-2">
            <kbd
              tabIndex={recording === a.id ? 0 : -1}
              ref={(el) => { if (recording === a.id) el?.focus() }}
              onKeyDown={(e) => {
                e.preventDefault()
                if (e.key === 'Escape' && !e.metaKey && !e.ctrlKey) return setRecording(null)
                const acc = toAccelerator(e)
                if (acc) void save(a.id, acc)
              }}
              onBlur={() => recording === a.id && setRecording(null)}
              className={cn('min-w-[96px] rounded-md px-2.5 py-1 text-center text-xs outline-none', recording === a.id ? 'bg-wingman-500/25 text-wingman-100' : 'bg-white/10 text-white/70')}
            >
              {recording === a.id ? 'Press keys…' : formatAccelerator(bindings[a.id])}
            </kbd>
            <Button variant="ghost" onClick={() => setRecording(a.id)}>Change</Button>
          </div>
        </div>
      ))}
    </Section>
  )
}
