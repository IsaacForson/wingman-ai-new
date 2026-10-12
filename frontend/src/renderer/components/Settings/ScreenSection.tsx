import { useAppStore } from '../../store/appStore'
import { Note, Section } from '../ui/controls'

export function ScreenSection() {
  const available = useAppStore((s) => s.status?.screen_capture)
  return (
    <Section title="Ask about my screen" description="Reads the text on your screen and asks Wingman to explain or help with it.">
      <div className="flex items-center justify-between py-2.5">
        <p className="text-sm text-white">Text recognition (Tesseract)</p>
        <span className={available ? 'text-xs text-green-300' : 'text-xs text-amber-300'}>{available ? 'Ready' : 'Not installed'}</span>
      </div>
      {!available && (
        <Note tone="warning">
          Install Tesseract, then restart Wingman. macOS: <code className="rounded bg-white/10 px-1">brew install tesseract</code> · Windows: the UB Mannheim installer ·
          Linux: <code className="rounded bg-white/10 px-1">sudo apt install tesseract-ocr</code>
        </Note>
      )}
      <Note>Screen text is only read when you ask (button or shortcut). Nothing is captured in the background.</Note>
    </Section>
  )
}
