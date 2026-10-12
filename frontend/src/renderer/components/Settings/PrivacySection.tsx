import toast from 'react-hot-toast'
import { api } from '../../services/backend'
import { useAppStore } from '../../store/appStore'
import { useSettingsStore } from '../../store/settingsStore'
import { Button, Note, Section, Toggle } from '../ui/controls'

export function PrivacySection() {
  const s = useSettingsStore()

  const deleteHistory = async () => {
    if (!confirm('Delete every saved conversation? This cannot be undone.')) return
    await api('/api/conversations', { method: 'DELETE' })
    useAppStore.getState().clearAnswers()
    toast.success('Conversation history deleted')
  }

  return (
    <>
      <Section title="Screen sharing">
        <Toggle
          label="Hide Wingman from screen sharing and recordings"
          description="Uses the operating system's content protection. Some capture tools ignore it."
          value={s.hideFromScreenCapture}
          onChange={(v) => s.setPreference('hideFromScreenCapture', v)}
        />
      </Section>
      <Section title="Your data" description="Conversations, documents, practice results and meeting notes are stored only on this computer, in ~/.wingman.">
        <Note>Questions, transcripts and document excerpts are sent to the AI and transcription providers you choose. Use Ollama and local Whisper to keep everything on this machine.</Note>
        <div className="flex items-center justify-between py-2.5">
          <p className="text-sm text-white">Delete all conversation history</p>
          <Button variant="danger" onClick={() => void deleteHistory()}>Delete history</Button>
        </div>
      </Section>
      <Section title="Application">
        <div className="flex items-center justify-between py-2.5">
          <p className="text-sm text-white">Quit Wingman</p>
          <Button onClick={() => void window.wingman?.app.quit()}>Quit</Button>
        </div>
      </Section>
    </>
  )
}
