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
] as const

// Publishes the three profile artifacts of a PUBLIC profile to the group's
// profiles bucket and returns the external references for buildProfileCrate:
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
  ): Promise<ExternalProfileArtifacts> {
    const endpoint = s3.endpoint.value
    if (!endpoint) throw new Error('Publishing a public profile needs the node S3 endpoint, which this node does not advertise.')
    if (!s3.hasActiveKey.value) {
      throw new Error('Publishing a public profile uploads its artifacts to S3, create S3 credentials for this group first (Data manager or Settings).')
    }

    const bucket = `profiles-${groupId.toLowerCase()}`
    await ensurePublicBucket(groupId, bucket)

    const refs: Partial<Record<(typeof ARTIFACT_FILES)[number]['key'], ExternalProfileArtifacts['html']>> = {}
    for (const artifact of ARTIFACT_FILES) {
      const text = texts[artifact.key]
      const key = `profiles/${slug}/${artifact.name}`
      await s3.putTextObject(bucket, key, text, artifact.contentType)
      const bytes = new TextEncoder().encode(text)
      refs[artifact.key] = {
        id: `${W3ID_DATA_PREFIX}${await blake3(bytes)}`,
        contentUrl: `${endpoint.replace(/\/$/, '')}/${bucket}/${key}`,
        contentSize: bytes.byteLength,
        sha256: await sha256(bytes),
      }
    }
    return { html: refs.html!, schema: refs.schema!, mode: refs.mode! }
  }

  async function ensurePublicBucket(groupId: string, bucket: string): Promise<void> {
    try {
      await s3.createBucket(bucket)
    } catch (err) {
      // Re-publishing into the existing bucket is the normal case.
      const name = (err as { name?: string }).name ?? ''
      if (name !== 'BucketAlreadyOwnedByYou' && name !== 'BucketAlreadyExists') throw err
    }
    await s3.allowPublicReadCors(bucket)

    // One public-read role per group covers the whole profiles bucket; skip
    // creation when a public role already grants READ on its path.
    const group = await getGroup(groupId)
    const nodeId = await localNodeId()
    const path = `/${group.realm_id}/g/${groupId}/data/${nodeId}/${bucket}/**`
    const covered = group.roles.some(
      (role) => role.public && Object.entries(role.permissions).some(
        ([rolePath, level]) => rolePath === path && level.toLowerCase() === 'read',
      ),
    )
    if (covered) return
    await createGroupRole(groupId, {
      name: 'public-read-profiles',
      permissions: { [path]: 'read' },
      public: true,
    })
  }

  async function localNodeId(): Promise<string> {
    const { nodeInfo } = useAruna()
    const nodeId = nodeInfo.value?.node.peer_id
    if (!nodeId) throw new Error('The node id is not known yet, try again once the node info has loaded.')
    return nodeId
  }

  return { publishProfileArtifacts }
}
