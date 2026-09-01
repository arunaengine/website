// Tabs live in `?tab=` so every tab is a link a person can share or reload
// into. An unknown or missing value reads as the fallback. A tabbed component
// rendered inside another tabbed page must take its own `key`, otherwise both
// bindings write the same query and each one reads the other's value.
import { computed, type WritableComputedRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'

export function useRouteTab(
  allowed: readonly string[],
  fallback: string,
  key = 'tab',
): WritableComputedRef<string> {
  const route = useRoute()
  const router = useRouter()
  return computed({
    get() {
      const value = route.query[key]
      return typeof value === 'string' && allowed.includes(value) ? value : fallback
    },
    set(next) {
      if (!allowed.includes(next)) return
      const query = { ...route.query }
      if (next === fallback) delete query[key]
      else query[key] = next
      void router.replace({ query })
    },
  })
}
