/** Mock-interview practice: answer out loud or by typing, get graded feedback, track progress. */
import { Lightbulb, Loader2, Mic, Sparkles, Square, Volume2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import * as actions from '../../actions'
import { cn } from '../../lib/cn'
import { api } from '../../services/backend'
import { useAppStore } from '../../store/appStore'
import { Button, Empty } from '../ui/controls'
import { Panel } from '../ui/Panel'

interface Question { id: string; question: string; type: string; category: string; hints: string[]; key_points: string[] }
interface Feedback {
  score: number; summary: string; strengths: string[]; improvements: string[]; missed_points: string[]
  better_answer_outline: string[]; star: Record<'situation' | 'task' | 'action' | 'result', number> | null
}
interface Stats { attempts: number; average: number | null; recent_average: number | null; previous_average: number | null }
interface Attempt { id: string; question: string; category: string; score: number; created_at: string; feedback: Feedback }

const CATEGORIES = [
  ['', 'All'], ['behavioral', 'Behavioral'], ['technical', 'Technical'], ['coding', 'Coding'], ['system_design', 'System design'],
] as const

const PracticePanel = ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => {
  const [tab, setTab] = useState<'practice' | 'history'>('practice')
  const [category, setCategory] = useState('')
  const [bank, setBank] = useState<Question[]>([])
  const [question, setQuestion] = useState<Question | null>(null)
  const [answer, setAnswer] = useState('')
  const [showHints, setShowHints] = useState(false)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [grading, setGrading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [recording, setRecording] = useState(false)
  const [stats, setStats] = useState<Stats | null>(null)
  const [history, setHistory] = useState<Attempt[]>([])
  const startedAt = useRef<number>(Date.now())
  const recordFrom = useRef<number>(0)
  const transcript = useAppStore((s) => s.transcript)

  const refreshStats = () => {
    api<Stats>('/api/practice/stats').then(setStats).catch(() => {})
    api<Attempt[]>('/api/practice/history?limit=30').then(setHistory).catch(() => {})
  }

  useEffect(() => {
    if (!isOpen) return
    api<Question[]>(`/api/practice/questions${category ? `?category=${category}` : ''}`).then((qs) => {
      setBank(qs)
      if (!question || (category && question.type !== category)) pick(qs)
    }).catch((e) => toast.error(e.message))
    refreshStats()
  }, [isOpen, category]) // eslint-disable-line react-hooks/exhaustive-deps

  // While recording, the answer is the user's own final transcript lines since recording began.
  const spoken = useMemo(
    () => transcript.filter((l) => l.speaker === 'me' && l.at >= recordFrom.current).map((l) => l.text).join(' '),
    [transcript],
  )
  useEffect(() => { if (recording) setAnswer(spoken) }, [recording, spoken])

  const pick = (pool: Question[] = bank) => {
    if (!pool.length) return
    const options = pool.filter((q) => q.id !== question?.id)
    setQuestion((options.length ? options : pool)[Math.floor(Math.random() * (options.length || pool.length))])
    setAnswer('')
    setFeedback(null)
    setShowHints(false)
    startedAt.current = Date.now()
  }

  const speak = () => {
    if (!question) return
    speechSynthesis.cancel()
    speechSynthesis.speak(new SpeechSynthesisUtterance(question.question))
  }

  const toggleRecording = async () => {
    if (recording) {
      await actions.stopListening()
      setRecording(false)
      return
    }
    // Practice mode stops Wingman from answering your spoken answer.
    if (useAppStore.getState().mode !== 'practice') await actions.setMode('practice')
    recordFrom.current = Date.now()
    if (await actions.startListening({ systemAudio: false })) setRecording(true)
  }

  const generate = async () => {
    setGenerating(true)
    try {
      const qs = await api<Question[]>('/api/practice/questions/generate?count=6', { method: 'POST' })
      setBank(qs)
      pick(qs)
      toast.success(`${qs.length} questions written for your job description`)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setGenerating(false)
    }
  }

  const grade = async () => {
    if (!question) return
    if (recording) await toggleRecording()
    setGrading(true)
    try {
      const fb = await api<Feedback>('/api/practice/grade', {
        method: 'POST',
        json: { question: question.question, answer, category: question.type, key_points: question.key_points, question_id: question.id, duration_s: (Date.now() - startedAt.current) / 1000 },
      })
      setFeedback(fb)
      refreshStats()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setGrading(false)
    }
  }

  const trend = stats?.recent_average != null && stats.previous_average != null ? stats.recent_average - stats.previous_average : null

  return (
    <Panel
      isOpen={isOpen}
      onClose={() => { if (recording) void toggleRecording(); onClose() }}
      title="Interview practice"
      subtitle={stats?.attempts ? `${stats.attempts} answers graded · average ${stats.average}/10${trend !== null ? ` · ${trend >= 0 ? '+' : ''}${trend.toFixed(1)} vs your previous 10` : ''}` : 'Answer out loud or type, then get honest feedback'}
      actions={
        <div className="flex rounded-lg bg-white/5 p-0.5 text-xs">
          {(['practice', 'history'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={cn('rounded-md px-2.5 py-1 capitalize', tab === t ? 'bg-white/15 text-white' : 'text-white/50')}>{t}</button>
          ))}
        </div>
      }
    >
      {tab === 'history' ? (
        history.length ? (
          <ul className="divide-y divide-white/5">
            {history.map((h) => (
              <li key={h.id} className="flex items-start gap-3 px-5 py-3">
                <Score value={h.score} />
                <div className="min-w-0">
                  <p className="text-sm text-white/85">{h.question}</p>
                  <p className="text-xs text-white/40">{h.category.replace('_', ' ')} · {new Date(h.created_at).toLocaleString()}</p>
                  {h.feedback.summary && <p className="mt-1 text-xs text-white/55">{h.feedback.summary}</p>}
                </div>
              </li>
            ))}
          </ul>
        ) : <Empty title="No graded answers yet" />
      ) : (
        <div className="space-y-4 p-5">
          <div className="flex flex-wrap items-center gap-1.5">
            {CATEGORIES.map(([value, label]) => (
              <button key={value} onClick={() => setCategory(value)} className={cn('rounded-full px-3 py-1 text-xs', category === value ? 'bg-wingman-500/25 text-wingman-100' : 'bg-white/5 text-white/55 hover:bg-white/10')}>{label}</button>
            ))}
            <Button variant="ghost" className="ml-auto text-xs" loading={generating} onClick={() => void generate()}>
              <Sparkles className="h-3.5 w-3.5" />Questions from my job description
            </Button>
          </div>

          {question && (
            <div className="rounded-xl bg-white/[0.04] p-4">
              <p className="text-[11px] text-white/40">{question.type.replace('_', ' ')}</p>
              <p className="mt-1 text-base text-white">{question.question}</p>
              <div className="mt-3 flex gap-1.5">
                <Button variant="ghost" onClick={speak}><Volume2 className="h-3.5 w-3.5" />Read aloud</Button>
                {(question.hints.length > 0 || question.key_points.length > 0) && (
                  <Button variant="ghost" onClick={() => setShowHints(!showHints)}><Lightbulb className="h-3.5 w-3.5" />{showHints ? 'Hide hints' : 'Hints'}</Button>
                )}
                <Button variant="ghost" className="ml-auto" onClick={() => pick()}>Skip</Button>
              </div>
              {showHints && (
                <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-white/55">
                  {[...question.hints, ...question.key_points.map((k) => `Cover: ${k}`)].map((h) => <li key={h}>{h}</li>)}
                </ul>
              )}
            </div>
          )}

          {!feedback ? (
            <div className="space-y-2">
              <textarea
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                readOnly={recording}
                rows={6}
                placeholder="Type your answer, or press Record and say it out loud."
                aria-label="Your answer"
                className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.04] p-3 text-sm text-white placeholder-white/30 focus:border-wingman-500 focus:outline-none"
              />
              <div className="flex items-center gap-2">
                <Button onClick={() => void toggleRecording()} className={recording ? 'bg-red-500/20 text-red-200 hover:bg-red-500/30' : ''}>
                  {recording ? <><Square className="h-3.5 w-3.5 fill-current" />Stop recording</> : <><Mic className="h-3.5 w-3.5" />Record</>}
                </Button>
                {recording && <span className="flex items-center gap-1.5 text-xs text-white/45"><Loader2 className="h-3 w-3 animate-spin" />Listening</span>}
                <Button variant="primary" className="ml-auto" disabled={answer.trim().split(/\s+/).length < 5} loading={grading} onClick={() => void grade()}>Get feedback</Button>
              </div>
            </div>
          ) : (
            <FeedbackView feedback={feedback} onNext={() => pick()} onRetry={() => { setFeedback(null); setAnswer('') }} />
          )}
        </div>
      )}
    </Panel>
  )
}

function Score({ value }: { value: number }) {
  const tone = value >= 8 ? 'bg-green-500/15 text-green-300' : value >= 5 ? 'bg-amber-500/15 text-amber-200' : 'bg-red-500/15 text-red-300'
  return <span className={cn('flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-sm font-semibold tabular-nums', tone)}>{value}</span>
}

function List({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null
  return (
    <div>
      <p className="mb-1 text-xs text-white/45">{title}</p>
      <ul className="list-disc space-y-0.5 pl-5 text-sm text-white/80">{items.map((i) => <li key={i}>{i}</li>)}</ul>
    </div>
  )
}

function FeedbackView({ feedback, onNext, onRetry }: { feedback: Feedback; onNext: () => void; onRetry: () => void }) {
  return (
    <div className="space-y-4 rounded-xl bg-white/[0.04] p-4">
      <div className="flex items-start gap-3">
        <Score value={feedback.score} />
        <p className="text-sm text-white/85">{feedback.summary}</p>
      </div>
      {feedback.star && (
        <div className="grid grid-cols-4 gap-2">
          {(['situation', 'task', 'action', 'result'] as const).map((k) => (
            <div key={k}>
              <p className="mb-1 text-[11px] capitalize text-white/45">{k}</p>
              <div className="flex gap-0.5">{[1, 2, 3].map((n) => <span key={n} className={cn('h-1.5 flex-1 rounded-full', n <= feedback.star![k] ? 'bg-wingman-400' : 'bg-white/10')} />)}</div>
            </div>
          ))}
        </div>
      )}
      <List title="What worked" items={feedback.strengths} />
      <List title="To improve" items={feedback.improvements} />
      <List title="You didn't mention" items={feedback.missed_points} />
      <List title="A stronger answer would" items={feedback.better_answer_outline} />
      <div className="flex justify-end gap-2">
        <Button onClick={onRetry}>Try again</Button>
        <Button variant="primary" onClick={onNext}>Next question</Button>
      </div>
    </div>
  )
}

export default PracticePanel
