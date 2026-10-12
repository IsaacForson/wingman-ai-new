/**
 * App state. Server-owned state (mode, paused, listening, providers) comes from
 * the backend's `status` event; the UI never keeps its own copy that can drift.
 */
import { create } from 'zustand'
import type {
  AnswerChunk, AnswerDone, AnswerError, AnswerStarted, StatusEvent, TranscriptEvent,
} from '../types/generated'

export type IslandState = 'nano' | 'mini' | 'normal' | 'expanded' | 'fullscreen'
export type OperatingMode = StatusEvent['mode']
export type Panel = 'settings' | 'commandPalette' | 'history' | 'practice' | 'meeting' | 'context' | 'usage'
export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error'

export interface AnswerEntry {
  id: string
  question: string
  answer: string
  status: 'streaming' | 'done' | 'error' | 'cancelled'
  source: AnswerStarted['source']
  conversationId: string
  provider?: string | null
  model?: string | null
  ttftMs?: number | null
  fellBackFrom?: string | null
  error?: string
  rating?: -1 | 1 | null
}

export interface TranscriptLine {
  id: string
  speaker: TranscriptEvent['speaker']
  text: string
  final: boolean
  at: number
}

const MAX_ANSWERS = 60
const MAX_TRANSCRIPT = 200

interface AppState {
  islandState: IslandState
  setIslandState: (state: IslandState) => void

  connection: ConnectionState
  connectionError: string | null
  isConnected: boolean
  setConnection: (state: ConnectionState, error?: string | null) => void

  status: StatusEvent | null
  mode: OperatingMode
  isPaused: boolean
  isListening: boolean
  setStatus: (status: StatusEvent) => void

  audioChannels: ('me' | 'them')[]
  setAudioChannels: (channels: ('me' | 'them')[]) => void

  transcript: TranscriptLine[]
  upsertTranscript: (event: TranscriptEvent) => void
  clearTranscript: () => void

  answers: AnswerEntry[]
  isProcessing: boolean
  activeConversationId: string | null
  answerStarted: (e: AnswerStarted) => void
  answerChunk: (e: AnswerChunk) => void
  answerDone: (e: AnswerDone) => void
  answerError: (e: AnswerError) => void
  setRating: (answerId: string, rating: -1 | 1 | null) => void
  loadConversation: (id: string, entries: AnswerEntry[]) => void
  clearAnswers: () => void

  panel: Panel | null
  setPanel: (panel: Panel | null) => void
}

const updateAnswer = (answers: AnswerEntry[], id: string, patch: (a: AnswerEntry) => Partial<AnswerEntry>) =>
  answers.map((a) => (a.id === id ? { ...a, ...patch(a) } : a))

const streaming = (answers: AnswerEntry[]) => answers.some((a) => a.status === 'streaming')

export const useAppStore = create<AppState>((set) => ({
  islandState: 'normal',
  setIslandState: (islandState) => set({ islandState }),

  connection: 'connecting',
  connectionError: null,
  isConnected: false,
  setConnection: (connection, error = null) =>
    set({ connection, connectionError: error, isConnected: connection === 'connected' }),

  status: null,
  mode: 'interview',
  isPaused: false,
  isListening: false,
  setStatus: (status) => set({ status, mode: status.mode, isPaused: status.paused, isListening: status.listening }),

  audioChannels: [],
  setAudioChannels: (audioChannels) => set({ audioChannels }),

  transcript: [],
  upsertTranscript: (e) =>
    set((state) => {
      const line: TranscriptLine = { id: e.segment_id, speaker: e.speaker, text: e.text, final: e.final, at: Date.now() }
      const index = state.transcript.findIndex((l) => l.id === e.segment_id)
      if (index >= 0) {
        if (e.final && !e.text) return { transcript: state.transcript.filter((l) => l.id !== e.segment_id) }
        const transcript = [...state.transcript]
        transcript[index] = line
        return { transcript }
      }
      if (!e.text) return state
      return { transcript: [...state.transcript, line].slice(-MAX_TRANSCRIPT) }
    }),
  clearTranscript: () => set({ transcript: [] }),

  answers: [],
  isProcessing: false,
  activeConversationId: null,
  answerStarted: (e) =>
    set((state) => {
      const answers = [
        ...state.answers.filter((a) => a.id !== e.answer_id),
        { id: e.answer_id, question: e.question, answer: '', status: 'streaming' as const, source: e.source, conversationId: e.conversation_id },
      ].slice(-MAX_ANSWERS)
      return { answers, isProcessing: true, activeConversationId: e.conversation_id }
    }),
  answerChunk: (e) =>
    set((state) => ({ answers: updateAnswer(state.answers, e.answer_id, (a) => ({ answer: a.answer + e.text })) })),
  answerDone: (e) =>
    set((state) => {
      const answers = updateAnswer(state.answers, e.answer_id, () => ({
        answer: e.answer,
        status: e.cancelled ? 'cancelled' : 'done',
        provider: e.provider,
        model: e.model,
        ttftMs: e.ttft_ms,
        fellBackFrom: e.fell_back_from,
      }))
      return { answers, isProcessing: streaming(answers) }
    }),
  answerError: (e) =>
    set((state) => {
      const answers = updateAnswer(state.answers, e.answer_id, () => ({ status: 'error', error: e.message }))
      return { answers, isProcessing: streaming(answers) }
    }),
  setRating: (answerId, rating) => set((state) => ({ answers: updateAnswer(state.answers, answerId, () => ({ rating })) })),
  loadConversation: (id, entries) => set({ activeConversationId: id, answers: entries, isProcessing: false }),
  clearAnswers: () => set({ answers: [], activeConversationId: null, isProcessing: false }),

  panel: null,
  setPanel: (panel) => set({ panel }),
}))
