// The sync relationships that touch one bucket, outgoing and incoming. The
// backend lists only the relationships the caller created. Relationships live
// on their SOURCE node, so a bucket hosted elsewhere is asked on that node too
// and the answers are merged; a failure there degrades to a notice.
import { computed, ref, type Ref } from 'vue'
import { useAruna } from '@/composables/useAruna'
import { useRealmNodes } from '@/composables/useRealmNodes'
import type { SyncRelationship } from '@/lib/api'
import { errorMessage } from '@/lib/utils'

export interface SyncRow {
  relationship: SyncRelationship
  direction: 'outgoing' | 'incoming'
}

export function useBucketSyncs(bucket: Ref<string>, nodeId: Ref<string | null>) {
  const { listSyncRelationships } = useAruna()
  const realmNodes = useRealmNodes()

  const outgoing = ref<SyncRelationship[]>([])
  const incoming = ref<SyncRelationship[]>([])
  /** Relationship id to hosting node id, for rows only a remote listing returned. */
  const hostedOn = ref<Record<string, string>>({})
  const loading = ref(false)
  const error = ref<string | null>(null)
  const remoteError = ref<string | null>(null)
  let sequence = 0

  const remoteApiBase = computed(() =>
    nodeId.value ? (realmNodes.nodeById(nodeId.value)?.apiBase ?? null) : null,
  )
  const rows = computed<SyncRow[]>(() => [
    ...outgoing.value.map((relationship) => ({ relationship, direction: 'outgoing' as const })),
    ...incoming.value.map((relationship) => ({ relationship, direction: 'incoming' as const })),
  ])

  /** Base-url override for a row the remote node answered for. */
  function hostOpts(relationshipId: string): { baseUrl?: string } {
    return hostedOn.value[relationshipId] && remoteApiBase.value
      ? { baseUrl: remoteApiBase.value }
      : {}
  }

  async function load(silent = false): Promise<number> {
    const request = ++sequence
    if (!silent) {
      loading.value = true
      error.value = null
    }
    try {
      const response = await listSyncRelationships({ bucket: bucket.value, direction: 'both' })
      if (request !== sequence) return request
      let mergedOutgoing = response.outgoing
      let mergedIncoming = response.incoming
      const hosts: Record<string, string> = {}
      if (nodeId.value) {
        try {
          if (!remoteApiBase.value) throw new Error('no published API base')
          const remote = await listSyncRelationships(
            { bucket: bucket.value, direction: 'both' },
            { baseUrl: remoteApiBase.value },
          )
          if (request !== sequence) return request
          const known = new Set([...mergedOutgoing, ...mergedIncoming].map((entry) => entry.id))
          for (const entry of remote.outgoing) {
            if (known.has(entry.id)) continue
            hosts[entry.id] = nodeId.value
            mergedOutgoing = [...mergedOutgoing, entry]
          }
          for (const entry of remote.incoming) {
            if (known.has(entry.id)) continue
            hosts[entry.id] = nodeId.value
            mergedIncoming = [...mergedIncoming, entry]
          }
          remoteError.value = null
        } catch (remoteErr) {
          if (request !== sequence) return request
          // A changed session aborts the whole load, not just this leg.
          if (remoteErr instanceof DOMException && remoteErr.name === 'AbortError') throw remoteErr
          remoteError.value = `Could not ask ${realmNodes.displayName(nodeId.value)} for its sync relationships`
        }
      } else {
        remoteError.value = null
      }
      outgoing.value = mergedOutgoing
      incoming.value = mergedIncoming
      hostedOn.value = hosts
    } catch (err) {
      if (request === sequence && !silent) error.value = errorMessage(err)
    } finally {
      if (request === sequence) loading.value = false
    }
    return request
  }

  function cancel() {
    sequence += 1
  }

  return {
    outgoing,
    incoming,
    rows,
    hostedOn,
    loading,
    error,
    remoteError,
    remoteApiBase,
    hostOpts,
    load,
    cancel,
  }
}
