import { useEffect, useState } from 'react'
import { useAppStore } from '../../store/appStore'
import { useSettingsStore } from '../../store/settingsStore'
import { Note, Section, Select, Slider, Toggle } from '../ui/controls'
import { useRuntime } from './useRuntime'

export function AudioSection() {
  const { runtime, update } = useRuntime()
  const prefs = useSettingsStore()
  const transcription = useAppStore((s) => s.status?.transcription)
  const [mics, setMics] = useState<MediaDeviceInfo[]>([])

  useEffect(() => {
    navigator.mediaDevices?.enumerateDevices().then((d) => setMics(d.filter((x) => x.kind === 'audioinput'))).catch(() => {})
  }, [])

  if (!runtime) return null
  const isMac = window.wingman?.platform === 'darwin'

  return (
    <>
      <Section title="What Wingman listens to" description="Changes apply the next time you start listening.">
        <Select
          label="Microphone"
          value={prefs.micDeviceId}
          options={[{ value: 'default', label: 'System default' }, ...mics.filter((m) => m.deviceId !== 'default').map((m) => ({ value: m.deviceId, label: m.label || 'Microphone' }))]}
          onChange={(v) => prefs.setPreference('micDeviceId', v)}
        />
        <Toggle
          label="Also capture call audio"
          description="Hear the other side of Zoom, Meet or Teams calls, labelled “Them” in the transcript."
          value={prefs.captureCallAudio}
          onChange={(v) => prefs.setPreference('captureCallAudio', v)}
        />
        {prefs.captureCallAudio && isMac && (
          <Note>macOS will ask to allow Wingman under System Settings → Privacy &amp; Security → Screen &amp; System Audio Recording. Requires macOS 13 or later.</Note>
        )}
        <Toggle
          label="Answer automatically"
          description="With call audio: answer questions the other person asks. Mic only: answer what you say."
          value={runtime.auto_answer}
          onChange={(auto_answer) => void update({ auto_answer })}
        />
        <Toggle label="Start listening when Wingman opens" value={prefs.autoStartListening} onChange={(v) => prefs.setPreference('autoStartListening', v)} />
      </Section>

      <Section title="Transcription" description={transcription ? `Currently using ${transcription}.` : 'Not available yet: add a Groq or OpenAI key, or install local Whisper.'}>
        <Select
          label="Speech-to-text"
          value={runtime.transcription}
          options={[
            { value: 'auto', label: 'Automatic' },
            { value: 'groq', label: 'Groq Whisper (free tier)' },
            { value: 'openai', label: 'OpenAI Whisper' },
            { value: 'local', label: 'On this computer' },
            { value: 'off', label: 'Off' },
          ]}
          onChange={(transcription) => void update({ transcription })}
        />
        {runtime.transcription === 'local' && (
          <>
            <Select
              label="Local model size"
              description="Bigger is more accurate but slower. Downloaded on first use."
              value={runtime.local_whisper_model}
              options={['tiny', 'base', 'small', 'medium', 'large-v3'].map((v) => ({ value: v as typeof runtime.local_whisper_model, label: v }))}
              onChange={(local_whisper_model) => void update({ local_whisper_model })}
            />
            <Note>Needs the optional package: <code className="rounded bg-white/10 px-1">pip install -r backend/requirements-local.txt</code></Note>
          </>
        )}
        <Select
          label="Language"
          value={runtime.language}
          options={[['auto', 'Detect automatically'], ['en', 'English'], ['es', 'Spanish'], ['fr', 'French'], ['de', 'German'], ['pt', 'Portuguese'], ['it', 'Italian'], ['nl', 'Dutch'], ['hi', 'Hindi'], ['zh', 'Chinese'], ['ja', 'Japanese'], ['ko', 'Korean']].map(([value, label]) => ({ value, label }))}
          onChange={(language) => void update({ language })}
        />
        <Toggle label="Show words as they're spoken" description="Sends extra transcription requests while someone talks." value={runtime.live_partials} onChange={(live_partials) => void update({ live_partials })} />
      </Section>

      <Section title="Speech detection">
        <Slider label="Noise filtering" description="Higher ignores more background noise but may miss quiet speech." value={runtime.vad_aggressiveness} min={0} max={3} onChange={(vad_aggressiveness) => void update({ vad_aggressiveness })} />
        <Slider label="Pause before a sentence ends" value={runtime.endpoint_silence_ms} min={300} max={2000} step={100} format={(v) => `${(v / 1000).toFixed(1)} s`} onChange={(endpoint_silence_ms) => void update({ endpoint_silence_ms })} />
      </Section>
    </>
  )
}
