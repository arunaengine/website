import type { MetadataDoc } from '@/data/types'
import { datasetPurposeOf } from '@/lib/datasetPurpose'

// The four crate types the portal names. Workflow and process runs come from conformsTo, a profile
// from conformsTo or its root type; everything else is a Dataset.
export type CrateType = 'dataset' | 'workflow-run' | 'process-run' | 'profile'

export const CRATE_TYPES: ReadonlyArray<{ value: CrateType; label: string }> = [
  { value: 'dataset', label: 'Dataset' },
  { value: 'workflow-run', label: 'Workflow run' },
  { value: 'process-run', label: 'Process run' },
  { value: 'profile', label: 'Profile' },
]

export function crateTypeLabel(type: CrateType): string {
  return CRATE_TYPES.find((entry) => entry.value === type)?.label ?? 'Dataset'
}

export function isCrateType(value: unknown): value is CrateType {
  return CRATE_TYPES.some((entry) => entry.value === value)
}

export function crateTypeOf(doc?: Pick<MetadataDoc, 'type' | 'conformsToIds'> | null): CrateType {
  const ids = (doc?.conformsToIds ?? []).join(' ')
  if (/wfrun\/(workflow|provenance)|(workflow|provenance)[-_]run[-_]crate/i.test(ids)) return 'workflow-run'
  if (/wfrun\/process|process[-_]run[-_]crate/i.test(ids)) return 'process-run'
  if (/profile[-_]crate|ro\/crate\/profile/i.test(ids) || datasetPurposeOf(doc) === 'profile') return 'profile'
  return 'dataset'
}

type Entity = Record<string, unknown>

const listOf = (value: unknown): unknown[] => (Array.isArray(value) ? value : value == null ? [] : [value])
const textOf = (value: unknown): string =>
  typeof value === 'string' ? value : value && typeof value === 'object' && typeof (value as Entity)['@id'] === 'string' ? String((value as Entity)['@id']) : ''

/** The actions a crate records; a run crate describes its runs with them. */
export function crateActions(crate: unknown): Entity[] {
  const graph = listOf((crate as Entity | null)?.['@graph']).filter((entry): entry is Entity => Boolean(entry) && typeof entry === 'object')
  return graph.filter((entity) => listOf(entity['@type']).some((type) => typeof type === 'string' && /Action$/.test(type)))
}

/** A run crate's outcome: failed when one action failed, succeeded when every action completed. */
export function crateRunState(crate: unknown): 'succeeded' | 'failed' | null {
  const states = crateActions(crate).map((action) => textOf(action.actionStatus))
  if (!states.length) return null
  if (states.some((state) => /FailedActionStatus$/.test(state))) return 'failed'
  return states.every((state) => !state || /CompletedActionStatus$/.test(state)) ? 'succeeded' : null
}
