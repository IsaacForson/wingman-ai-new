/** Conversation history, stored by the backend in SQLite. */
import { Download, MessageSquare, Search, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import * as actions from '../../actions'
import { download } from '../../lib/download'
import { api } from '../../services/backend'
import { useAppStore } from '../../store/appStore'
import { Empty } from '../ui/controls'
import { Panel } from '../ui/Panel'

interface ConversationSummary {
  id: string
  title: string
  mode: string
  updated_at: string
  message_count: number
}

function relative(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`
  return new Date(iso).toLocaleDateString()
}


const HistoryView = ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => {
  const [items, setItems] = useState<ConversationSummary[] | null>(null)
  const [query, setQuery] = useState('')
  const activeId = useAppStore((s) => s.activeConversationId)

  useEffect(() => {
    if (!isOpen) return
    const t = setTimeout(() => {
      api<ConversationSummary[]>(`/api/conversations${query ? `?q=${encodeURIComponent(query)}` : ''}`)
        .then(setItems)
        .catch((e) => toast.error(e.message))
    }, 150)
    return () => clearTimeout(t)
  }, [isOpen, query])

  const remove = async (id: string) => {
    await api(`/api/conversations/${id}`, { method: 'DELETE' })
    setItems((list) => list?.filter((c) => c.id !== id) ?? null)
    if (id === activeId) useAppStore.getState().clearAnswers()
  }

  const exportOne = async (c: ConversationSummary) => {
    download(`${c.title.slice(0, 40) || 'conversation'}.md`, await api<string>(`/api/conversations/${c.id}/export`))
  }

  return (
    <Panel isOpen={isOpen} onClose={onClose} title="History" subtitle="Saved on this computer until you delete it" width="w-[620px]">
      <div className="border-b border-white/10 px-5 py-2.5">
        <label className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-1.5">
          <Search className="h-3.5 w-3.5 text-white/40" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search questions and answers" className="flex-1 bg-transparent text-sm text-white placeholder-white/35 focus:outline-none" />
        </label>
      </div>
      {items && items.length === 0 && (
        <Empty title={query ? 'Nothing matches that search' : 'No conversations yet'}>
          {!query && 'Questions you ask and answers you get are saved here.'}
        </Empty>
      )}
      <ul className="divide-y divide-white/5">
        {items?.map((c) => (
          <li key={c.id} className="group flex items-center gap-3 px-5 py-3 hover:bg-white/[0.03]">
            <MessageSquare className="h-4 w-4 flex-shrink-0 text-white/30" />
            <button className="min-w-0 flex-1 text-left" onClick={() => void actions.openConversation(c.id)}>
              <p className="truncate text-sm text-white/90">{c.title || 'Untitled'}</p>
              <p className="text-xs text-white/40">
                {c.mode} · {Math.ceil(c.message_count / 2)} question{c.message_count > 2 ? 's' : ''} · {relative(c.updated_at)}
                {c.id === activeId && ' · open'}
              </p>
            </button>
            <button title="Export as Markdown" aria-label="Export" onClick={() => void exportOne(c)} className="rounded p-1.5 text-white/35 opacity-0 hover:bg-white/10 hover:text-white group-hover:opacity-100">
              <Download className="h-3.5 w-3.5" />
            </button>
            <button title="Delete" aria-label="Delete" onClick={() => void remove(c.id)} className="rounded p-1.5 text-white/35 opacity-0 hover:bg-red-500/15 hover:text-red-300 group-hover:opacity-100">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

export default HistoryView
