/** Wingman AI - root component. */
import { Component, useEffect, type ReactNode } from 'react'
import { Toaster } from 'react-hot-toast'
import * as actions from './actions'
import { CommandPalette } from './components/CommandPalette'
import { ContextPanel } from './components/Context'
import DynamicIsland from './components/DynamicIsland/DynamicIsland'
import { HistoryView } from './components/History'
import { MeetingPanel } from './components/Meeting'
import { PracticePanel } from './components/Practice'
import { SettingsPanel } from './components/Settings'
import { UsagePanel } from './components/Usage'
import { useBackend } from './hooks/useBackend'
import { useAppStore } from './store/appStore'

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="m-4 max-w-md rounded-2xl bg-black/90 p-4 text-sm text-white">
        <p className="font-medium">Wingman hit an unexpected error.</p>
        <p className="mt-1 text-white/60">{this.state.error.message}</p>
        <button className="mt-3 rounded-lg bg-white/10 px-3 py-1.5 hover:bg-white/20" onClick={() => location.reload()}>
          Reload
        </button>
      </div>
    )
  }
}

function App() {
  useBackend()
  const panel = useAppStore((s) => s.panel)
  const setPanel = useAppStore((s) => s.setPanel)
  const close = () => setPanel(null)

  // The window is click-through except over the island; while a panel is open it must take clicks.
  useEffect(() => {
    void window.wingman?.window.setIgnoreMouse(panel === null)
  }, [panel])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.shiftKey && e.code === 'Space') { e.preventDefault(); setPanel('commandPalette') }
      else if (mod && e.key === ',') { e.preventDefault(); setPanel('settings') }
      else if (mod && !e.shiftKey && e.key.toLowerCase() === 'h') { e.preventDefault(); setPanel('history') }
      else if (mod && !e.shiftKey && e.key.toLowerCase() === 'l') { e.preventDefault(); void actions.toggleListening() }
      else if (mod && !e.shiftKey && e.key.toLowerCase() === 'n') { e.preventDefault(); void actions.newConversation() }
      else if (e.key === 'Escape' && useAppStore.getState().panel) close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <ErrorBoundary>
      <div className="relative h-screen w-screen overflow-visible">
        <div className="absolute left-1/2 top-4 z-40 -translate-x-1/2">
          <DynamicIsland />
        </div>
        <SettingsPanel isOpen={panel === 'settings'} onClose={close} />
        <CommandPalette isOpen={panel === 'commandPalette'} onClose={close} />
        <HistoryView isOpen={panel === 'history'} onClose={close} />
        <PracticePanel isOpen={panel === 'practice'} onClose={close} />
        <MeetingPanel isOpen={panel === 'meeting'} onClose={close} />
        <ContextPanel isOpen={panel === 'context'} onClose={close} />
        <UsagePanel isOpen={panel === 'usage'} onClose={close} />
        <Toaster
          position="bottom-center"
          toastOptions={{
            duration: 3000,
            style: { background: 'rgba(0,0,0,0.85)', color: '#fff', borderRadius: '12px', padding: '10px 14px', fontSize: '13px' },
          }}
        />
      </div>
    </ErrorBoundary>
  )
}

export default App
