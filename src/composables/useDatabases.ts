// The databases the signed-in user may use, shared by the bucket list, Add data, search and the
// bucket header. The node filters by what the user may read; a failed read is not an empty list.
import { computed, ref } from 'vue'
import { useAruna } from '@/composables/useAruna'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { databaseOf, rowOf, searchRows, type DatabaseRow } from '@/lib/databases'
import { errorMessage } from '@/lib/utils'

export type DatabasesState = 'idle' | 'loading' | 'ready' | 'failed'

const PAGE = 100
const PAGES = 5

// One list for the whole portal; it belongs to the session that read it.
const listed = ref<DatabaseRow[]>([])
const listedEpoch = ref(-1)
const state = ref<DatabasesState>('idle')
const error = ref<string | null>(null)
const complete = ref(true)
let runs = 0

export function useDatabases() {
  const { listDatabases, sessionEpoch, authToken } = useAruna()
  const { localNodeId } = useRealmNodes()

  const rows = computed(() => (listedEpoch.value === sessionEpoch.value ? listed.value : []))

  async function load() {
    const run = ++runs
    const epoch = sessionEpoch.value
    if (!authToken.value) {
      listed.value = []
      state.value = 'idle'
      return
    }
    state.value = 'loading'
    error.value = null
    const found: DatabaseRow[] = []
    let after: string | undefined
    try {
      for (let page = 0; page < PAGES; page++) {
        const answer = await listDatabases({ limit: PAGE, ...(after ? { after } : {}) })
        if (run !== runs || epoch !== sessionEpoch.value) return
        found.push(...answer.databases.map(rowOf))
        after = answer.next_after ?? undefined
        if (!after) break
      }
      listed.value = found
      listedEpoch.value = epoch
      complete.value = !after
      state.value = 'ready'
    } catch (cause) {
      if (run !== runs || epoch !== sessionEpoch.value) return
      state.value = 'failed'
      error.value = errorMessage(cause)
    }
  }

  /** Reads the list once for this session; later calls only reread after `reload`. */
  function ensure() {
    if (state.value === 'loading') return
    if (state.value === 'idle' || listedEpoch.value !== sessionEpoch.value) void load()
  }

  return {
    rows,
    state,
    error,
    complete,
    ensure,
    reload: load,
    /** The database a bucket of the given node is, if it is one. */
    find: (bucket: string, nodeId: string | null) => databaseOf(rows.value, bucket, nodeId ?? localNodeId.value ?? ''),
    search: (query: string) => searchRows(rows.value, query),
  }
}
