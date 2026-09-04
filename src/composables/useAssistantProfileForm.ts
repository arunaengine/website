// The profile page lends the assistant a small API while it is open. Nothing
// else reaches into the builder, and the chat offers the profile tools only
// while a bridge is registered.
import { onScopeDispose, shallowRef } from 'vue'
import type { ProfileFormBridge } from '@/lib/assistant/profileFormTools'

const bridge = shallowRef<ProfileFormBridge | null>(null)

/** Registers the open profile builder for the life of the calling scope. */
export function provideProfileFormBridge(next: ProfileFormBridge): void {
  bridge.value = next
  onScopeDispose(() => {
    if (bridge.value === next) bridge.value = null
  })
}

export function useAssistantProfileForm() {
  return { bridge }
}
