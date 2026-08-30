// Whether a group already stores a dataset at one path. The group's loaded
// paths answer at once; anything else asks the node after a short pause.
import { onScopeDispose, ref, watch, type Ref } from 'vue'
import { listMetadataPage } from './aruna/catalog'

const CHECK_DEBOUNCE_MS = 300
const CHECK_LIMIT = 5

export function usePathTaken(
  groupId: Ref<string | undefined>,
  path: Ref<string>,
  documentPaths: Ref<string[]>,
) {
  const taken = ref(false)
  const checking = ref(false)
  // Fences stale answers: only the newest check may write the refs.
  let generation = 0
  let timer: ReturnType<typeof setTimeout> | undefined

  function clearTimer() {
    if (timer === undefined) return
    clearTimeout(timer)
    timer = undefined
  }

  async function ask(id: string, value: string, current: number) {
    try {
      // The prefix filter matches the path itself and what sits below it.
      const page = await listMetadataPage({ group_id: id, path_prefix: value, limit: CHECK_LIMIT })
      if (current !== generation) return
      taken.value = page.documents.some((document) => document.document_path === value)
    } catch {
      // A listing that failed must not block the save.
    } finally {
      if (current === generation) checking.value = false
    }
  }

  watch([groupId, path, documentPaths], ([id, value, known]) => {
    const current = ++generation
    clearTimer()
    taken.value = false
    checking.value = false
    if (!id || !value) return
    if (known.includes(value)) {
      taken.value = true
      return
    }
    checking.value = true
    timer = setTimeout(() => {
      timer = undefined
      void ask(id, value, current)
    }, CHECK_DEBOUNCE_MS)
  }, { immediate: true })

  onScopeDispose(() => {
    generation += 1
    clearTimer()
  })

  return { taken, checking }
}
