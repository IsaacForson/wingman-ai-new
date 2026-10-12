import { Copy, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { api } from '../../services/backend'
import { Button, Note, Section } from '../ui/controls'

export function ExtensionSection() {
  const [token, setToken] = useState<string | null>(null)

  const load = async (rotate = false) => {
    const data = await api<{ token: string }>(`/api/extension-token${rotate ? '?rotate=true' : ''}`)
    setToken(data.token)
    if (rotate) toast.success('New pairing key created. Paste it into the extension again.')
  }
  useEffect(() => { void load().catch(() => {}) }, [])

  return (
    <>
      <Section title="Pair the browser extension" description="The extension lets you select text on any page and ask Wingman to explain, summarize or reply to it.">
        <div className="py-2.5">
          <p className="mb-1.5 text-sm text-white">Pairing key</p>
          <div className="flex gap-2">
            <input readOnly value={token ? `${token.slice(0, 6)}••••••••${token.slice(-4)}` : '…'} aria-label="Pairing key" className="min-w-0 flex-1 rounded-lg bg-white/10 px-2.5 py-1.5 font-mono text-xs text-white/70" />
            <Button disabled={!token} onClick={() => { void navigator.clipboard.writeText(token!); toast.success('Pairing key copied') }}><Copy className="h-3.5 w-3.5" />Copy</Button>
            <Button variant="ghost" onClick={() => void load(true)}><RefreshCw className="h-3.5 w-3.5" />New key</Button>
          </div>
        </div>
      </Section>
      <Note>
        Install: open chrome://extensions, turn on Developer mode, choose “Load unpacked” and select the <code className="rounded bg-white/10 px-1">chrome-extension</code> folder. Then open the
        extension's options and paste the pairing key. The key only allows asking about selected text; it can't read your history or settings.
      </Note>
    </>
  )
}
