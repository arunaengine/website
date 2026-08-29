// The dataset editor lends the assistant a small API while it is open. Nothing
// else reaches into the view, and the chat panel offers the editor tools only
// while a bridge is registered.
import { onScopeDispose, shallowRef } from 'vue'
import type { EditorBridge } from '@/lib/assistant/editorTools'

const bridge = shallowRef<EditorBridge | null>(null)

/** Registers the open editor for the life of the calling scope. */
export function provideEditorBridge(next: EditorBridge): void {
  bridge.value = next
  onScopeDispose(() => {
    if (bridge.value === next) bridge.value = null
  })
}

export function useAssistantEditor() {
  return { bridge }
}
