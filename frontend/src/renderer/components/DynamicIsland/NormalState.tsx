/** Wingman AI - Normal state: one-line status bar. Click to expand. */
import { motion } from 'framer-motion'
import { ChevronDown, Loader2, Mic, MicOff, Settings, Sparkles, WifiOff } from 'lucide-react'
import * as actions from '../../actions'
import { useAppStore } from '../../store/appStore'
import { ModeSelector } from '../ModeSelector'

const NormalState = () => {
  const isProcessing = useAppStore((s) => s.isProcessing)
  const isListening = useAppStore((s) => s.isListening)
  const connection = useAppStore((s) => s.connection)
  const latest = useAppStore((s) => s.answers[s.answers.length - 1])
  const lastLine = useAppStore((s) => s.transcript[s.transcript.length - 1])
  const setIslandState = useAppStore((s) => s.setIslandState)
  const setPanel = useAppStore((s) => s.setPanel)

  let headline = 'Click the mic or type a question'
  let detail: string | null = null
  if (connection !== 'connected') headline = connection === 'connecting' ? 'Connecting…' : 'Backend not connected'
  else if (latest?.status === 'streaming') {
    detail = latest.question
    headline = latest.answer ? latest.answer.slice(-80) : 'Thinking…'
  } else if (isListening) {
    headline = lastLine ? lastLine.text : 'Listening…'
    detail = lastLine ? (lastLine.speaker === 'me' ? 'You' : 'Them') : null
  } else if (latest?.answer) {
    detail = latest.question
    headline = latest.answer.slice(0, 80)
  }

  return (
    <motion.div className="flex h-full w-full cursor-pointer items-center px-4" onClick={() => setIslandState('expanded')}>
      <button
        aria-label={isListening ? 'Stop listening' : 'Start listening'}
        className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full transition-colors hover:bg-white/20 ${isListening ? 'bg-red-500/30' : 'bg-white/10'}`}
        onClick={(e) => { e.stopPropagation(); void actions.toggleListening() }}
      >
        {connection !== 'connected' ? <WifiOff className="h-4 w-4 text-white/50" />
          : isProcessing ? <Loader2 className="h-4 w-4 animate-spin text-wingman-400" />
          : isListening ? <Mic className="h-4 w-4 text-red-400" />
          : latest ? <Sparkles className="h-4 w-4 text-wingman-400" />
          : <MicOff className="h-4 w-4 text-white/60" />}
      </button>
      <div className="mx-3 min-w-0 flex-1">
        {detail && <p className="truncate text-xs text-white/40">{detail}</p>}
        <p className="truncate text-sm text-white/85">{headline}</p>
      </div>
      <div className="flex flex-shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
        <ModeSelector compact />
        <button aria-label="Settings" className="flex h-7 w-7 items-center justify-center rounded-full bg-white/5 hover:bg-white/15" onClick={() => setPanel('settings')}>
          <Settings className="h-3.5 w-3.5 text-white/55" />
        </button>
        <ChevronDown className="h-4 w-4 text-white/35" />
      </div>
    </motion.div>
  )
}

export default NormalState
