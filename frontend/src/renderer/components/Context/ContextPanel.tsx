/** Context documents: résumé, job description and notes that Wingman uses when answering. */
import { FileText, Trash2, Upload } from 'lucide-react'
import { useEffect, useRef, useState, type DragEvent } from 'react'
import toast from 'react-hot-toast'
import { cn } from '../../lib/cn'
import { api } from '../../services/backend'
import { Button, Empty, Note } from '../ui/controls'
import { Panel } from '../ui/Panel'

type Kind = 'resume' | 'job_description' | 'notes'
interface Doc { id: string; kind: Kind; name: string; chars: number; chunks: number; active: boolean }

const KINDS: { id: Kind; label: string; help: string }[] = [
  { id: 'resume', label: 'Résumé', help: 'Answers draw on your real experience instead of generic examples.' },
  { id: 'job_description', label: 'Job description', help: 'Answers and practice questions match the role.' },
  { id: 'notes', label: 'Notes', help: 'Anything else: company research, product docs, talking points.' },
]

const ContextPanel = ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => {
  const [docs, setDocs] = useState<Doc[]>([])
  const [kind, setKind] = useState<Kind>('resume')
  const [pasted, setPasted] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const refresh = () => api<Doc[]>('/api/documents').then(setDocs).catch((e) => toast.error(e.message))
  useEffect(() => { if (isOpen) void refresh() }, [isOpen])

  const upload = async (form: FormData) => {
    setBusy(true)
    try {
      const doc = await api<Doc>('/api/documents', { method: 'POST', body: form })
      toast.success(`Added ${doc.name}`)
      setPasted('')
      setName('')
      void refresh()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const uploadFiles = (files: FileList | null) => {
    Array.from(files ?? []).forEach((file) => {
      const form = new FormData()
      form.append('kind', kind)
      form.append('file', file)
      void upload(form)
    })
  }

  const uploadText = () => {
    const form = new FormData()
    form.append('kind', kind)
    form.append('text', pasted)
    form.append('name', name || KINDS.find((k) => k.id === kind)!.label)
    void upload(form)
  }

  const toggle = async (doc: Doc) => {
    await api(`/api/documents/${doc.id}`, { method: 'PATCH', json: { active: !doc.active } })
    void refresh()
  }

  const remove = async (doc: Doc) => {
    await api(`/api/documents/${doc.id}`, { method: 'DELETE' })
    void refresh()
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    uploadFiles(e.dataTransfer.files)
  }

  return (
    <Panel isOpen={isOpen} onClose={onClose} title="Context" subtitle="Documents Wingman can use when answering. Stored only on this computer." width="w-[680px]">
      <div className="space-y-5 p-5">
        <div className="flex gap-1.5">
          {KINDS.map((k) => (
            <button key={k.id} onClick={() => setKind(k.id)} className={cn('rounded-full px-3 py-1 text-xs', kind === k.id ? 'bg-wingman-500/25 text-wingman-100' : 'bg-white/5 text-white/55 hover:bg-white/10')}>{k.label}</button>
          ))}
        </div>
        <p className="-mt-3 text-xs text-white/45">{KINDS.find((k) => k.id === kind)!.help}</p>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn('flex flex-col items-center gap-2 rounded-xl border border-dashed p-5 text-center', dragging ? 'border-wingman-400 bg-wingman-500/10' : 'border-white/15')}
        >
          <Upload className="h-5 w-5 text-white/40" />
          <p className="text-sm text-white/70">Drop a PDF, Word or text file here</p>
          <input ref={fileInput} type="file" accept=".pdf,.docx,.txt,.md" multiple hidden onChange={(e) => uploadFiles(e.target.files)} />
          <Button loading={busy} onClick={() => fileInput.current?.click()}>Choose file</Button>
        </div>

        <details className="rounded-xl bg-white/[0.03] p-3 text-sm">
          <summary className="cursor-pointer text-white/65">Or paste text</summary>
          <div className="mt-2 space-y-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (optional)" aria-label="Document name" className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white placeholder-white/30 focus:outline-none" />
            <textarea value={pasted} onChange={(e) => setPasted(e.target.value)} rows={5} placeholder="Paste the job description, your résumé or notes" aria-label="Document text" className="w-full resize-none rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-white placeholder-white/30 focus:outline-none" />
            <div className="flex justify-end"><Button variant="primary" disabled={!pasted.trim()} loading={busy} onClick={uploadText}>Add</Button></div>
          </div>
        </details>

        {docs.length === 0 ? (
          <Empty title="No documents yet">Add your résumé and the job description before an interview, or notes before a meeting.</Empty>
        ) : (
          <ul className="divide-y divide-white/5 rounded-xl bg-white/[0.03]">
            {docs.map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-4 py-2.5">
                <FileText className={cn('h-4 w-4 flex-shrink-0', d.active ? 'text-wingman-300' : 'text-white/25')} />
                <div className="min-w-0 flex-1">
                  <p className={cn('truncate text-sm', d.active ? 'text-white/85' : 'text-white/40')}>{d.name}</p>
                  <p className="text-xs text-white/40">{KINDS.find((k) => k.id === d.kind)?.label} · {Math.round(d.chars / 1000) || '<1'}k characters</p>
                </div>
                <Button variant="ghost" onClick={() => void toggle(d)}>{d.active ? 'In use' : 'Not in use'}</Button>
                <button aria-label={`Delete ${d.name}`} onClick={() => void remove(d)} className="rounded p-1.5 text-white/35 hover:bg-red-500/15 hover:text-red-300"><Trash2 className="h-3.5 w-3.5" /></button>
              </li>
            ))}
          </ul>
        )}
        <Note>Relevant passages are sent to your AI provider along with each question. Turn a document off to stop using it without deleting it.</Note>
      </div>
    </Panel>
  )
}

export default ContextPanel
