// The run page lends the assistant a small API while it is open. Nothing else
// reaches into the page, and the chat offers the run-form tools only while a
// bridge is registered.
import { onScopeDispose, shallowRef } from 'vue'
import type { RunFormBridge } from '@/lib/assistant/runFormTools'

const bridge = shallowRef<RunFormBridge | null>(null)

/** Registers the open run form for the life of the calling scope. */
export function provideRunFormBridge(next: RunFormBridge): void {
  bridge.value = next
  onScopeDispose(() => {
    if (bridge.value === next) bridge.value = null
  })
}

export function useAssistantRunForm() {
  return { bridge }
}
