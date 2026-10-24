// How files got into a bucket, as far as the node tells: external sources it references, buckets
// that sync into it and storage folders registered in it. Files that no list covers are not
// claimed to come from anywhere.
import type { FileSource } from '@/lib/api'
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
  incoming: readonly FileSource[],
  nodeLabel: (nodeId: string) => string,
  backendName: (backendId: string) => string,
): SourceRow[] {
  const referenced = groups.map((group): SourceRow => ({
    key: `ref:${group.key}`,
    label: referenceSourceName(group, { nodeLabel }),
    value: `${formatNumber(group.count)} ${group.count === 1 ? 'file' : 'files'}, read from the source`,
    question: 'elsewhere',
  }))
  const listed = incoming.map((source): SourceRow => {
    if (source.kind === 'storage') {
      const folder = [backendName(source.backend_id), source.backend_prefix.replace(/^\/+|\/+$/g, '')].filter(Boolean).join('/')
      return {
        key: `storage:${source.import_id}`,
        label: `Storage folder ${folder}`,
        value: `Registered in place${source.key_prefix ? ` under ${source.key_prefix}` : ''}, not copied`,
        question: 'elsewhere',
      }
    }
    const node = parseArunaArn(source.source)?.nodeId
    return {
      key: `sync:${source.relationship_id}`,
      label: `${arnLocationLabel(source.source)}${node ? ` on ${nodeLabel(node)}` : ''}`,
      value: `Copied by a sync: ${SYNC_MODE_LABELS[source.mode].toLowerCase()}`,
      question: 'sync',
    }
  })
  return [...referenced, ...listed]
}
