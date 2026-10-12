/** Real latency and token usage per provider and model, from the backend's records. */
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { cn } from '../../lib/cn'
import { api } from '../../services/backend'
import { Empty } from '../ui/controls'
import { Panel } from '../ui/Panel'

interface ModelUsage {
  provider: string; model: string; requests: number; errors: number
  ttft_p50_ms: number | null; ttft_p95_ms: number | null; total_p50_ms: number | null
  input_tokens: number; output_tokens: number
}
interface Usage { days: number; models: ModelUsage[]; recent_errors: { at: string; provider: string; model: string; error: string }[] }

const sec = (ms: number | null) => (ms == null ? '–' : `${(ms / 1000).toFixed(1)}s`)
const num = (n: number) => (n >= 10000 ? `${Math.round(n / 1000)}k` : n.toLocaleString())

const UsagePanel = ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => {
  const [days, setDays] = useState(7)
  const [usage, setUsage] = useState<Usage | null>(null)

  useEffect(() => {
    if (isOpen) api<Usage>(`/api/usage?days=${days}`).then(setUsage).catch((e) => toast.error(e.message))
  }, [isOpen, days])

  return (
    <Panel isOpen={isOpen} onClose={onClose} title="Usage and speed" subtitle="Measured on this computer for every request" width="w-[760px]"
      actions={
        <div className="flex rounded-lg bg-white/5 p-0.5 text-xs">
          {[1, 7, 30].map((d) => (
            <button key={d} onClick={() => setDays(d)} className={cn('rounded-md px-2.5 py-1', days === d ? 'bg-white/15 text-white' : 'text-white/50')}>{d === 1 ? '24 h' : `${d} days`}</button>
          ))}
        </div>
      }
    >
      {!usage ? null : usage.models.length === 0 ? (
        <Empty title="No requests in this period" />
      ) : (
        <div className="space-y-5 p-5">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-white/45">
                <tr>
                  <th className="pb-2 font-normal">Provider · model</th>
                  <th className="pb-2 text-right font-normal">Requests</th>
                  <th className="pb-2 text-right font-normal">Failed</th>
                  <th className="pb-2 text-right font-normal" title="Time until the first words appear">First words (typical / slow)</th>
                  <th className="pb-2 text-right font-normal">Full answer</th>
                  <th className="pb-2 text-right font-normal">Tokens in / out</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 tabular-nums">
                {usage.models.map((m) => (
                  <tr key={`${m.provider}-${m.model}`}>
                    <td className="py-2 pr-3"><span className="text-white/85">{m.provider}</span> <span className="text-xs text-white/45">{m.model}</span></td>
                    <td className="py-2 text-right text-white/75">{m.requests}</td>
                    <td className={cn('py-2 text-right', m.errors ? 'text-red-300' : 'text-white/40')}>{m.errors}</td>
                    <td className="py-2 text-right text-white/75">{sec(m.ttft_p50_ms)} / {sec(m.ttft_p95_ms)}</td>
                    <td className="py-2 text-right text-white/75">{sec(m.total_p50_ms)}</td>
                    <td className="py-2 text-right text-white/60">{num(m.input_tokens)} / {num(m.output_tokens)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-white/40">Token counts appear for providers that report them while streaming. Check each provider's dashboard for billing.</p>
          {usage.recent_errors.length > 0 && (
            <section>
              <h3 className="mb-1.5 text-sm text-white/70">Recent errors</h3>
              <ul className="space-y-1 text-xs">
                {usage.recent_errors.map((e, i) => (
                  <li key={i} className="text-white/55"><span className="text-white/35">{new Date(e.at).toLocaleString()} · {e.provider}</span> {e.error}</li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </Panel>
  )
}

export default UsagePanel
