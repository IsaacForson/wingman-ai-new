/** Command palette (⌘⇧Space): every action in one searchable list. */
import { AnimatePresence, motion } from 'framer-motion'
import {
  BarChart3, BookOpen, Brain, Briefcase, FileText, FlaskConical, GraduationCap, History, Mic, MicOff, Monitor, Pause,
  Play, Plus, Search, Settings, Target, Users,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import * as actions from '../../actions'
import { cn } from '../../lib/cn'
import { useAppStore, type OperatingMode } from '../../store/appStore'

interface Command {
  id: string
  label: string
  hint?: string
  icon: ReactNode
  group: 'Actions' | 'Tools' | 'Modes'
  run: () => void | Promise<void>
}

const MODES: { id: OperatingMode; label: string; icon: ReactNode; hint: string }[] = [
  { id: 'interview', label: 'Interview', icon: <Brain className="h-4 w-4" />, hint: 'Structured answers you can say in your own words' },
  { id: 'study', label: 'Study', icon: <GraduationCap className="h-4 w-4" />, hint: 'Step-by-step explanations' },
  { id: 'work', label: 'Work', icon: <Briefcase className="h-4 w-4" />, hint: 'Concise, practical answers' },
  { id: 'meeting', label: 'Meeting', icon: <Users className="h-4 w-4" />, hint: 'Very short points while you talk' },
  { id: 'research', label: 'Research', icon: <FlaskConical className="h-4 w-4" />, hint: 'Thorough, balanced analysis' },
  { id: 'practice', label: 'Practice', icon: <Target className="h-4 w-4" />, hint: 'Coaching and feedback' },
]

const CommandPalette = ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => {
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const isListening = useAppStore((s) => s.isListening)
  const isPaused = useAppStore((s) => s.isPaused)
  const mode = useAppStore((s) => s.mode)
  const meetingId = useAppStore((s) => s.status?.meeting_id)
  const setPanel = useAppStore((s) => s.setPanel)

  const commands = useMemo<Command[]>(() => [
    { id: 'listen', group: 'Actions', label: isListening ? 'Stop listening' : 'Start listening', icon: isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />, run: actions.toggleListening },
    { id: 'screen', group: 'Actions', label: 'Ask about my screen', icon: <Monitor className="h-4 w-4" />, run: actions.captureScreen },
    { id: 'new', group: 'Actions', label: 'New conversation', icon: <Plus className="h-4 w-4" />, run: actions.newConversation },
    { id: 'pause', group: 'Actions', label: isPaused ? 'Resume' : 'Pause', hint: isPaused ? 'Start answering again' : 'Stop answering and ignore audio', icon: isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />, run: actions.togglePause },
    { id: 'meeting', group: 'Tools', label: meetingId ? 'Meeting notes (recording)' : 'Meeting notes', hint: 'Record a meeting and get a summary with action items', icon: <Users className="h-4 w-4" />, run: () => setPanel('meeting') },
    { id: 'practice', group: 'Tools', label: 'Interview practice', hint: 'Answer out loud and get graded feedback', icon: <Target className="h-4 w-4" />, run: () => setPanel('practice') },
    { id: 'context', group: 'Tools', label: 'Context documents', hint: 'Résumé, job description and notes Wingman can use', icon: <FileText className="h-4 w-4" />, run: () => setPanel('context') },
    { id: 'history', group: 'Tools', label: 'Conversation history', icon: <History className="h-4 w-4" />, run: () => setPanel('history') },
    { id: 'usage', group: 'Tools', label: 'Usage and speed', hint: 'Latency and tokens per provider', icon: <BarChart3 className="h-4 w-4" />, run: () => setPanel('usage') },
    { id: 'settings', group: 'Tools', label: 'Settings', icon: <Settings className="h-4 w-4" />, run: () => setPanel('settings') },
    ...MODES.map((m) => ({
      id: `mode-${m.id}`, group: 'Modes' as const, label: `${m.label} mode${m.id === mode ? ' (current)' : ''}`, hint: m.hint, icon: m.icon,
      run: () => actions.setMode(m.id),
    })),
  ], [isListening, isPaused, mode, meetingId, setPanel])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? commands.filter((c) => `${c.label} ${c.hint ?? ''} ${c.group}`.toLowerCase().includes(q)) : commands
  }, [commands, query])

  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setIndex(0)
      setTimeout(() => inputRef.current?.focus(), 30)
    }
  }, [isOpen])
  useEffect(() => setIndex(0), [query])

  const run = (command: Command | undefined) => {
    if (!command) return
    if (!['meeting', 'practice', 'context', 'history', 'usage', 'settings'].includes(command.id)) onClose()
    void command.run()
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div className="fixed inset-0 z-50 flex items-start justify-center pt-[14vh]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={onClose} />
          <motion.div className="relative w-[540px] overflow-hidden rounded-2xl border border-white/10 bg-neutral-950/95 shadow-2xl" initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
            <div className="flex items-center gap-2.5 border-b border-white/10 px-4 py-3">
              <Search className="h-4 w-4 text-white/40" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setIndex((i) => Math.min(i + 1, filtered.length - 1)) }
                  if (e.key === 'ArrowUp') { e.preventDefault(); setIndex((i) => Math.max(i - 1, 0)) }
                  if (e.key === 'Enter') { e.preventDefault(); run(filtered[index]) }
                  if (e.key === 'Escape') onClose()
                }}
                placeholder="Type a command"
                aria-label="Search commands"
                className="flex-1 bg-transparent text-sm text-white placeholder-white/35 focus:outline-none"
              />
            </div>
            <div className="max-h-[52vh] overflow-y-auto p-1.5">
              {filtered.length === 0 && <p className="px-3 py-6 text-center text-sm text-white/40">No matching command</p>}
              {filtered.map((c, i) => (
                <div key={c.id}>
                  {(i === 0 || filtered[i - 1].group !== c.group) && <p className="px-3 pb-1 pt-2 text-[11px] text-white/35">{c.group}</p>}
                  <button
                    onMouseEnter={() => setIndex(i)}
                    onClick={() => run(c)}
                    className={cn('flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left', i === index ? 'bg-wingman-500/15 text-white' : 'text-white/75')}
                  >
                    <span className="text-white/60">{c.icon}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm">{c.label}</span>
                      {c.hint && <span className="block truncate text-xs text-white/40">{c.hint}</span>}
                    </span>
                  </button>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-1.5 border-t border-white/10 px-4 py-2 text-[11px] text-white/35">
              <BookOpen className="h-3 w-3" /> ↑↓ to move, Enter to run, Esc to close
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default CommandPalette
