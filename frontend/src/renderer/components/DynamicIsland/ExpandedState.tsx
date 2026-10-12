/** Wingman AI - expanded chat view: transcript, answers and a composer. */
import { motion } from 'framer-motion'
import {
  Check, Copy, History, Maximize2, Mic, Minimize2, Monitor, Plus, RotateCcw, Send, Settings, Square, ThumbsDown, ThumbsUp, X,
} from 'lucide-react'
import { memo, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import toast from 'react-hot-toast'
import * as actions from '../../actions'
import { cn } from '../../lib/cn'
import { useAppStore, type AnswerEntry } from '../../store/appStore'
import { useSettingsStore } from '../../store/settingsStore'
import { AIProviderSelector } from '../AIProviderSelector'
import { ModeSelector } from '../ModeSelector'
import { CodeBlock } from './CodeBlock'

const ExpandedState = () => {
  const answers = useAppStore((s) => s.answers)
  const islandState = useAppStore((s) => s.islandState)
  const setIslandState = useAppStore((s) => s.setIslandState)
  const setPanel = useAppStore((s) => s.setPanel)
  const isProcessing = useAppStore((s) => s.isProcessing)
  const isListening = useAppStore((s) => s.isListening)
  const status = useAppStore((s) => s.status)
  const autoScroll = useSettingsStore((s) => s.autoScrollAnswers)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (autoScroll && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [answers, autoScroll])

  const noProvider = status !== null && !status.providers.some((p) => p.configured && !p.local)

  return (
    <motion.div className="flex h-full w-full flex-col p-3.5" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <header className="mb-2.5 flex flex-shrink-0 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className={cn('h-2 w-2 flex-shrink-0 rounded-full', isProcessing ? 'animate-pulse bg-wingman-400' : 'bg-wingman-500')} />
          <ModeSelector compact />
          <AIProviderSelector compact />
        </div>
        <div className="flex items-center gap-1">
          <IconButton title="New conversation (⌘N)" onClick={() => void actions.newConversation()}><Plus className="h-3.5 w-3.5" /></IconButton>
          <IconButton title="History (⌘H)" onClick={() => setPanel('history')}><History className="h-3.5 w-3.5" /></IconButton>
          <IconButton title="Settings (⌘,)" onClick={() => setPanel('settings')}><Settings className="h-3.5 w-3.5" /></IconButton>
          <IconButton title={islandState === 'fullscreen' ? 'Smaller' : 'Larger'} onClick={() => setIslandState(islandState === 'fullscreen' ? 'expanded' : 'fullscreen')}>
            {islandState === 'fullscreen' ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </IconButton>
          <IconButton title="Collapse" onClick={() => setIslandState('normal')}><X className="h-3.5 w-3.5" /></IconButton>
        </div>
      </header>

      {isListening && <TranscriptStrip />}

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
        {answers.length ? (
          answers.map((entry, i) => <AnswerView key={entry.id} entry={entry} isLast={i === answers.length - 1} />)
        ) : (
          <EmptyState noProvider={noProvider} />
        )}
      </div>

      <Composer />
    </motion.div>
  )
}

function TranscriptStrip() {
  const transcript = useAppStore((s) => s.transcript)
  const lines = transcript.slice(-3)
  const channels = useAppStore((s) => s.audioChannels)
  return (
    <div className="mb-2 flex-shrink-0 space-y-0.5 rounded-lg bg-white/[0.04] px-2.5 py-1.5 text-xs">
      {lines.length === 0 && (
        <p className="text-white/40">{channels.includes('them') ? 'Listening to you and the call…' : 'Listening… ask your question out loud.'}</p>
      )}
      {lines.map((l) => (
        <p key={l.id} className={cn('truncate', l.final ? 'text-white/70' : 'italic text-white/40')}>
          <span className={l.speaker === 'me' ? 'text-sky-300/80' : 'text-amber-300/80'}>{l.speaker === 'me' ? 'You' : 'Them'}: </span>
          {l.text}
        </p>
      ))}
    </div>
  )
}

const AnswerView = memo(function AnswerView({ entry, isLast }: { entry: AnswerEntry; isLast: boolean }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    await navigator.clipboard.writeText(entry.answer)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  const question = entry.source === 'screen' ? 'Help with what’s on my screen' : entry.question

  return (
    <div className="space-y-2">
      <div className="ml-8 rounded-xl rounded-tr-sm bg-white/[0.07] px-3 py-2 text-sm text-white/90">
        {entry.source === 'audio' && <span className="mr-1.5 text-[11px] text-amber-300/70">heard</span>}
        {question}
      </div>
      <div className="rounded-xl rounded-tl-sm border border-wingman-500/10 bg-wingman-500/[0.04] px-3 py-2">
        {entry.status === 'error' ? (
          <div className="text-sm text-red-300">
            {entry.error}
            <button className="ml-2 text-xs text-white/60 underline hover:text-white" onClick={() => void actions.ask(entry.question, 'regenerate')}>Try again</button>
          </div>
        ) : entry.answer ? (
          <div className="markdown-content text-sm text-white/90">
            <ReactMarkdown
              components={{
                code({ className, children }) {
                  const match = /language-(\w+)/.exec(className || '')
                  const code = String(children).replace(/\n$/, '')
                  if (!match && !code.includes('\n')) return <code className="rounded bg-white/10 px-1 py-0.5 text-xs text-wingman-200">{children}</code>
                  return <CodeBlock code={code} language={match?.[1] ?? 'text'} />
                },
                a: ({ href, children }) => (
                  <a href={href} onClick={(e) => { e.preventDefault(); if (href) void window.wingman?.app.openExternal(href) }} className="text-wingman-300 underline">{children}</a>
                ),
              }}
            >
              {entry.answer}
            </ReactMarkdown>
            {entry.status === 'streaming' && <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-wingman-400 align-middle" />}
          </div>
        ) : (
          <p className="text-xs text-white/40">{entry.status === 'cancelled' ? 'Stopped before answering.' : 'Thinking…'}</p>
        )}

        {entry.status !== 'streaming' && entry.status !== 'error' && entry.answer && (
          <div className="mt-2 flex items-center gap-1 text-[11px] text-white/35">
            <span className="mr-auto truncate">
              {entry.status === 'cancelled' && 'Stopped · '}
              {entry.provider && `${entry.provider}${entry.model ? ` · ${entry.model}` : ''}`}
              {entry.ttftMs ? ` · ${(entry.ttftMs / 1000).toFixed(1)}s to first word` : ''}
            </span>
            <IconButton small title="Helpful" active={entry.rating === 1} onClick={() => void actions.rateAnswer(entry.id, 1)}><ThumbsUp className="h-3 w-3" /></IconButton>
            <IconButton small title="Not helpful" active={entry.rating === -1} onClick={() => void actions.rateAnswer(entry.id, -1)}><ThumbsDown className="h-3 w-3" /></IconButton>
            {isLast && <IconButton small title="Answer again" onClick={() => void actions.ask(entry.question, 'regenerate')}><RotateCcw className="h-3 w-3" /></IconButton>}
            <IconButton small title="Copy answer" onClick={() => void copy()}>{copied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}</IconButton>
          </div>
        )}
      </div>
    </div>
  )
})

function Composer() {
  const [text, setText] = useState('')
  const isProcessing = useAppStore((s) => s.isProcessing)
  const isListening = useAppStore((s) => s.isListening)
  const connected = useAppStore((s) => s.connection === 'connected')
  const screenCapture = useAppStore((s) => s.status?.screen_capture ?? false)

  const submit = async () => {
    if (await actions.ask(text)) setText('')
  }
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      void submit()
    }
  }

  return (
    <div className="mt-2.5 flex flex-shrink-0 items-end gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] p-1.5">
      <IconButton title={isListening ? 'Stop listening (⌘L)' : 'Listen (⌘L)'} active={isListening} onClick={() => void actions.toggleListening()}>
        <Mic className={cn('h-4 w-4', isListening && 'text-red-400')} />
      </IconButton>
      <IconButton
        title={screenCapture ? 'Ask about my screen' : 'Screen capture needs Tesseract (see Settings → Screen)'}
        onClick={() => (screenCapture ? void actions.captureScreen() : toast.error('Install Tesseract to read text from the screen.'))}
      >
        <Monitor className="h-4 w-4" />
      </IconButton>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        rows={1}
        disabled={!connected}
        placeholder={connected ? 'Ask anything… (Enter to send, Shift+Enter for a new line)' : 'Waiting for the backend…'}
        className="max-h-28 min-h-[32px] flex-1 resize-none bg-transparent px-1.5 py-1.5 text-sm text-white placeholder-white/30 focus:outline-none"
      />
      {isProcessing ? (
        <IconButton title="Stop answer" onClick={() => void actions.cancelAnswer()}><Square className="h-3.5 w-3.5 fill-current" /></IconButton>
      ) : (
        <IconButton title="Send" disabled={!text.trim() || !connected} onClick={() => void submit()}><Send className="h-4 w-4" /></IconButton>
      )}
    </div>
  )
}

function EmptyState({ noProvider }: { noProvider: boolean }) {
  const setPanel = useAppStore((s) => s.setPanel)
  if (noProvider) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-white/80">Add an AI provider to get started</p>
        <p className="max-w-xs text-xs text-white/45">Groq and Google Gemini both have free tiers. Paste a key in Settings → AI, or run Ollama locally.</p>
        <button className="rounded-lg bg-wingman-500 px-3 py-1.5 text-sm text-white hover:bg-wingman-600" onClick={() => setPanel('settings')}>Open settings</button>
      </div>
    )
  }
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1.5 px-6 text-center">
      <p className="text-sm text-white/70">Ask a question, or turn on the mic</p>
      <p className="max-w-xs text-xs text-white/40">
        With call audio on (Settings → Audio), Wingman answers questions the other person asks. Mic only, it answers what you say.
      </p>
    </div>
  )
}

function IconButton({ children, onClick, title, active, small, disabled }: {
  children: ReactNode; onClick?: () => void; title?: string; active?: boolean; small?: boolean; disabled?: boolean
}) {
  return (
    <button
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={(e) => { e.stopPropagation(); onClick?.() }}
      className={cn(
        'flex flex-shrink-0 items-center justify-center rounded-lg transition-colors disabled:opacity-30',
        small ? 'p-1' : 'p-2',
        active ? 'bg-wingman-500/25 text-wingman-200' : 'text-white/55 hover:bg-white/10 hover:text-white',
      )}
    >
      {children}
    </button>
  )
}

export default ExpandedState
