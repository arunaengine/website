import { ref, watch, type Ref } from 'vue'

export type ViewMode = 'cards' | 'table'

// Cards or table for one list, remembered per browser; without storage the choice lasts the visit.
export function useViewMode(list: string): Ref<ViewMode> {
  const key = `aruna.view.${list}`
  let stored: string | null = null
  try {
    stored = localStorage.getItem(key)
  } catch {
    stored = null
  }
  const view = ref<ViewMode>(stored === 'table' ? 'table' : 'cards')
  watch(view, (next) => {
    try {
      localStorage.setItem(key, next)
    } catch {
      // The choice still applies until the page closes.
    }
  })
  return view
}
