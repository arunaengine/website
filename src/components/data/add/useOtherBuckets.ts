import { computed, ref, watch, type Ref } from 'vue'
import { useAruna } from '@/composables/useAruna'
import { useRealmNodes } from '@/composables/useRealmNodes'
import type { FolderEntry, ObjectEntry } from '@/composables/useS3'
import { ApiError, type BucketSearchHit } from '@/lib/api'
import { errorMessage } from '@/lib/utils'

// Import from any bucket in the realm: search local and remote buckets, browse
// them through their per-node S3 client, then multi-select
// objects/folders and create sync relationships into the current bucket:
// mode "once" copies now, mode "reference" exposes without copying. The
// create request POSTs to the SOURCE node's API (the source is always the
// node receiving the request).
export type OtherMode = 'once' | 'reference'

export interface OtherBucketRow {
  id: number
  bucket: string
  nodeId: string | null
  /** Exact object key, or a folder prefix ending in '/'. */
  sourcePrefix: string
  isPrefix: boolean
  mode: OtherMode
  state: 'ready' | 'creating' | 'done' | 'error'
  error: string | null
}

export const OTHER_MODE_OPTIONS: Array<{ value: OtherMode; label: string }> = [
  { value: 'once', label: 'Copy (once)' },
  { value: 'reference', label: 'Reference' },
]

// Kept outside the tab component: radix unmounts inactive tab panels, and the
// pending import list must survive a switch to another source.
export function useOtherBuckets(options: {
  open: Ref<boolean>
  bucket: Ref<string>
  prefix: Ref<string>
}) {
  const { createSyncRelationship } = useAruna()
  const realmNodes = useRealmNodes()

  const sourceBucket = ref('')
  const sourceNodeId = ref<string | null>(null)
  const sourceSearch = ref('')
  const otherDefaultMode = ref<OtherMode>('once')
  const otherRows = ref<OtherBucketRow[]>([])
  let otherCounter = 0
  const otherBusy = ref(false)

  function pickSearchHit(hit: BucketSearchHit) {
    sourceBucket.value = hit.bucket
    sourceNodeId.value = realmNodes.isLocalNode(hit.node_id) ? null : hit.node_id
  }

  function addOtherSelection(selection: { objects: ObjectEntry[]; folders: FolderEntry[] }) {
    const bucket = sourceBucket.value
    if (!bucket) return
    const seeds = [
      ...selection.objects.map((object) => ({ sourcePrefix: object.key, isPrefix: false })),
      ...selection.folders.map((folder) => ({ sourcePrefix: folder.prefix, isPrefix: true })),
    ]
    for (const seed of seeds) {
      const duplicate = otherRows.value.some(
        (row) =>
          row.bucket === bucket &&
          (row.nodeId ?? null) === (sourceNodeId.value ?? null) &&
          row.sourcePrefix === seed.sourcePrefix,
      )
      if (duplicate) continue
      otherRows.value.push({
        id: ++otherCounter,
        bucket,
        nodeId: sourceNodeId.value,
        ...seed,
        mode: otherDefaultMode.value,
        state: 'ready',
        error: null,
      })
    }
  }

  function removeOtherRow(id: number) {
    otherRows.value = otherRows.value.filter((row) => row.id !== id)
  }

  // Sync semantics map source-prefix remainders under the target prefix, so a
  // folder lands as `<current prefix><folder>/…` and an exact object key (its
  // remainder is empty) as `<current prefix><name>`.
  function otherTargetPrefix(row: OtherBucketRow): string {
    const base = row.sourcePrefix.replace(/\/+$/, '').split('/').filter(Boolean).pop() ?? row.sourcePrefix
    return row.isPrefix ? `${options.prefix.value}${base}/` : `${options.prefix.value}${base}`
  }

  function syncCreateError(err: unknown): string {
    if (err instanceof ApiError) {
      if (err.status === 409) return 'This sync relationship already exists.'
      if (err.status === 501) return 'Reference mode is not supported by the source node yet.'
      if (err.status === 502) return 'The source node could not reach this node right now.'
      if (err.status === 401 || err.status === 403) return 'You need read access on the source bucket to import from it.'
      return err.message
    }
    return errorMessage(err)
  }

  const otherPendingCount = computed(
    () => otherRows.value.filter((row) => row.state === 'ready' || row.state === 'error').length,
  )

  /** Resolves to true when at least one relationship was created. */
  async function createOtherRelationships(): Promise<boolean> {
    const targetNode = realmNodes.localNodeId.value
    if (!targetNode || !options.bucket.value || otherBusy.value) return false
    otherBusy.value = true
    let created = false
    try {
      for (const row of otherRows.value) {
        if (row.state === 'done' || row.state === 'creating') continue
        const sourceApiBase = row.nodeId ? (realmNodes.nodeById(row.nodeId)?.apiBase ?? null) : null
        if (row.nodeId && !sourceApiBase) {
          row.state = 'error'
          row.error = `${realmNodes.displayName(row.nodeId)} does not publish an API URL, so the import cannot be created from here.`
          continue
        }
        row.state = 'creating'
        row.error = null
        try {
          await createSyncRelationship(
            {
              source: { bucket: row.bucket, prefix: row.sourcePrefix },
              target: { node_id: targetNode, bucket: options.bucket.value, prefix: otherTargetPrefix(row) },
              mode: row.mode,
              reference_handling: row.mode === 'reference' ? 'preserve' : 'materialize',
            },
            sourceApiBase ? { baseUrl: sourceApiBase } : {},
          )
          row.state = 'done'
          created = true
        } catch (err) {
          row.state = 'error'
          row.error = syncCreateError(err)
        }
      }
    } finally {
      otherBusy.value = false
    }
    return created
  }

  watch(
    options.open,
    (open) => {
      if (!open) return
      // Fresh Other-buckets session per dialog visit.
      sourceBucket.value = ''
      sourceNodeId.value = null
      sourceSearch.value = ''
      otherRows.value = []
    },
    { immediate: true },
  )

  return {
    realmNodes,
    sourceBucket,
    sourceNodeId,
    sourceSearch,
    otherDefaultMode,
    otherRows,
    otherBusy,
    otherPendingCount,
    pickSearchHit,
    addOtherSelection,
    removeOtherRow,
    otherTargetPrefix,
    createOtherRelationships,
  }
}

export type OtherBuckets = ReturnType<typeof useOtherBuckets>
