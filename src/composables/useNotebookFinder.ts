// Finds the notebooks in every bucket of the active group on every node, for the Notebooks tab and
// the picker. The realm object search answers them page by page, so no bucket is listed key by key.
import { computed, ref, shallowRef, watch } from 'vue'
import { useAruna } from '@/composables/useAruna'
import { listBuckets, nodesByBucket } from '@/composables/useBucketCount'
import { activeGroupId } from '@/composables/useGroupSelection'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { isNotebookKey } from '@/lib/notebook/document'
import type { FoundNotebook } from '@/lib/notebook/finder'
import { errorMessage } from '@/lib/utils'

// A substring query matches whole name parts of a key, case-sensitive, so each usual spelling of
// the .ipynb ending is asked for; the search offers no case-insensitive match.
const QUERIES = ['ipynb', 'IPYNB', 'Ipynb']
const PAGE = 100

export interface BucketScan {
  notebooks: FoundNotebook[]
  /** The search did not cover the whole bucket, so a missing notebook may still exist. */
  truncated: boolean
}

export function useNotebookFinder() {
  const { searchBuckets, searchObjects, sessionEpoch } = useAruna()
  const { isTarget, isLocalNode } = useRealmNodes()
  const buckets = ref<string[]>([])
  /** The node holding each bucket; null is the connected node. */
  const nodes = shallowRef(new Map<string, string | null>())
  const scans = shallowRef(new Map<string, BucketScan>())
  const failed = ref<string[]>([])
  const state = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const error = ref<string | null>(null)
  // A newer load, another group or another session drops the answers of the older one.
  let generation = 0

  async function load() {
    const run = ++generation
    const groupId = activeGroupId.value
    const current = () => run === generation
    state.value = 'loading'
    error.value = null
    try {
      if (!groupId) throw new Error('Choose a group to find its notebooks.')
      const listing = await listBuckets(searchBuckets, groupId, current)
      if (!current()) return
      const held = nodesByBucket(listing.hits, isTarget, isLocalNode)
      const found = new Map([...held.keys()].map((name) => [name, { notebooks: [] as FoundNotebook[], truncated: false }]))
      const bad = new Set<string>()
      const seen = new Set<string>()
      // Without a bucket the search skips distributed buckets; each of those is searched by name.
      const search = async (query: string, bucket?: string) => {
        let cursor: string | undefined
        do {
          const page = await searchObjects(query, { bucket, limit: PAGE, cursor })
          if (!current()) return
          for (const hit of page.hits) {
            const scan = found.get(hit.bucket)
            const id = `${hit.issuer_node_id}\n${hit.bucket}\n${hit.key}`
            if (!scan || hit.group_id !== groupId || !isNotebookKey(hit.key) || seen.has(id)) continue
            seen.add(id)
            scan.notebooks.push({
              bucket: hit.bucket,
              key: hit.key,
              size: hit.size ?? undefined,
              lastModified: hit.updated_at ? new Date(hit.updated_at) : undefined,
              nodeId: isLocalNode(hit.issuer_node_id) ? null : hit.issuer_node_id,
            })
          }
          const down = new Set(page.coverage.failed_partitions)
          if (bucket && !page.coverage.complete) found.get(bucket)!.truncated = true
          for (const hit of listing.hits) if (down.has(hit.node_id) && found.has(hit.bucket)) bad.add(hit.bucket)
          cursor = page.next_cursor ?? undefined
        } while (cursor)
      }
      const sets = [...new Set(listing.hits.filter((hit) => hit.set_id && found.has(hit.bucket)).map((hit) => hit.bucket))]
      await Promise.all(QUERIES.flatMap((query) => [
        search(query),
        ...sets.map((name) => search(query, name).catch(() => void bad.add(name))),
      ]))
      if (!current()) return
      for (const scan of found.values()) {
        scan.notebooks.sort((a, b) => (b.lastModified?.getTime() ?? 0) - (a.lastModified?.getTime() ?? 0))
      }
      buckets.value = [...held.keys()]
      nodes.value = held
      scans.value = found
      failed.value = [...bad].sort()
      state.value = 'ready'
    } catch (cause) {
      if (!current()) return
      state.value = 'error'
      error.value = errorMessage(cause)
    }
  }

  watch([activeGroupId, sessionEpoch], () => {
    buckets.value = []
    nodes.value = new Map()
    scans.value = new Map()
    failed.value = []
    if (state.value !== 'idle') void load()
  })

  const notebooks = computed(() => [...scans.value.values()]
    .flatMap((scan) => scan.notebooks)
    .sort((a, b) => (b.lastModified?.getTime() ?? 0) - (a.lastModified?.getTime() ?? 0)))
  const partial = computed(() => [...scans.value].filter(([, scan]) => scan.truncated).map(([name]) => name))

  return { buckets, nodes, scans, failed, partial, state, error, notebooks, load }
}
