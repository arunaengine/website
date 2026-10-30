import type { MetadataDoc } from '@/data/types'
import { crateActions, crateTypeOf } from '@/lib/crateType'
import { licenseLabelOf } from '@/lib/licenses'
import { parseRunCrate } from '@/lib/runCrate'
import { formatBinary, formatDate, formatDateTime, formatDuration } from '@/lib/utils'

export interface ListFact {
  label: string
  value: string
  title?: string
}

type Entity = Record<string, unknown>

const text = (value: unknown): string => (typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '')

function rootOf(crate: unknown): Entity | undefined {
  const graph = (crate as Entity | null)?.['@graph']
  if (!Array.isArray(graph)) return undefined
  const about = (graph.find((entity) => (entity as Entity)?.['@id'] === 'ro-crate-metadata.json') as Entity | undefined)?.about
  const rootId = text((about as Entity | undefined)?.['@id']) || './'
  return graph.find((entity) => (entity as Entity)?.['@id'] === rootId) as Entity | undefined
}

/** The run a run crate leads with: the first action with a start time, else the first action. */
export function mainAction(crate: unknown): Entity | undefined {
  const actions = crateActions(crate)
  return actions.find((action) => text(action.startTime)) ?? actions[0]
}

export function actionDuration(action: Entity | undefined): string {
  const start = Date.parse(text(action?.startTime))
  const end = Date.parse(text(action?.endTime))
  return Number.isFinite(start) && Number.isFinite(end) && end >= start ? formatDuration(end - start) : ''
}

type Names = { group: (id: string) => string; node: (id: string) => string }

/** A dataset's license, group, size and last change; a fact the summary does not hold is empty. */
export function datasetFacts(doc: MetadataDoc, names: Names): ListFact[] {
  const sizeText = text(rootOf(doc.roCrate)?.contentSize).trim()
  const size = Number(sizeText)
  return [
    { label: 'License', value: doc.license ? licenseLabelOf(doc.license) : '', title: doc.license },
    { label: 'Group', value: doc.realmId ? names.group(doc.realmId) : '' },
    { label: 'Size', value: sizeText && Number.isFinite(size) ? formatBinary(size) : '' },
    { label: 'Updated', value: doc.updatedAt ? formatDate(doc.updatedAt) : '', title: doc.updatedAt },
  ]
}

/** The labeled facts a dataset row or card shows; a run shows its run facts instead. */
export function listFacts(doc: MetadataDoc, names: Names): ListFact[] {
  if (!crateTypeOf(doc).endsWith('-run')) return datasetFacts(doc, names)
  const action = mainAction(doc.roCrate)
  const node = parseRunCrate(doc.roCrate, '')?.site?.nodeId
  return [
    { label: 'Started', value: action?.startTime ? formatDateTime(text(action.startTime)) : '' },
    { label: 'Duration', value: actionDuration(action) },
    { label: 'Node', value: node ? names.node(node) : '' },
    { label: 'Group', value: doc.realmId ? names.group(doc.realmId) : '' },
  ]
}
