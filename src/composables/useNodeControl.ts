// Starts and pauses the node the shell embeds. The shell has no restart
// command, so the settings flag is the only switch there is: pausing stops the
// node and clearing it starts the node again.
import { ref } from 'vue'
import { useDeviceStatus } from '@/composables/useDeviceStatus'
import { errorMessage } from '@/lib/utils'

export function useNodeControl() {
  const { refresh } = useDeviceStatus()
  const busy = ref(false)
  const error = ref<string | null>(null)

  async function setPaused(paused: boolean): Promise<void> {
    if (busy.value) return
    busy.value = true
    error.value = null
    try {
      const { setNodeSettings } = await import('@/lib/desktopBridge')
      await setNodeSettings({ paused })
      await refresh()
    } catch (err) {
      error.value = errorMessage(err)
    } finally {
      busy.value = false
    }
  }

  return { busy, error, start: () => setPaused(false), pause: () => setPaused(true) }
}
