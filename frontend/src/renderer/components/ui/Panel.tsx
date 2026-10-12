/** Modal shell shared by Settings, History, Practice, Meeting, Context and Usage. */
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

interface PanelProps {
  isOpen: boolean
  onClose: () => void
  title: string
  subtitle?: ReactNode
  actions?: ReactNode
  width?: string
  children: ReactNode
}

export function Panel({ isOpen, onClose, title, subtitle, actions, width = 'w-[760px]', children }: PanelProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div className="fixed inset-0 z-50 flex items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            role="dialog"
            aria-label={title}
            className={cn('relative flex max-h-[82vh] max-w-[94vw] flex-col overflow-hidden rounded-2xl border border-white/10 bg-neutral-950/95 shadow-2xl', width)}
            initial={{ scale: 0.97, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.97, opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
          >
            <header className="flex items-center gap-3 border-b border-white/10 px-5 py-3.5">
              <div className="min-w-0 flex-1">
                <h2 className="text-[15px] font-semibold text-white">{title}</h2>
                {subtitle && <p className="truncate text-xs text-white/45">{subtitle}</p>}
              </div>
              {actions}
              <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-white/50 hover:bg-white/10 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
