// The databases the signed-in user may use, shared by the bucket list, Add data, search and the
// bucket header. The node filters by what the user may read; a failed read is not an empty list.
import { computed, ref, watch } from 'vue'
import { useAruna } from '@/composables/useAruna'
import { useRealmNodes } from '@/composables/useRealmNodes'
import type { BucketSearchHit } from '@/lib/api'
import { databaseOf, placeOf, rowsOf, searchRows, targetOf, type DatabasePlace, type DatabaseRow } from '@/lib/databases'
import { errorMessage } from '@/lib/utils'

export type DatabasesState = 'idle' | 'loading' | 'ready' | 'failed'

// One list for the whole portal; it belongs to the session that read it.
const listed = ref<DatabaseRow[]>([])
const listedEpoch = ref(-1)
const state = ref<DatabasesState>('idle')
const error = ref<string | null>(null)
const complete = ref(true)
// The session the state belongs to; a load of an earlier session never blocks a new one.
let stateEpoch = -1
let runs = 0
// How many dataset changes the last successful read started after.
let changesRead = 0

export function useDatabases() {
  const { searchBuckets, sessionEpoch, authToken, datasetChanges } = useAruna()
  const { localNodeId, isTarget } = useRealmNodes()

  const rows = computed(() => (listedEpoch.value === sessionEpoch.value ? listed.value : []))

  async function load() {
    const run = ++runs
    const epoch = sessionEpoch.value
    stateEpoch = epoch
    const seen = datasetChanges.value.length
    if (!authToken.value) {
      listed.value = []
      state.value = 'idle'
      return
    }
    // A reread of this session keeps the listed rows ready until the new answer lands.
    if (state.value !== 'ready' || listedEpoch.value !== epoch) state.value = 'loading'
    error.value = null
    const hits: BucketSearchHit[] = []
    let cursor: string | undefined
    let failedNodes = 0
    try {
      do {
        const answer = await searchBuckets('', { database: true, limit: 50, cursor })
        if (run !== runs || epoch !== sessionEpoch.value) return
        hits.push(...answer.hits)
        failedNodes += answer.nodes_failed
        cursor = answer.next_cursor ?? undefined
      } while (cursor)
      // A device's buckets are its owner's, never a database to pick.
      listed.value = rowsOf(hits.filter((hit) => isTarget(hit.node_id)))
      listedEpoch.value = epoch
      complete.value = failedNodes === 0
      state.value = 'ready'
      // Changes count as read only once a later read reached every node and each changed dataset;
      // otherwise the next ensure() reads again, while changes that came in during this read do now.
      const affects = (ids: string[]) => listed.value.some((row) => row.datasetId !== null && ids.includes(row.datasetId))
      const pending = datasetChanges.value.slice(changesRead, seen)
      const unread = listed.value.some((row) => row.datasetId !== null && pending.includes(row.datasetId) && !row.description)
      if (failedNodes === 0 && !unread) changesRead = seen
      if (affects(datasetChanges.value.slice(seen))) void load()
    } catch (cause) {
      if (run !== runs || epoch !== sessionEpoch.value) return
      state.value = 'failed'
      error.value = errorMessage(cause)
    }
  }

  // A database whose dataset changed since the list was read shows an old description.
  const changed = () => {
    const ids = new Set(datasetChanges.value.slice(changesRead))
    return listed.value.some((row) => row.datasetId !== null && ids.has(row.datasetId))
  }

  /** Reads the list once for this session; later calls reread after `reload` or a dataset change. */
  function ensure() {
    if (state.value === 'loading' && stateEpoch === sessionEpoch.value) return
    if (state.value === 'idle' || listedEpoch.value !== sessionEpoch.value || changed()) void load()
  }

  // A list in use is read again for the new session or after a change of a dataset it shows.
  watch(
    () => [sessionEpoch.value, datasetChanges.value.length],
    () => {
      if (state.value !== 'idle') ensure()
    },
  )

  /** Where a database opens: on this node when it holds it, else on a node that does. */
  const locate = (row: DatabaseRow): DatabasePlace => placeOf(row, localNodeId.value)

  return {
    rows,
    locate,
    state,
    error,
    complete,
    ensure,
    reload: load,
    /**
     * The database a bucket is. A bucket of this node needs its set first (null when ordinary);
     * a bucket of another node is matched by node and name.
     */
    find: (bucket: string, nodeId: string | null, setId?: string | null) => {
      const node = nodeId ?? localNodeId.value
      if (!node || (setId === undefined && !nodeId)) return undefined
      return databaseOf(rows.value, targetOf(bucket, node, setId ?? null))
    },
    search: (query: string) => searchRows(rows.value, query),
  }
}
