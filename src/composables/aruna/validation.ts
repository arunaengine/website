import { apiRequest, type ProfileValidationCapabilitiesResponse, type ProfileValidationStatusResponse } from '@/lib/api'
import { errorMessage } from '@/lib/utils'
import {
  assertCurrentSession,
  capabilitiesLoad,
  profileValidationCapabilities,
  profileValidationStatusGenerations,
  profileValidationStatusLoads,
  profileValidationStatuses,
  refreshContext,
  request,
  sessionEpoch,
  setCapabilitiesLoad,
} from './state'

export type ProfileValidationPresentationStatus =
  | 'not checked'
  | 'checking'
  | 'verified'
  | 'invalid'
  | 'partial'
  | 'unavailable'

export interface ProfileValidationPresentation {
  status: ProfileValidationPresentationStatus
  stale: boolean
  canRevalidate: boolean
  response?: ProfileValidationStatusResponse
  message?: string
}

export function profileValidationPresentation(
  response: ProfileValidationStatusResponse,
): ProfileValidationPresentation {
  if (response.state === 'stale') {
    return { status: 'not checked', stale: true, canRevalidate: true, response }
  }
  if (response.state === 'not_profiled') {
    return { status: 'not checked', stale: false, canRevalidate: false, response }
  }
  if (response.state === 'invalid') {
    return { status: 'invalid', stale: false, canRevalidate: true, response }
  }
  if (response.completeness === 'incomplete') {
    return { status: 'partial', stale: false, canRevalidate: true, response }
  }
  return { status: 'verified', stale: false, canRevalidate: true, response }
}

// SHACL terms the profile builder turns into form controls. Anything else a
// profile uses is enforced by the server alone, so it must be disclosed.
export const FORM_CONTROL_CONSTRAINTS = new Set([
  'sh:targetClass',
  'sh:property',
  'sh:path',
  'sh:minCount',
  'sh:maxCount',
  'sh:datatype',
  'sh:class',
  'sh:nodeKind',
  'sh:pattern',
  'sh:in',
  'sh:severity',
  'sh:message',
  'sh:name',
  'sh:description',
  'sh:order',
  'sh:group',
])

export function profileConstraintTerm(value: string): string | undefined {
  return value.match(/^sh:[A-Za-z][\w-]*/)?.[0]
}

