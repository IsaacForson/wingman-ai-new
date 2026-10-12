/** Settings: a shell with one file per section. */
import { Cpu, Keyboard, Mic, Monitor, Puzzle, Settings as Gear, Shield } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { Panel } from '../ui/Panel'
import { AISection } from './AISection'
import { AudioSection } from './AudioSection'
import { ExtensionSection } from './ExtensionSection'
import { GeneralSection } from './GeneralSection'
import { PrivacySection } from './PrivacySection'
import { ScreenSection } from './ScreenSection'
import { ShortcutsSection } from './ShortcutsSection'

type Tab = 'general' | 'ai' | 'audio' | 'screen' | 'shortcuts' | 'extension' | 'privacy'

const TABS: { id: Tab; label: string; icon: ReactNode; render: () => ReactNode }[] = [
  { id: 'ai', label: 'AI', icon: <Cpu className="h-4 w-4" />, render: () => <AISection /> },
  { id: 'audio', label: 'Audio', icon: <Mic className="h-4 w-4" />, render: () => <AudioSection /> },
  { id: 'screen', label: 'Screen', icon: <Monitor className="h-4 w-4" />, render: () => <ScreenSection /> },
  { id: 'general', label: 'General', icon: <Gear className="h-4 w-4" />, render: () => <GeneralSection /> },
  { id: 'shortcuts', label: 'Shortcuts', icon: <Keyboard className="h-4 w-4" />, render: () => <ShortcutsSection /> },
  { id: 'extension', label: 'Browser extension', icon: <Puzzle className="h-4 w-4" />, render: () => <ExtensionSection /> },
  { id: 'privacy', label: 'Privacy & data', icon: <Shield className="h-4 w-4" />, render: () => <PrivacySection /> },
]

const SettingsPanel = ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => {
  const [tab, setTab] = useState<Tab>('ai')
  const active = TABS.find((t) => t.id === tab)!
  return (
    <Panel isOpen={isOpen} onClose={onClose} title="Settings" width="w-[860px]">
      <div className="flex h-[600px] max-h-[72vh]">
        <nav className="w-48 flex-shrink-0 space-y-0.5 border-r border-white/10 p-2" aria-label="Settings sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              aria-current={t.id === tab}
              className={cn('flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm', t.id === tab ? 'bg-wingman-500/15 text-wingman-200' : 'text-white/60 hover:bg-white/5 hover:text-white')}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </nav>
        <div className="min-w-0 flex-1 space-y-6 overflow-y-auto p-5">{active.render()}</div>
      </div>
    </Panel>
  )
}

export default SettingsPanel
