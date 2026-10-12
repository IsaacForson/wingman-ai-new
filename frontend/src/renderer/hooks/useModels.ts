/** Live model list for a provider, and a helper to switch provider/model. */
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { api } from '../services/backend'
import { useSettingsStore } from '../store/settingsStore'

interface ModelList {
  models: string[]
  live: boolean
  error: string | null
}

export function useModels(provider: string | undefined) {
  const [state, setState] = useState<ModelList & { loading: boolean }>({ models: [], live: false, error: null, loading: false })
  const load = async (refresh = false) => {
    if (!provider) return
    setState((s) => ({ ...s, loading: true }))
    try {
      const data = await api<ModelList>(`/api/providers/${provider}/models${refresh ? '?refresh=true' : ''}`)
      setState({ ...data, loading: false })
    } catch (e) {
      setState({ models: [], live: false, error: (e as Error).message, loading: false })
    }
  }
  useEffect(() => { void load() }, [provider]) // eslint-disable-line react-hooks/exhaustive-deps
  return { ...state, reload: () => load(true) }
}

export async function chooseProvider(provider: string, model?: string | null) {
  const error = await useSettingsStore.getState().updateRuntime(model === undefined ? { provider } : { provider, model })
  if (error) toast.error(error)
}

