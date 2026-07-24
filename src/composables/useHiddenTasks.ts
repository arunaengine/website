import { computed, ref } from 'vue'

// Client-side task "delete": the TES facade has no delete endpoint yet, so a
// deleted run is only hidden from THIS browser's listing (ids in localStorage).
// The Deleted filter chip in TasksPanel is the escape hatch that restores them.
const STORAGE_KEY = 'aruna.hiddenTasks.v1'

function load(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

const hiddenIds = ref<string[]>(load())

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(hiddenIds.value))
  } catch {
    // Quota/privacy-mode failures degrade to session-only hiding.
  }
}

function hide(id: string) {
  if (!id || hiddenIds.value.includes(id)) return
  hiddenIds.value = [...hiddenIds.value, id]
  persist()
}

function unhide(id: string) {
  hiddenIds.value = hiddenIds.value.filter((hidden) => hidden !== id)
  persist()
}

function isHidden(id: string | undefined): boolean {
  return !!id && hiddenIds.value.includes(id)
}

export function useHiddenTasks() {
  return { hiddenIds: computed(() => hiddenIds.value), hide, unhide, isHidden }
}
