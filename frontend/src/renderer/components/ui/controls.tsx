/** Small form controls used across panels. */
import { motion } from 'framer-motion'
import { AlertCircle, Loader2 } from 'lucide-react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/cn'

export function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <div>
        <h3 className="text-sm font-medium text-white/85">{title}</h3>
        {description && <p className="text-xs text-white/45">{description}</p>}
      </div>
      <div className="space-y-1 rounded-xl bg-white/[0.03] px-3 py-1">{children}</div>
    </section>
  )
}

function Row({ label, description, children, disabled }: { label: string; description?: ReactNode; children: ReactNode; disabled?: boolean }) {
  return (
    <div className={cn('flex items-center justify-between gap-4 py-2.5', disabled && 'opacity-50')}>
      <div className="min-w-0">
        <p className="text-sm text-white">{label}</p>
        {description && <p className="text-xs text-white/45">{description}</p>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  )
}

export function Toggle({ label, description, value, onChange, disabled }: {
  label: string; description?: ReactNode; value: boolean; onChange: (v: boolean) => void; disabled?: boolean
}) {
  return (
    <Row label={label} description={description} disabled={disabled}>
      <button
        role="switch"
        aria-checked={value}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!value)}
        className={cn('h-6 w-11 rounded-full p-0.5 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-wingman-400', value ? 'bg-wingman-500' : 'bg-white/20')}
      >
        <motion.div className="h-5 w-5 rounded-full bg-white" animate={{ x: value ? 20 : 0 }} transition={{ type: 'spring', stiffness: 500, damping: 32 }} />
      </button>
    </Row>
  )
}

export function Select<T extends string>({ label, description, value, options, onChange, disabled }: {
  label: string; description?: ReactNode; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; disabled?: boolean
}) {
  return (
    <Row label={label} description={description} disabled={disabled}>
      <select
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as T)}
        className="max-w-[240px] rounded-lg border border-white/10 bg-white/10 px-2.5 py-1.5 text-sm text-white focus:border-wingman-500 focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-neutral-900">{o.label}</option>
        ))}
      </select>
    </Row>
  )
}

export function Slider({ label, description, value, min, max, step = 1, format, onChange, disabled }: {
  label: string; description?: ReactNode; value: number; min: number; max: number; step?: number
  format?: (v: number) => string; onChange: (v: number) => void; disabled?: boolean
}) {
  return (
    <div className={cn('py-2.5', disabled && 'opacity-50')}>
      <div className="mb-2 flex items-center justify-between">
        <div>
          <p className="text-sm text-white">{label}</p>
          {description && <p className="text-xs text-white/45">{description}</p>}
        </div>
        <span className="text-sm tabular-nums text-wingman-300">{format ? format(value) : value}</span>
      </div>
      <input
        type="range" aria-label={label} min={min} max={max} step={step} value={value} disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/20 accent-wingman-500"
      />
    </div>
  )
}

export function Button({ variant = 'secondary', loading, className, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; loading?: boolean
}) {
  const styles = {
    primary: 'bg-wingman-500 text-white hover:bg-wingman-600',
    secondary: 'bg-white/10 text-white/85 hover:bg-white/20',
    danger: 'bg-red-500/15 text-red-300 hover:bg-red-500/25',
    ghost: 'text-white/60 hover:bg-white/10 hover:text-white',
  }[variant]
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={cn('inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-wingman-400', styles, className)}
    >
      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {children}
    </button>
  )
}

export function Note({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warning' }) {
  return (
    <div className={cn('flex items-start gap-2.5 rounded-lg p-3 text-xs', tone === 'warning' ? 'bg-amber-500/10 text-amber-100/85' : 'bg-white/5 text-white/55')}>
      <AlertCircle className={cn('mt-0.5 h-3.5 w-3.5 flex-shrink-0', tone === 'warning' ? 'text-amber-400' : 'text-white/40')} />
      <div>{children}</div>
    </div>
  )
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <p className="text-sm text-white/70">{title}</p>
      {children && <div className="max-w-sm text-xs text-white/45">{children}</div>}
    </div>
  )
}
