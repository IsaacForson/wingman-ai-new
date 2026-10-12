/** Meeting notes: record a meeting, then get a summary, decisions, action items and a follow-up email. */
import { ArrowLeft, Copy, Download, Mic, RotateCcw, Square, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import * as actions from '../../actions'
import { api } from '../../services/backend'
import { useAppStore } from '../../store/appStore'
import { download } from '../../lib/download'
import { Button, Empty, Note, Toggle } from '../ui/controls'
import { Panel } from '../ui/Panel'

interface Summary {
  title: string; summary: string; key_points: string[]; decisions: string[]; open_questions: string[]
  action_items: { owner: string; task: string; due: string | null }[]
  follow_up_email: { subject: string; body: string }
}
interface Meeting { id: string; title: string; started_at: string; ended_at: string | null; summary: Summary | null; lines: { speaker: string; text: string }[]; active: boolean }
interface MeetingRow { id: string; title: string; started_at: string; lines: number; has_summary: boolean; active: boolean }

const MeetingPanel = ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => {
  const activeId = useAppStore((s) => s.status?.meeting_id ?? null)
  const transcript = useAppStore((s) => s.transcript)
  const [includeCall, setIncludeCall] = useState(true)
  const [title, setTitle] = useState('')
  const [list, setList] = useState<MeetingRow[]>([])
  const [open, setOpen] = useState<Meeting | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [startedAt, setStartedAt] = useState<number | null>(null)

  const refresh = () => api<MeetingRow[]>('/api/meetings').then(setList).catch((e) => toast.error(e.message))
  useEffect(() => { if (isOpen) void refresh() }, [isOpen, activeId])

  const start = async () => {
    setBusy('start')
    try {
      await api('/api/meetings', { method: 'POST', json: { title } })
      useAppStore.getState().clearTranscript()
      if (!useAppStore.getState().isListening) await actions.startListening({ systemAudio: includeCall })
      setStartedAt(Date.now())
      setTitle('')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const stop = async () => {
    if (!activeId) return
    setBusy('stop')
    await actions.stopListening()
    try {
      setOpen(await api<Meeting>(`/api/meetings/${activeId}/stop`, { method: 'POST' }))
    } catch (e) {
      toast.error((e as Error).message, { duration: 8000 })
    } finally {
      setBusy(null)
      setStartedAt(null)
      void refresh()
    }
  }

  const view = async (id: string) => setOpen(await api<Meeting>(`/api/meetings/${id}`))

  const resummarize = async () => {
    if (!open) return
    setBusy('summarize')
    try {
      setOpen(await api<Meeting>(`/api/meetings/${open.id}/summarize`, { method: 'POST' }))
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const remove = async (id: string) => {
    if (!confirm('Delete this meeting and its transcript?')) return
    await api(`/api/meetings/${id}`, { method: 'DELETE' })
    setOpen(null)
    void refresh()
  }

  const minutes = startedAt ? Math.max(0, Math.floor((Date.now() - startedAt) / 60000)) : null

  return (
    <Panel isOpen={isOpen} onClose={onClose} title={open ? open.title : 'Meeting notes'} subtitle={open ? new Date(open.started_at).toLocaleString() : 'Transcribe a meeting, then get a write-up'} width="w-[720px]"
      actions={open && (
        <div className="flex gap-1">
          <Button variant="ghost" onClick={() => setOpen(null)}><ArrowLeft className="h-3.5 w-3.5" />All meetings</Button>
          <Button variant="ghost" onClick={async () => download(`${open.title}.md`, await api<string>(`/api/meetings/${open.id}/export`))}><Download className="h-3.5 w-3.5" />Export</Button>
        </div>
      )}
    >
      {open ? (
        <MeetingDetail meeting={open} busy={busy} onResummarize={resummarize} onDelete={() => void remove(open.id)} />
      ) : (
        <div className="space-y-5 p-5">
          {activeId ? (
            <div className="rounded-xl border border-red-500/20 bg-red-500/[0.06] p-4">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 animate-pulse rounded-full bg-red-400" />
                <p className="text-sm text-white">Recording{minutes !== null ? ` · ${minutes} min` : ''}</p>
                <Button variant="primary" className="ml-auto" loading={busy === 'stop'} onClick={() => void stop()}>
                  <Square className="h-3.5 w-3.5 fill-current" />Stop and summarize
                </Button>
              </div>
              <div className="mt-3 max-h-56 space-y-1 overflow-y-auto text-sm">
                {transcript.length === 0 && <p className="text-xs text-white/45">Waiting for speech…</p>}
                {transcript.map((l) => (
                  <p key={l.id} className={l.final ? 'text-white/80' : 'italic text-white/40'}>
                    <span className={l.speaker === 'me' ? 'text-sky-300/80' : 'text-amber-300/80'}>{l.speaker === 'me' ? 'Me' : 'Them'}: </span>{l.text}
                  </p>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-2 rounded-xl bg-white/[0.04] p-4">
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Meeting name (optional)" aria-label="Meeting name" className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 focus:border-wingman-500 focus:outline-none" />
              <Toggle label="Include call audio" description="Capture the other participants, not just your mic." value={includeCall} onChange={setIncludeCall} />
              <div className="flex justify-end">
                <Button variant="primary" loading={busy === 'start'} onClick={() => void start()}><Mic className="h-3.5 w-3.5" />Start recording</Button>
              </div>
              <Note>Let people know you're taking notes. Some places require everyone's consent to record.</Note>
            </div>
          )}

          <div>
            <p className="mb-2 text-sm text-white/70">Past meetings</p>
            {list.filter((m) => !m.active).length === 0 ? <Empty title="No meetings yet" /> : (
              <ul className="divide-y divide-white/5 rounded-xl bg-white/[0.03]">
                {list.filter((m) => !m.active).map((m) => (
                  <li key={m.id}>
                    <button onClick={() => void view(m.id)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-white/[0.03]">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-white/85">{m.title}</span>
                        <span className="text-xs text-white/40">{new Date(m.started_at).toLocaleString()} · {m.lines} lines{m.has_summary ? '' : ' · no summary yet'}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Panel>
  )
}

function Bullets({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null
  return (
    <section>
      <h3 className="mb-1 text-sm font-medium text-white/80">{title}</h3>
      <ul className="list-disc space-y-0.5 pl-5 text-sm text-white/70">{items.map((i) => <li key={i}>{i}</li>)}</ul>
    </section>
  )
}

function MeetingDetail({ meeting, busy, onResummarize, onDelete }: { meeting: Meeting; busy: string | null; onResummarize: () => void; onDelete: () => void }) {
  const s = meeting.summary
  const copyEmail = async () => {
    if (!s) return
    await navigator.clipboard.writeText(`Subject: ${s.follow_up_email.subject}\n\n${s.follow_up_email.body}`)
    toast.success('Email copied')
  }
  return (
    <div className="space-y-5 p-5">
      {s ? (
        <>
          {s.summary && <p className="text-sm leading-relaxed text-white/85">{s.summary}</p>}
          {s.action_items.length > 0 && (
            <section>
              <h3 className="mb-1 text-sm font-medium text-white/80">Action items</h3>
              <ul className="space-y-1">
                {s.action_items.map((a) => (
                  <li key={a.task} className="flex items-start gap-2 text-sm text-white/75">
                    <input type="checkbox" className="mt-1 accent-wingman-500" aria-label={a.task} />
                    <span>{a.task}{a.owner && <span className="text-white/45"> · {a.owner}</span>}{a.due && <span className="text-white/45"> · due {a.due}</span>}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <Bullets title="Decisions" items={s.decisions} />
          <Bullets title="Key points" items={s.key_points} />
          <Bullets title="Open questions" items={s.open_questions} />
          {s.follow_up_email.body && (
            <section className="rounded-xl bg-white/[0.04] p-3">
              <div className="mb-1 flex items-center">
                <h3 className="text-sm font-medium text-white/80">Follow-up email</h3>
                <Button variant="ghost" className="ml-auto" onClick={() => void copyEmail()}><Copy className="h-3.5 w-3.5" />Copy</Button>
              </div>
              <p className="text-xs text-white/50">Subject: {s.follow_up_email.subject}</p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-white/75">{s.follow_up_email.body}</p>
            </section>
          )}
        </>
      ) : (
        <Note tone="warning">No summary yet. Make sure an AI provider is set up, then summarize again.</Note>
      )}
      <details className="text-sm">
        <summary className="cursor-pointer text-white/55">Transcript ({meeting.lines.length} lines)</summary>
        <div className="mt-2 max-h-64 space-y-1 overflow-y-auto">
          {meeting.lines.map((l, i) => <p key={i} className="text-white/70"><span className="text-white/40">{l.speaker === 'me' ? 'Me' : 'Them'}: </span>{l.text}</p>)}
        </div>
      </details>
      <div className="flex justify-between">
        <Button variant="danger" onClick={onDelete}><Trash2 className="h-3.5 w-3.5" />Delete</Button>
        <Button loading={busy === 'summarize'} onClick={onResummarize}>{busy !== 'summarize' && <RotateCcw className="h-3.5 w-3.5" />}Summarize again</Button>
      </div>
    </div>
  )
}

export default MeetingPanel
