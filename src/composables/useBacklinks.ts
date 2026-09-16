// One dataset-reference lookup at a time for a surface: a newer request or a
// reset cancels the older one, so a late answer never lands on another file.
import { getCurrentInstance, onBeforeUnmount, ref } from 'vue'
import { useAruna } from '@/composables/useAruna'
import {
  preflightBacklinks,
  type BacklinkPreflightRequest,
  type BacklinkPreflightResponse,
} from '@/lib/backlinks'
import { errorMessage } from '@/lib/utils'

export function useBacklinks() {
  const { authToken } = useAruna()
  const result = ref<BacklinkPreflightResponse | null>(null)
  const error = ref<string | null>(null)
  const busy = ref(false)
  let controller: AbortController | null = null

  function reset() {
    controller?.abort()
    controller = null
    result.value = null
    error.value = null
    busy.value = false
  }

  async function load(request: BacklinkPreflightRequest, baseUrl: string) {
    reset()
    const current = new AbortController()
    controller = current
    busy.value = true
    try {
      const response = await preflightBacklinks(
        request,
        { baseUrl, token: authToken.value },
        current.signal,
      )
      if (controller !== current) return
      result.value = response
    } catch (err) {
      if (controller !== current || current.signal.aborted) return
      error.value = errorMessage(err)
    } finally {
      if (controller === current) {
        controller = null
        busy.value = false
      }
    }
  }

  if (getCurrentInstance()) onBeforeUnmount(reset)

  return { result, error, busy, load, reset }
}
