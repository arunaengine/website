// How files got into a bucket, as far as the node tells: buckets that sync into it and storage
// folders registered in it. Files that no list covers are not claimed to come from anywhere.
import type { FileSource } from '@/lib/api'
import { arnLocationLabel, parseArunaArn, SYNC_MODE_LABELS } from '@/lib/sync'

export interface SourceRow {
  key: string
  label: string
  value: string
  question: 'elsewhere' | 'sync'
}

export function sourceRows(
  incoming: readonly FileSource[],
  nodeLabel: (nodeId: string) => string,
  backendName: (backendId: string) => string,
): SourceRow[] {
  return incoming.map((source): SourceRow => {
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
}
