import type { MetadataDoc } from '@/data/types'
import { crateActions, crateTypeOf } from '@/lib/crateType'
import { bylineOf } from '@/lib/datasetAbout'
import { licenseLabelOf } from '@/lib/licenses'
import { formatBinary, formatDate, formatDuration } from '@/lib/utils'

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

type Names = { group: (id: string) => string; person: (userId: string) => string }

/** The name of the root's publisher, as a named entity or a plain name; never a web address. */
function publisherOf(crate: unknown): string {
  const value = rootOf(crate)?.publisher
  const first = (Array.isArray(value) ? value[0] : value) as Entity | string | undefined
  if (typeof first === 'string') return /^https?:\/\//.test(first) ? '' : first
  const id = text(first?.['@id'])
  const graph = (crate as Entity | null)?.['@graph']
  const entity = id && Array.isArray(graph) ? (graph.find((item) => (item as Entity)?.['@id'] === id) as Entity | undefined) : first
  return text(entity?.name)
}

/** Who a dataset names as its makers, as its page header does: a run's starter, else its authors. */
export function makersOf(doc: MetadataDoc) {
  return bylineOf(doc.roCrate, crateTypeOf(doc).endsWith('-run') ? mainAction(doc.roCrate) : undefined)
}

/** The same facts for every dataset type: license, makers, size and last change; unknown is empty. */
export function datasetFacts(doc: MetadataDoc, names: Names): ListFact[] {
  const sizeText = text(rootOf(doc.roCrate)?.contentSize).trim()
  const size = Number(sizeText)
  // A run names the person who started it, never its group; an unresolved user stays empty.
  const people = makersOf(doc).map((person) => (person.userId ? names.person(person.userId) : person.name)).filter(Boolean)
  const group = crateTypeOf(doc).endsWith('-run') || !doc.realmId ? '' : publisherOf(doc.roCrate) || names.group(doc.realmId)
  return [
    { label: 'License', value: doc.license ? licenseLabelOf(doc.license) : '', title: doc.license },
    { label: 'By', value: people.join(', ') || group },
    { label: 'Size', value: sizeText && Number.isFinite(size) ? formatBinary(size) : '' },
    { label: 'Updated', value: doc.updatedAt ? formatDate(doc.updatedAt) : '', title: doc.updatedAt },
  ]
}
