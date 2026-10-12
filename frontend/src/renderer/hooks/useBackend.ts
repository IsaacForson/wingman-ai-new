/** Connects to the backend once and routes server events into the stores. */
import { useEffect } from 'react'
import toast from 'react-hot-toast'
import * as actions from '../actions'
import { audioCapture } from '../services/audio'
import { resetConnection } from '../services/backend'
import { connectSocket, disconnectSocket, onEvent } from '../services/socket'
import { useAppStore } from '../store/appStore'
import { migrateLegacySettings, useSettingsStore } from '../store/settingsStore'

export function useBackend(): void {
  useEffect(() => {
    let cancelled = false
    const cleanups: (() => void)[] = []
    const app = useAppStore.getState()

    async function start() {
      app.setConnection('connecting')
      let socket
      try {
        socket = await connectSocket()
      } catch (err) {
        app.setConnection('error', (err as Error).message)
        return
      }
      if (cancelled) return

      socket.on('connect', async () => {
        app.setConnection('connected')
        try {
          await useSettingsStore.getState().loadRuntime()
          const moved = await migrateLegacySettings()
          if (moved) toast.success(`Moved ${moved} API key${moved > 1 ? 's' : ''} into secure storage`)
          if (useSettingsStore.getState().autoStartListening && !useAppStore.getState().isListening) {
            await actions.startListening()
          }
        } catch (err) {
          toast.error((err as Error).message)
        }
      })
      socket.on('disconnect', () => app.setConnection('disconnected'))
      socket.on('connect_error', (err: Error) =>
        app.setConnection('error', err.message === 'unauthorized' ? 'The backend rejected our token. Restart Wingman.' : err.message),
      )

      cleanups.push(
        onEvent('status', (s) => {
          useAppStore.getState().setStatus(s)
          // Backend stopped listening (e.g. after a restart): release the mic too.
          if (!s.listening && audioCapture.channels.length) {
            void audioCapture.stop()
            useAppStore.getState().setAudioChannels([])
          }
        }),
        onEvent('transcript', (e) => useAppStore.getState().upsertTranscript(e)),
        onEvent('answer_started', (e) => {
          const state = useAppStore.getState()
          state.answerStarted(e)
          if (state.islandState === 'nano' || state.islandState === 'mini' || state.islandState === 'normal') {
            state.setIslandState('expanded')
          }
        }),
        onEvent('answer_chunk', (e) => useAppStore.getState().answerChunk(e)),
        onEvent('answer_done', (e) => {
          useAppStore.getState().answerDone(e)
          if (e.fell_back_from) toast(`${e.fell_back_from} failed, answered with ${e.provider}`, { id: 'fallback' })
        }),
        onEvent('answer_error', (e) => useAppStore.getState().answerError(e)),
        onEvent('notice', (n) => {
          if (n.level === 'error') toast.error(n.message, { id: n.message, duration: 6000 })
          else toast(n.message, { id: n.message })
        }),
      )
    }

    void start()

    const w = window.wingman
    if (w) {
      cleanups.push(
        w.on.setMode((mode) => void actions.setMode(mode as never)),
        w.on.togglePause(() => void actions.togglePause()),
        w.on.toggleListening(() => void actions.toggleListening()),
        w.on.captureScreen(() => void actions.captureScreen()),
        w.on.openSettings(() => useAppStore.getState().setPanel('settings')),
        w.on.openCommandPalette(() => useAppStore.getState().setPanel('commandPalette')),
        w.on.emergencyHide(() => void actions.setPaused(true)),
        w.backend.onError((message) => {
          useAppStore.getState().setConnection('error', message)
          toast.error(message, { duration: 10000 })
        }),
        w.backend.onRestarted(() => {
          toast('Backend restarted', { id: 'backend-restart' })
          disconnectSocket()
          resetConnection()
          if (!cancelled) void start()
        }),
      )
      useSettingsStore.getState().applyWindowPreferences()
    }

    return () => {
      cancelled = true
      cleanups.forEach((fn) => fn())
      void audioCapture.stop()
      disconnectSocket()
    }
  }, [])
}
