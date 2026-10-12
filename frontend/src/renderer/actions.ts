/**
 * Every user action goes through here, so the island, command palette, tray and
 * shortcuts all behave the same way and always reach the backend.
 */
import toast from 'react-hot-toast'
import { api } from './services/backend'
import { audioCapture } from './services/audio'
import { call } from './services/socket'
import { useAppStore, type AnswerEntry, type OperatingMode } from './store/appStore'
import { useSettingsStore } from './store/settingsStore'

const app = () => useAppStore.getState()

function report(error: string | undefined | null): boolean {
  if (error) toast.error(error)
  return !error
}

export async function ask(question: string, source: 'manual' | 'regenerate' = 'manual'): Promise<boolean> {
  const text = question.trim()
  if (!text) return false
  const { activeConversationId, mode } = app()
  if (app().islandState !== 'fullscreen') app().setIslandState('expanded')
  const ack = await call('ask', { question: text, conversation_id: activeConversationId, mode, source })
  return report(ack.ok ? null : ack.error)
}

export async function cancelAnswer(): Promise<void> {
  await call('cancel', {})
}

export async function startListening(options: { systemAudio?: boolean } = {}): Promise<boolean> {
  const prefs = useSettingsStore.getState()
  const { channels, warnings } = await audioCapture.start({
    micDeviceId: prefs.micDeviceId,
    systemAudio: options.systemAudio ?? prefs.captureCallAudio,
  })
  warnings.forEach((w) => toast.error(w, { duration: 6000 }))
  if (!channels.length) return false
  const ack = await call('listen', { channels })
  if (!report(ack.ok ? null : ack.error)) {
    await audioCapture.stop()
    return false
  }
  app().setAudioChannels(channels)
  return true
}

export async function stopListening(): Promise<void> {
  await audioCapture.stop()
  app().setAudioChannels([])
  await call('listen', { channels: [] })
}

export async function toggleListening(): Promise<void> {
  if (app().isListening) await stopListening()
  else await startListening()
}

export async function setPaused(paused: boolean): Promise<void> {
  const ack = await call('pause', { paused })
  report(ack.ok ? null : ack.error)
}

export const togglePause = () => setPaused(!app().isPaused)

export async function setMode(mode: OperatingMode): Promise<void> {
  const error = await useSettingsStore.getState().updateRuntime({ mode })
  if (report(error)) toast.success(`${mode[0].toUpperCase()}${mode.slice(1)} mode`, { id: 'mode' })
}

export async function captureScreen(): Promise<void> {
  const id = toast.loading('Reading your screen…')
  const ack = await call('capture_screen', {}, 60000)
  toast.dismiss(id)
  if (report(ack.ok ? null : ack.error) && app().islandState !== 'fullscreen') app().setIslandState('expanded')
}

export async function newConversation(): Promise<void> {
  await call('new_conversation', {})
  app().clearAnswers()
  app().clearTranscript()
}

interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string
  source: string | null
  answer_id: string | null
  provider: string | null
  model: string | null
  rating: -1 | 1 | null
}

export async function openConversation(id: string): Promise<void> {
  const conv = await api<{ id: string; mode: OperatingMode; messages: ConversationMessage[] }>(`/api/conversations/${id}`)
  const entries: AnswerEntry[] = []
  for (const m of conv.messages) {
    if (m.role === 'user') {
      entries.push({ id: m.answer_id ?? crypto.randomUUID(), question: m.content, answer: '', status: 'done', source: (m.source as AnswerEntry['source']) ?? 'manual', conversationId: id })
    } else if (entries.length) {
      Object.assign(entries[entries.length - 1], { answer: m.content, provider: m.provider, model: m.model, rating: m.rating })
    }
  }
  const ack = await call('open_conversation', { conversation_id: id })
  if (!report(ack.ok ? null : ack.error)) return
  app().loadConversation(id, entries)
  app().setPanel(null)
  app().setIslandState('expanded')
}

export async function rateAnswer(answerId: string, rating: -1 | 1): Promise<void> {
  const current = app().answers.find((a) => a.id === answerId)?.rating
  const next = current === rating ? null : rating
  app().setRating(answerId, next)
  await api(`/api/answers/${answerId}/feedback`, { method: 'PUT', json: { rating: next } }).catch((e) => toast.error(e.message))
}

export async function convertCode(code: string, from: string, to: string): Promise<string | null> {
  const ack = await call('convert_code', { code, from, to }, 60000)
  return report(ack.ok ? null : ack.error) ? (ack.code as string) : null
}
