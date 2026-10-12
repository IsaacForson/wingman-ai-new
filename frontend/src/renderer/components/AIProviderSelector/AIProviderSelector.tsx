/**
 * Provider + model picker. Providers come from the backend status (so only
 * configured ones are selectable) and models from each provider's live /models list.
 */
import { AnimatePresence, motion } from 'framer-motion'
import { Check, ChevronDown, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { chooseProvider, useModels } from '../../hooks/useModels'
import { cn } from '../../lib/cn'
import { useAppStore } from '../../store/appStore'

const AIProviderSelector = ({ compact = false }: { compact?: boolean }) => {
  const status = useAppStore((s) => s.status)
  const [open, setOpen] = useState(false)
  const configured = status?.providers.filter((p) => p.configured) ?? []
  const current = status?.providers.find((p) => p.id === status.provider)
  const { models, live, loading, reload } = useModels(open ? status?.provider : undefined)

  if (!status) return null
  const label = current?.configured ? `${current.label.replace(' (local)', '')} · ${status.model}` : 'No AI provider'

  return (
    <div className="relative min-w-0">
      <button
        onClick={() => setOpen(!open)}
        className={cn('flex max-w-[260px] items-center gap-1 rounded-lg bg-white/5 px-2 py-1 text-[11px] hover:bg-white/10', current?.configured ? 'text-white/60' : 'text-amber-300')}
      >
        <span className="truncate">{compact ? label : current?.label}</span>
        <ChevronDown className={cn('h-3 w-3 flex-shrink-0 transition-transform', open && 'rotate-180')} />
      </button>
      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.div
              className="absolute left-0 top-full z-50 mt-1 w-72 overflow-hidden rounded-xl border border-white/10 bg-neutral-950/95 p-1.5 shadow-xl"
              initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
            >
              <p className="px-2 py-1 text-[11px] text-white/40">Provider</p>
              {configured.length === 0 && <p className="px-2 py-1.5 text-xs text-white/50">No providers set up yet. Add a key in Settings → AI.</p>}
              {configured.map((p) => (
                <button key={p.id} onClick={() => void chooseProvider(p.id)} className={cn('flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm', p.id === status.provider ? 'bg-wingman-500/15 text-white' : 'text-white/70 hover:bg-white/5')}>
                  <span>{p.label}</span>
                  {p.id === status.provider && <Check className="h-3.5 w-3.5 text-wingman-300" />}
                </button>
              ))}
              {current?.configured && (
                <>
                  <div className="mt-1.5 flex items-center justify-between px-2 py-1 text-[11px] text-white/40">
                    <span>Model{live ? '' : ' (offline list)'}</span>
                    <button onClick={() => void reload()} aria-label="Refresh models" className="hover:text-white"><RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} /></button>
                  </div>
                  <div className="max-h-48 overflow-y-auto">
                    {models.map((m) => (
                      <button key={m} onClick={() => { void chooseProvider(status.provider, m); setOpen(false) }} className={cn('w-full truncate rounded-lg px-2 py-1.5 text-left text-xs', m === status.model ? 'bg-wingman-500/15 text-white' : 'text-white/65 hover:bg-white/5')}>
                        {m}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

export default AIProviderSelector
