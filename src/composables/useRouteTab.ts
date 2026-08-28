// Tabs live in `?tab=` so every tab is a link a person can share or reload
// into. An unknown or missing value reads as the fallback.
import { computed, type WritableComputedRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'

export function useRouteTab(allowed: readonly string[], fallback: string): WritableComputedRef<string> {
  const route = useRoute()
  const router = useRouter()
  return computed({
    get() {
      const value = route.query.tab
      return typeof value === 'string' && allowed.includes(value) ? value : fallback
    },
    set(next) {
      if (!allowed.includes(next)) return
      const query = { ...route.query }
      if (next === fallback) delete query.tab
      else query.tab = next
      void router.replace({ query })
    },
  })
}