export function serverValidationRequiredConstraints(
  shapes: readonly string[],
  capabilities?: { readonly supported_constraints: readonly string[] } | null,
): string[] {
  if (!capabilities || !shapes.length) return []
  const source = shapes.join('\n')
  const shaclPrefixes = new Set(['sh'])
  for (const match of source.matchAll(
    /(?:@prefix|prefix)\s+([A-Za-z][\w-]*):\s*<http:\/\/www\.w3\.org\/ns\/shacl#>/gi,
  )) {
    shaclPrefixes.add(match[1])
  }
  const used = new Set(
    [...source.matchAll(/http:\/\/www\.w3\.org\/ns\/shacl#([A-Za-z][\w-]*)/g)]
      .map((match) => `sh:${match[1]}`),
  )
  for (const prefix of shaclPrefixes) {
    for (const match of source.matchAll(new RegExp(`\\b${prefix}:([A-Za-z][\\w-]*)`, 'g'))) {
      used.add(`sh:${match[1]}`)
    }
  }
  const required: string[] = []
  for (const supported of capabilities.supported_constraints) {
    const term = profileConstraintTerm(supported)
    if (term && used.has(term) && !FORM_CONTROL_CONSTRAINTS.has(term) && !required.includes(term)) {
      required.push(term)
    }
  }
  return required
}

export type ProfileRulesLoadState = 'loading' | 'ready' | 'empty' | 'unavailable'

export function profileRulesLoadState(options: {
  loading: boolean
  unavailable: boolean
  complete: boolean
  hasRules: boolean
}): ProfileRulesLoadState {
  if (options.loading) return 'loading'
  if (options.unavailable) return 'unavailable'
  if (options.complete && !options.hasRules) return 'empty'
  return 'ready'
}

export function setProfileValidationPresentation(documentId: string, value: ProfileValidationPresentation) {
  profileValidationStatuses.value = { ...profileValidationStatuses.value, [documentId]: value }
}

export async function loadProfileValidationCapabilities(
  force = false,
): Promise<ProfileValidationCapabilitiesResponse> {
  if (!force && profileValidationCapabilities.value) return profileValidationCapabilities.value
  const pending = capabilitiesLoad()
  if (!force && pending) return pending
  const context = refreshContext()
  const load = apiRequest<ProfileValidationCapabilitiesResponse>(
    '/metadata/profile/validation/capabilities',
    {},
    context.client,
  ).then((capabilities) => {
    assertCurrentSession(context.epoch)
    profileValidationCapabilities.value = capabilities
    return capabilities
  }).finally(() => {
    if (capabilitiesLoad() === load) setCapabilitiesLoad(null)
  })
  setCapabilitiesLoad(load)
  return load
}

export async function loadProfileValidationStatus(
  documentId: string,
  force = false,
): Promise<ProfileValidationPresentation> {
  const previous = profileValidationStatuses.value[documentId]
  if (!force && previous && previous.status !== 'checking') return previous
  const generation = profileValidationStatusGenerations.get(documentId) ?? 0
  const existing = profileValidationStatusLoads.get(documentId)
  if (existing?.generation === generation) return existing.promise
  if (!previous?.stale) {
    setProfileValidationPresentation(documentId, {
      status: 'checking',
      stale: false,
      canRevalidate: false,
      response: previous?.response,
    })
  }
  const context = refreshContext()
  const load = apiRequest<ProfileValidationStatusResponse>(
    `/metadata/${encodeURIComponent(documentId)}/profile/validation`,
    {},
    context.client,
  ).then((response) => {
    assertCurrentSession(context.epoch)
    if ((profileValidationStatusGenerations.get(documentId) ?? 0) !== generation) {
      return profileValidationStatuses.value[documentId]
        ?? { status: 'not checked', stale: true, canRevalidate: true }
    }
    const presentation = profileValidationPresentation(response)
    setProfileValidationPresentation(documentId, presentation)
    return presentation
  }).catch((error) => {
    if (
      context.epoch === sessionEpoch.value
      && (profileValidationStatusGenerations.get(documentId) ?? 0) === generation
    ) {
      setProfileValidationPresentation(documentId, {
        status: 'unavailable',
        stale: false,
        canRevalidate: false,
        response: previous?.response,
        message: errorMessage(error),
      })
    }
    throw error
  }).finally(() => {
    if (profileValidationStatusLoads.get(documentId)?.promise === load) {
      profileValidationStatusLoads.delete(documentId)
    }
  })
  profileValidationStatusLoads.set(documentId, { generation, promise: load })
  return load
}

export async function revalidateProfileValidationStatus(
  documentId: string,
): Promise<ProfileValidationPresentation> {
  const generation = (profileValidationStatusGenerations.get(documentId) ?? 0) + 1
  profileValidationStatusGenerations.set(documentId, generation)
  setProfileValidationPresentation(documentId, {
    status: 'checking',
    stale: false,
    canRevalidate: false,
    response: profileValidationStatuses.value[documentId]?.response,
  })
  try {
    const response = await request<ProfileValidationStatusResponse>(
      `/metadata/${encodeURIComponent(documentId)}/profile/validation/revalidate`,
      { method: 'POST' },
    )
    if ((profileValidationStatusGenerations.get(documentId) ?? 0) !== generation) {
      return profileValidationStatuses.value[documentId]
        ?? { status: 'not checked', stale: true, canRevalidate: true }
    }
    const presentation = profileValidationPresentation(response)
    setProfileValidationPresentation(documentId, presentation)
    return presentation
  } catch (error) {
    if ((profileValidationStatusGenerations.get(documentId) ?? 0) === generation) {
      setProfileValidationPresentation(documentId, {
        status: 'unavailable',
        stale: false,
        canRevalidate: false,
        message: errorMessage(error),
      })
    }
    throw error
  }
}

export function invalidateProfileValidationStatus(documentId: string, reason: string) {
  profileValidationStatusGenerations.set(
    documentId,
    (profileValidationStatusGenerations.get(documentId) ?? 0) + 1,
  )
  const previous = profileValidationStatuses.value[documentId]
  setProfileValidationPresentation(documentId, {
    status: 'not checked',
    stale: true,
    canRevalidate: true,
    response: previous?.response
      ? { ...previous.response, state: 'stale', completeness: 'incomplete', stale_reason: reason }
      : undefined,
  })
}

export function invalidateProfileValidationAfterWrite(documentId: string): string[] {
  const affected = new Set([documentId])
  for (const [datasetId, presentation] of Object.entries(profileValidationStatuses.value)) {
    if (presentation.response?.profile_id === documentId) affected.add(datasetId)
  }
  for (const id of affected) {
    invalidateProfileValidationStatus(
      id,
      id === documentId ? 'dataset_revision_changed' : 'profile_revision_changed',
    )
  }
  return [...affected]
}

export async function refreshProfileValidationAfterWrite(documentIds: string[]) {
  await Promise.all(documentIds.map((documentId) =>
    loadProfileValidationStatus(documentId, true).catch(() => undefined),
  ))
}
