// Latches once everything a view's first paint needs has settled, so the page
// renders in one step and a later refresh never brings the skeleton back. A
// key (the route's document id, say) starts a fresh wait when it changes.
import { computed, ref, watch, type ComputedRef } from 'vue'

export function useFirstPaint(settled: () => boolean, key: () => string = () => ''): ComputedRef<boolean> {
  const paintedKey = ref<string | null>(null)
  watch([settled, key], ([done, current]) => {
    if (done) paintedKey.value = current
  }, { immediate: true })
  return computed(() => paintedKey.value === key())
}
