// How files got into a bucket, as far as the node tells: external sources it references and
// buckets that follow into it. Files that neither list covers are not claimed to come from anywhere.
import type { SyncRelationship } from '@/lib/api'
import { formatNumber } from '@/lib/utils'
import { referenceSourceName, type ReferenceSourceGroup } from '@/lib/references'
import { arnLocationLabel, parseArunaArn, SYNC_MODE_LABELS } from '@/lib/sync'

export interface SourceRow {
  key: string
  label: string
  value: string
  question: 'elsewhere' | 'sync'
}

export function sourceRows(
  groups: readonly ReferenceSourceGroup[],
  incoming: readonly SyncRelationship[],
  nodeLabel: (nodeId: string) => string,
): SourceRow[] {
  const referenced = groups.map((group): SourceRow => ({
    key: `ref:${group.key}`,
    label: referenceSourceName(group, { nodeLabel }),
    value: `${formatNumber(group.count)} ${group.count === 1 ? 'file' : 'files'}, read from the source`,
    question: 'elsewhere',
  }))
  const followed = incoming.map((relationship): SourceRow => {
    const node = parseArunaArn(relationship.source)?.nodeId
    const where = node ? ` on ${nodeLabel(node)}` : ''
    return {
      key: `sync:${relationship.id}`,
      label: `${arnLocationLabel(relationship.source)}${where}`,
      value: `Copied by a sync: ${SYNC_MODE_LABELS[relationship.mode].toLowerCase()}`,
      question: 'sync',
    }
  })
  return [...referenced, ...followed]
}
