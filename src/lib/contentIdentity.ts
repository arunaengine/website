import { apiRequest } from './api'

export const ARUNA_CONTENT_W3ID_PREFIX = 'https://w3id.org/aruna/data/'

const BLAKE3_HEX = /^[0-9a-f]{64}$/i

export type ContentIdentityResolution =
  | { status: 'resolved'; id: string; blake3: string }
  | { status: 'unavailable' }

interface DrsObjectResponse {
  checksums?: Array<{ type?: string; checksum?: string }>
}

export interface ContentIdentityOptions {
  blake3?: string | null
  realmId?: string | null
  nodeId?: string | null
  apiBaseUrl?: string | null
  authToken?: string | null
  getVersionId?: (bucket: string, key: string) => Promise<string | null | undefined>
  getDrsObject?: (objectId: string) => Promise<DrsObjectResponse>
}

export type ContentReferenceIdentity = 'content' | 'location' | 'external'

export interface AuthoredContentReference {
  id: string
  contentUrl?: string
  identity: ContentReferenceIdentity
}

export function contentIdentityFromBlake3(value: string | null | undefined): ContentIdentityResolution {
  const blake3 = value?.trim().toLowerCase() ?? ''
  if (!BLAKE3_HEX.test(blake3)) return { status: 'unavailable' }
  return { status: 'resolved', id: `${ARUNA_CONTENT_W3ID_PREFIX}${blake3}`, blake3 }
}

export async function resolveContentIdentity(
  bucket: string,
  key: string,
  options: ContentIdentityOptions,
): Promise<ContentIdentityResolution> {
  const provided = contentIdentityFromBlake3(options.blake3)
  if (provided.status === 'resolved') return provided

  const realmId = options.realmId?.trim()
  const nodeId = options.nodeId?.trim()
  if (!bucket || !key || !realmId || !nodeId || !options.getVersionId) return { status: 'unavailable' }

  try {
    const versionId = (await options.getVersionId(bucket, key))?.trim()
    if (!versionId) return { status: 'unavailable' }
    const objectId = `arn:aruna:${realmId}:${nodeId}:s3/${bucket}/${encodeObjectKey(key)}@${versionId}`
    const getDrsObject = options.getDrsObject ?? (options.apiBaseUrl
      ? (id: string) => apiRequest<DrsObjectResponse>(
          `/ga4gh/drs/v1/objects/${encodeURIComponent(id)}`,
          {},
          { baseUrl: options.apiBaseUrl ?? undefined, token: options.authToken ?? undefined },
        )
      : undefined)
    if (!getDrsObject) return { status: 'unavailable' }
    const object = await getDrsObject(objectId)
    const checksum = object.checksums?.find((entry) => entry.type?.toLowerCase() === 'blake3')?.checksum
    return contentIdentityFromBlake3(checksum)
  } catch {
    return { status: 'unavailable' }
  }
}

export function arunaContentReference(
  location: string,
  resolution: ContentIdentityResolution,
): AuthoredContentReference {
  if (resolution.status === 'resolved') {
    return { id: resolution.id, contentUrl: location, identity: 'content' }
  }
  return { id: location, identity: 'location' }
}

export function externalContentReference(id: string): AuthoredContentReference {
  return { id, identity: 'external' }
}

export function fileEntityForReference(
  reference: AuthoredContentReference,
  name: string,
): Record<string, unknown> {
  return {
    '@id': reference.id,
    '@type': 'File',
    name: name || reference.id,
    ...(reference.contentUrl ? { contentUrl: reference.contentUrl } : {}),
  }
}

const stagedSelections = new Map<string, { token: symbol; reference: AuthoredContentReference }>()

// The shared files editor narrows picker events to id + name. This synchronous
// handoff lets its host retain the resolved contentUrl and identity marker.
export function stageSelectedContentReference(reference: AuthoredContentReference): () => void {
  const token = Symbol(reference.id)
  stagedSelections.set(reference.id, { token, reference: { ...reference } })
  return () => {
    if (stagedSelections.get(reference.id)?.token === token) stagedSelections.delete(reference.id)
  }
}

export function takeSelectedContentReference(id: string): AuthoredContentReference | undefined {
  const staged = stagedSelections.get(id)
  if (!staged) return undefined
  stagedSelections.delete(id)
  return { ...staged.reference }
}

function encodeObjectKey(key: string): string {
  return key
    .split('/')
    .map((segment) => encodeURIComponent(segment).replace(/[!'()*]/g, (character) =>
      `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
    ))
    .join('/')
}
