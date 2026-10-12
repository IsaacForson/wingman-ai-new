/** Highlighted code with copy and convert-to-another-language. */
import { AnimatePresence, motion } from 'framer-motion'
import { Check, ChevronDown, Code2, Copy, Loader2 } from 'lucide-react'
import { Highlight, themes } from 'prism-react-renderer'
import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { convertCode } from '../../actions'

const LANGUAGES = [
  ['python', 'Python'], ['javascript', 'JavaScript'], ['typescript', 'TypeScript'], ['java', 'Java'],
  ['csharp', 'C#'], ['cpp', 'C++'], ['c', 'C'], ['go', 'Go'], ['rust', 'Rust'], ['swift', 'Swift'],
  ['kotlin', 'Kotlin'], ['ruby', 'Ruby'], ['php', 'PHP'], ['scala', 'Scala'], ['sql', 'SQL'],
] as const

export function CodeBlock({ code, language }: { code: string; language: string }) {
  const [display, setDisplay] = useState({ code, language })
  const [converting, setConverting] = useState(false)
  const [menu, setMenu] = useState(false)
  const [copied, setCopied] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => setDisplay({ code, language }), [code, language])
  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setMenu(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const convert = async (target: string) => {
    setMenu(false)
    if (target === display.language) return
    setConverting(true)
    const result = await convertCode(display.code, display.language, target)
    setConverting(false)
    if (result) setDisplay({ code: result, language: target })
  }

  const copy = async () => {
    await navigator.clipboard.writeText(display.code)
    setCopied(true)
    toast.success('Code copied', { id: 'copy' })
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="my-2 overflow-hidden rounded-lg border border-white/10 bg-[#141625]">
      <div className="flex items-center justify-between border-b border-white/10 bg-white/5 px-3 py-1.5">
        <div className="relative" ref={ref}>
          <button onClick={() => setMenu(!menu)} disabled={converting} className="flex items-center gap-1.5 text-xs text-wingman-300 hover:text-wingman-200">
            {converting ? <><Loader2 className="h-3 w-3 animate-spin" />Converting…</> : <><Code2 className="h-3 w-3" />{display.language}<ChevronDown className="h-3 w-3" /></>}
          </button>
          <AnimatePresence>
            {menu && (
              <motion.div className="absolute left-0 top-full z-50 mt-1 max-h-60 w-40 overflow-y-auto rounded-lg border border-white/10 bg-black/95 p-1" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <p className="px-2 py-1 text-[11px] text-white/40">Convert to</p>
                {LANGUAGES.map(([value, label]) => (
                  <button key={value} onClick={() => void convert(value)} className={`w-full rounded px-2 py-1.5 text-left text-xs ${display.language === value ? 'bg-wingman-500/20 text-wingman-300' : 'text-white/70 hover:bg-white/10'}`}>
                    {label}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <button onClick={() => void copy()} aria-label="Copy code" className="text-white/40 hover:text-white">
          {copied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
        </button>
      </div>
      <Highlight theme={themes.nightOwl} code={display.code} language={display.language}>
        {({ className, style, tokens, getLineProps, getTokenProps }) => (
          <pre className={`${className} overflow-x-auto p-3 text-xs`} style={{ ...style, background: 'transparent', margin: 0 }}>
            {tokens.map((line, i) => (
              <div key={i} {...getLineProps({ line })}>
                <span className="inline-block w-7 select-none pr-3 text-right text-white/20">{i + 1}</span>
                {line.map((token, key) => <span key={key} {...getTokenProps({ token })} />)}
              </div>
            ))}
          </pre>
        )}
      </Highlight>
    </div>
  )
}
