// The notebook page lends the assistant a small API while it is open. Nothing
// else reaches into the notebook, and the chat offers the notebook tools only
// while a bridge is registered.
import { onScopeDispose, shallowRef } from 'vue'
import type { NotebookBridge } from '@/lib/assistant/notebookTools'

const bridge = shallowRef<NotebookBridge | null>(null)

/** Registers the open notebook for the life of the calling scope. */
export function provideNotebookBridge(next: NotebookBridge): void {
  bridge.value = next
  onScopeDispose(() => {
    if (bridge.value === next) bridge.value = null
  })
}

export function useAssistantNotebook() {
  return { bridge }
}
