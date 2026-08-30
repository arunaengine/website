// Search preferences shared by the top-bar quick search and the search page:
// one stored object inventory mode, so both ask the realm the same question.
import { ref, watch } from 'vue'
import { readStored, storeValue } from './aruna/state'
import { DEFAULT_OBJECT_SEARCH_MODE, OBJECT_SEARCH_MODE_LABELS } from './useUnifiedSearch'
import type { ObjectSearchMode } from '@/lib/api'

export const OBJECT_MODE_KEY = 'aruna.objectSearchMode'

function storedMode(): ObjectSearchMode {
  const stored = readStored(OBJECT_MODE_KEY)
  return stored in OBJECT_SEARCH_MODE_LABELS ? (stored as ObjectSearchMode) : DEFAULT_OBJECT_SEARCH_MODE
}

const objectSearchMode = ref<ObjectSearchMode>(storedMode())

watch(objectSearchMode, (mode) => storeValue(OBJECT_MODE_KEY, mode))

export function useSearchSettings() {
  return { objectSearchMode }
}
