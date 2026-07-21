import { blake3, sha256 } from 'hash-wasm'
import { useAruna } from './useAruna'
import { useS3 } from './useS3'
import type { ExternalProfileArtifacts, ProfileArtifactTexts } from '@/lib/profiles/rocrate'

// Where content-addressed data resolves: any aruna node's GA4GH DRS API accepts
// these ids (`/ga4gh/drs/v1/objects/https://w3id.org/aruna/data/<blake3-hex>`).
const W3ID_DATA_PREFIX = 'https://w3id.org/aruna/data/'

const ARTIFACT_FILES = [
  { key: 'html', name: 'profile.html', contentType: 'text/html' },
  { key: 'schema', name: 'schema.json', contentType: 'application/schema+json' },
  { key: 'mode', name: 'mode.json', contentType: 'application/json' },
  { key: 'shapes', name: 'shapes.ttl', contentType: 'text/turtle' },
  // Attached expert SHACL file; uploaded only when the profile carries one.
  { key: 'customShapes', name: 'shapes.custom.ttl', contentType: 'text/turtle' },
] as const

// The chosen (or defaulted) place a public profile's artifacts are written.
export interface PublishDestination {
  bucket?: string
  prefix?: string
}

// Publishes the profile artifacts of a PUBLIC profile to the group's chosen
// destination (default: the dedicated `profiles-<group>` bucket under
// `profiles/<slug>`) and returns the external references for buildProfileCrate:
// `@id` = content-addressed DRS id, `contentUrl` = path-style S3 URL. Ensures
// the bucket exists, carries permissive read CORS, and is covered by a public
// (Everyone-principal) READ role so the URLs work without credentials.
//
// Constraint: the ACTIVE S3 key must belong to the profile's group — buckets
// are owned by the creating key's group, and the public role's permission path
// is built for the profile's group. A mismatched key fails role creation or
// leaves the artifacts unreadable; the thrown errors say which.
export function useProfilePublish() {
  const s3 = useS3()
  const { getGroup, createGroupRole } = useAruna()

  async function publishProfileArtifacts(
    groupId: string,
    slug: string,
    texts: ProfileArtifactTexts,
    destination?: PublishDestination,
  ): Promise<ExternalProfileArtifacts> {
    const endpoint = s3.endpoint.value
    if (!endpoint) throw new Error('Publishing a public profile needs the node S3 endpoint, which this node does not advertise.')
    if (!s3.hasActiveKey.value) {
      throw new Error('Publishing a public profile uploads its artifacts to S3, create S3 credentials for this group first (Data manager or Settings).')
    }

    const defaultBucket = `profiles-${groupId.toLowerCase()}`
    const defaultPrefix = `profiles/${slug}`
    const bucket = destination?.bucket?.trim() || defaultBucket
    const prefix = sanitizePrefix(destination?.prefix, defaultPrefix)
    // The whole-bucket role path is safe only for the dedicated default bucket;
    // any custom bucket or prefix scopes the public role to just this prefix so
    // publishing can never make an unrelated existing bucket world-readable.
    const isDefaultDestination = bucket === defaultBucket && prefix === defaultPrefix
    await ensurePublicBucket(groupId, bucket, isDefaultDestination ? undefined : prefix)

    const refs: Partial<Record<(typeof ARTIFACT_FILES)[number]['key'], ExternalProfileArtifacts['html']>> = {}
    for (const artifact of ARTIFACT_FILES) {
      const text = texts[artifact.key]
      if (text === undefined) continue
      const key = `${prefix}/${artifact.name}`
      await s3.putTextObject(bucket, key, text, artifact.contentType)
      const bytes = new TextEncoder().encode(text)
      refs[artifact.key] = {
        id: `${W3ID_DATA_PREFIX}${await blake3(bytes)}`,
        contentUrl: `${endpoint.replace(/\/$/, '')}/${bucket}/${key}`,
        contentSize: bytes.byteLength,
        sha256: await sha256(bytes),
      }
    }
    return {
      html: refs.html!,
      schema: refs.schema!,
      mode: refs.mode!,
      shapes: refs.shapes!,
      ...(refs.customShapes ? { customShapes: refs.customShapes } : {}),
    }
  }

  // `scopePrefix` undefined means the dedicated default bucket: the public role
  // covers the whole bucket (byte-identical to the original behavior, so old
  // roles keep matching). A defined prefix scopes the role to just that prefix.
  async function ensurePublicBucket(groupId: string, bucket: string, scopePrefix?: string): Promise<void> {
    try {
      await s3.createBucket(bucket)
    } catch (err) {
      // Re-publishing into the existing bucket is the normal case.
      const name = (err as { name?: string }).name ?? ''
      if (name !== 'BucketAlreadyOwnedByYou' && name !== 'BucketAlreadyExists') throw err
    }
    await s3.allowPublicReadCors(bucket)

    // One public-read role per destination path; skip creation when a public
    // role already grants READ on its exact path.
    const group = await getGroup(groupId)
    const nodeId = await localNodeId()
    const base = `/${group.realm_id}/g/${groupId}/data/${nodeId}/${bucket}`
    const path = scopePrefix ? `${base}/${scopePrefix}/**` : `${base}/**`
    const covered = group.roles.some(
      (role) => role.public && Object.entries(role.permissions).some(
        ([rolePath, level]) => rolePath === path && level.toLowerCase() === 'read',
      ),
    )
    if (covered) return
    await createGroupRole(groupId, {
      // Distinct name per scoped destination so a prefix-scoped role never
      // collides with the whole-bucket 'public-read-profiles' role.
      name: scopePrefix ? `public-read-${roleNameSuffix(bucket, scopePrefix)}` : 'public-read-profiles',
      permissions: { [path]: 'read' },
      public: true,
    })
  }

  // Normalizes a user-supplied key prefix into a safe S3 key path: strips
  // leading/trailing slashes, collapses empty (doubled) segments, drops any
  // char outside the S3-safe set, and falls back to `fallback` when nothing
  // usable survives so a destination prefix is never empty.
  function sanitizePrefix(raw: string | undefined, fallback: string): string {
    if (raw === undefined) return fallback
    const cleaned = raw
      .split('/')
      .map((segment) => segment.replace(/[^A-Za-z0-9._-]/g, ''))
      .filter((segment) => segment.length > 0)
      .join('/')
    return cleaned || fallback
  }

  // A stable, name-safe suffix for a prefix-scoped public role.
  function roleNameSuffix(bucket: string, prefix: string): string {
    const suffix = `${bucket}-${prefix}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    return (suffix || 'profiles').slice(0, 48)
  }

  async function localNodeId(): Promise<string> {
    const { nodeInfo } = useAruna()
    const nodeId = nodeInfo.value?.node.peer_id
    if (!nodeId) throw new Error('The node id is not known yet, try again once the node info has loaded.')
    return nodeId
  }

  return { publishProfileArtifacts }
}
