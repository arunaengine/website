import type { MetadataDoc as PurposeMetadataDoc } from '@/data/types'
import { conformsToProcessRun } from '@/lib/profiles/builtinProfiles'
import { DX_PROFILE } from '@/lib/profiles/types'

export type DatasetPurpose = 'dataset' | 'profile' | 'process-run' | 'unknown'

const PROFILE_ROOT_TYPES = new Set([
  'Profile',
  'prof:Profile',
  DX_PROFILE,
])

// P0-5 precedence: semantic Profile root type, exact Process Run conformance,
// then the default dataset purpose. Storage paths never decide the purpose.
export function datasetPurposeOf(
  doc?: Pick<PurposeMetadataDoc, 'type' | 'conformsToIds'> | null,
): DatasetPurpose {
  if (!doc) return 'unknown'
  const rootTypes = (doc?.type ?? '').split(',').map((entry) => entry.trim()).filter(Boolean)
  if (rootTypes.some((type) => PROFILE_ROOT_TYPES.has(type))) return 'profile'
  if (conformsToProcessRun(doc?.conformsToIds)) return 'process-run'
  return 'dataset'
}

export function datasetPurposeLabel(purpose: DatasetPurpose): string {
  if (purpose === 'profile') return 'Profile'
  if (purpose === 'process-run') return 'Process Run'
  if (purpose === 'unknown') return 'Purpose unknown'
  return 'Dataset'
}

export function datasetPurposeMatches(
  doc: Pick<PurposeMetadataDoc, 'type' | 'conformsToIds'> | null | undefined,
  selected: DatasetPurpose | null,
): boolean {
  const purpose = datasetPurposeOf(doc)
  return !selected || purpose === 'unknown' || purpose === selected
}
