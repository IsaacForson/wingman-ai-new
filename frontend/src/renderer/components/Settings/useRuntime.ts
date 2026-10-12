import toast from 'react-hot-toast'
import type { RuntimeUpdate } from '../../types/generated'
import { useSettingsStore } from '../../store/settingsStore'

/** Current backend runtime config plus a setter that reports errors. */
export function useRuntime() {
  const runtime = useSettingsStore((s) => s.runtime)
  const update = async (patch: RuntimeUpdate) => {
    const error = await useSettingsStore.getState().updateRuntime(patch)
    if (error) toast.error(error)
  }
  return { runtime, update }
}
