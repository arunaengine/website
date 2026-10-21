// Pages of a preview by cursor. Earlier cursors are kept, so Previous works without a server cursor for it.
import { computed, ref } from 'vue'
import { PAGE_SIZE } from '@/lib/api'
import { organizeError } from '@/lib/organize'

export interface CursorPage<T> {
  items: T[]
  total: number
  complete: boolean
  next?: string | null
}

export function useCursorPage<T>(
  fetchPage: (query: { filter: string; limit: number; after: string | null }) => Promise<CursorPage<T>>,
  onMissing: () => void = () => {},
) {
  const page = ref<CursorPage<T> | null>(null)
  const filter = ref('')
  const busy = ref(false)
  const error = ref<string | null>(null)
  // cursors[i] opens page i and starts[i] is how many entries come before it.
  const cursors = ref<(string | null)[]>([null])
  const starts = ref<number[]>([0])
  const index = ref(0)
  let generation = 0

  const items = computed(() => page.value?.items ?? [])
  const offset = computed(() => starts.value[index.value] ?? 0)
  const hasNext = computed(() => Boolean(page.value?.next))
  const hasPrev = computed(() => index.value > 0)

  // The paging state changes only when the page arrived, so a failure keeps the page on screen.
  async function open(nextCursors: (string | null)[], nextStarts: number[], at: number, text: string) {
    const id = ++generation
    busy.value = true
    error.value = null
    try {
      const result = await fetchPage({ filter: text, limit: PAGE_SIZE, after: nextCursors[at] ?? null })
      if (id !== generation) return
      page.value = result
      cursors.value = nextCursors
      starts.value = nextStarts
      index.value = at
      filter.value = text
    } catch (err) {
      if (id !== generation) return
      const status = (err as { status?: number }).status
      if (status === 404 || status === 405 || status === 501) onMissing()
      else error.value = organizeError(err)
    } finally {
      if (id === generation) busy.value = false
    }
  }

  /** Starts over from the first page, optionally with a new filter. */
  function load(text = filter.value) {
    return open([null], [0], 0, text)
  }

  function next() {
    const cursor = page.value?.next
    if (!cursor || busy.value) return Promise.resolve()
    const at = index.value + 1
    const start = offset.value + items.value.length
    return open([...cursors.value.slice(0, at), cursor], [...starts.value.slice(0, at), start], at, filter.value)
  }

  function prev() {
    return index.value > 0 && !busy.value
      ? open(cursors.value, starts.value, index.value - 1, filter.value)
      : Promise.resolve()
  }

  /** Forgets everything, and ignores answers still on their way. */
  function reset() {
    generation++
    page.value = null
    filter.value = ''
    busy.value = false
    error.value = null
    cursors.value = [null]
    starts.value = [0]
    index.value = 0
  }

  return { page, items, filter, busy, error, offset, hasNext, hasPrev, load, next, prev, reset }
}
