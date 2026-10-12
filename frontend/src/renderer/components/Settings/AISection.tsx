import { Check, ExternalLink } from 'lucide-react'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { api } from '../../services/backend'
import { useAppStore } from '../../store/appStore'
import type { ProviderInfo } from '../../types/generated'
import { useModels } from '../../hooks/useModels'
import { Button, Note, Section, Select, Slider, Toggle } from '../ui/controls'
import { useRuntime } from './useRuntime'

type KeyStatus = Record<string, { configured: boolean; hint: string | null }>

export function AISection() {
  const status = useAppStore((s) => s.status)
  const { runtime, update } = useRuntime()
  const [keys, setKeys] = useState<KeyStatus>({})
  const [encrypted, setEncrypted] = useState(true)
  const models = useModels(status?.provider)

  const refreshKeys = async () => {
    const s = await window.wingman?.secrets.status()
    if (s) {
      setKeys(s.keys)
      setEncrypted(s.encrypted)
    }
  }
  useEffect(() => { void refreshKeys() }, [])

  if (!status || !runtime) return <p className="text-sm text-white/50">Connecting to the backend…</p>
  const configured = status.providers.filter((p) => p.configured)
  const cloud = status.providers.filter((p) => !p.local)

  return (
    <>
      <Section title="Answering with" description="Wingman uses this provider first.">
        <Select
          label="Provider"
          value={status.provider}
          options={(configured.length ? configured : status.providers.filter((p) => p.id === status.provider)).map((p) => ({ value: p.id, label: p.label }))}
          onChange={(provider) => void update({ provider })}
        />
        <Select
          label="Model"
          description={models.error ?? (models.live ? 'Live list from the provider' : undefined)}
          value={status.model}
          options={Array.from(new Set([status.model, ...models.models])).map((m) => ({ value: m, label: m }))}
          onChange={(model) => void update({ model })}
        />
        <Toggle
          label="Fall back to other providers"
          description="If the provider fails before answering, try the next one you've set up."
          value={runtime.fallback}
          onChange={(fallback) => void update({ fallback })}
        />
        <Slider label="Creativity" description="Lower is more focused and consistent." value={runtime.temperature} min={0} max={1.2} step={0.1} format={(v) => v.toFixed(1)} onChange={(temperature) => void update({ temperature })} />
        <Slider label="Maximum answer length" value={runtime.max_tokens} min={256} max={8192} step={256} format={(v) => `${v} tokens`} onChange={(max_tokens) => void update({ max_tokens })} />
      </Section>

      <Section title="API keys" description={encrypted ? 'Stored encrypted with your system keychain. Never shown again after saving.' : undefined}>
        {!window.wingman && <Note tone="warning">Open Wingman as the desktop app to manage keys.</Note>}
        {!encrypted && <Note tone="warning">Your system has no keychain available, so keys are kept only until Wingman quits.</Note>}
        {cloud.map((p) => <KeyRow key={p.id} provider={p} status={keys[p.id]} onSaved={refreshKeys} />)}
      </Section>

      <Section title="Local models" description="Run models on this computer with Ollama. No key needed.">
        <OllamaRow url={runtime.ollama_base_url} onSave={(ollama_base_url) => void update({ ollama_base_url })} />
      </Section>
    </>
  )
}

function KeyRow({ provider, status, onSaved }: { provider: ProviderInfo; status?: { configured: boolean; hint: string | null }; onSaved: () => void }) {
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState<'save' | 'test' | 'remove' | null>(null)

  const save = async (key: string | null) => {
    setBusy(key ? 'save' : 'remove')
    try {
      await window.wingman?.secrets.set(provider.id, key)
      setValue('')
      onSaved()
      toast.success(key ? `${provider.label} key saved` : `${provider.label} key removed`)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const test = async () => {
    setBusy('test')
    const result = await api<{ ok: boolean; error?: string; model?: string; ttft_ms?: number }>(`/api/providers/${provider.id}/test`, { method: 'POST' })
      .catch((e) => ({ ok: false, error: (e as Error).message }) as { ok: boolean; error?: string; model?: string; ttft_ms?: number })
    setBusy(null)
    if (result.ok) toast.success(`${provider.label} works (${result.model}, ${((result.ttft_ms ?? 0) / 1000).toFixed(1)}s)`)
    else toast.error(result.error ?? 'Test failed')
  }

  return (
    <div className="py-2.5">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-sm text-white">{provider.label}</span>
        {provider.free_tier && <span className="rounded bg-green-500/15 px-1.5 py-0.5 text-[10px] text-green-300">free tier</span>}
        {status?.configured && <span className="flex items-center gap-1 text-xs text-white/45"><Check className="h-3 w-3 text-green-400" />saved, ends in {status.hint}</span>}
        {provider.key_url && (
          <button onClick={() => void window.wingman?.app.openExternal(provider.key_url)} className="ml-auto flex items-center gap-1 text-xs text-wingman-300 hover:text-wingman-200">
            Get a key <ExternalLink className="h-3 w-3" />
          </button>
        )}
      </div>
      <div className="flex gap-2">
        <input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && value.trim() && void save(value)}
          placeholder={status?.configured ? 'Paste a new key to replace it' : 'Paste API key'}
          aria-label={`${provider.label} API key`}
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/10 px-2.5 py-1.5 font-mono text-xs text-white focus:border-wingman-500 focus:outline-none"
        />
        <Button variant="primary" disabled={!value.trim()} loading={busy === 'save'} onClick={() => void save(value)}>Save</Button>
        {status?.configured && <Button loading={busy === 'test'} onClick={() => void test()}>Test</Button>}
        {status?.configured && <Button variant="ghost" loading={busy === 'remove'} onClick={() => void save(null)}>Remove</Button>}
      </div>
    </div>
  )
}

function OllamaRow({ url, onSave }: { url: string; onSave: (url: string) => void }) {
  const [value, setValue] = useState(url)
  useEffect(() => setValue(url), [url])
  return (
    <div className="flex items-center gap-2 py-2.5">
      <span className="text-sm text-white">Ollama address</span>
      <input value={value} onChange={(e) => setValue(e.target.value)} aria-label="Ollama address" className="ml-auto w-60 rounded-lg border border-white/10 bg-white/10 px-2.5 py-1.5 text-xs text-white focus:border-wingman-500 focus:outline-none" />
      <Button disabled={value === url} onClick={() => onSave(value)}>Save</Button>
    </div>
  )
}
