import type { MetadataProfile } from '@/data/types'
import {
  PROCESS_RUN_CRATE_PROFILE_ID,
  PROCESS_RUN_PROFILE_URI,
} from '@/lib/profiles/builtinProfiles'
import { idValues } from './crateFields'
import { profileItems } from './state'

export const PROFILE_PUBLIC_IRI_PREFIX = 'https://w3id.org/aruna/profile/'

export function publicProfileIri(documentId: string): string {
  return `${PROFILE_PUBLIC_IRI_PREFIX}${documentId}`
}

export function profileReferenceIri(
  profile?: Pick<MetadataProfile, 'builtIn' | 'documentId' | 'profileUri' | 'graphIri'> | null,
): string | undefined {
  if (!profile) return undefined
  if (!profile.builtIn && profile.documentId) return publicProfileIri(profile.documentId)
  return profile.profileUri || profile.graphIri
}

export function profileIdsFromConformsTo(value: unknown): string[] {
  const resolved = new Set<string>()
  for (const id of idValues(value)) {
    const local = profileIdFromConformanceId(id)
    if (local) resolved.add(local)
  }
  return [...resolved]
}

export function profileIdFromConformanceId(id: string): string | undefined {
  if (id === PROCESS_RUN_PROFILE_URI) return PROCESS_RUN_CRATE_PROFILE_ID
  const byGraph = profileItems.value.find(
    (profile) => profile.graph_iri === id || publicProfileIri(profile.document_id) === id,
  )
  if (byGraph) return profileIdFromPath(byGraph.document_path) || byGraph.document_id
  return undefined
}

export function profileIdFromPath(value?: string | null): string | undefined {
  if (!value) return undefined
  return value.replace(/^profiles\//, '')
}
