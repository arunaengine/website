// The storage the tutorials browse: the real S3 surface with its reads
// replaced by fixtures, so the object picker and the preview stack behave
// exactly as they do against a node.
import { computed } from 'vue'
import { useS3, type ObjectPage, type PortalS3Session } from '@/composables/useS3'
import {
  DATASET_FOLDER,
  DATASET_PREFIX,
  INPUT_BUCKET,
  INPUT_OBJECTS,
  RESULT_ARTIFACTS,
  RESULT_BUCKET,
  TUTORIAL_BUCKETS,
  TUTORIAL_ENDPOINT,
  TUTORIAL_GROUP,
  TUTORIAL_NODE_ID,
  artifactFor,
  objectHead,
  plotPngBytes,
} from '../fixtures/data'

export type S3Surface = ReturnType<typeof useS3>

function tutorialSession(userId: string): PortalS3Session {
  return {
    sessionId: 'tutorial-session',
    userId,
    groupId: TUTORIAL_GROUP.id,
    issuerNodeId: TUTORIAL_NODE_ID,
    s3Endpoint: TUTORIAL_ENDPOINT,
    apiBase: TUTORIAL_ENDPOINT,
    accessKeyId: 'tutorial',
    secretAccessKey: 'tutorial',
    sessionToken: 'tutorial',
    expiresAt: Number.MAX_SAFE_INTEGER,
    restrictions: [],
    state: 'active',
    warning: null,
    lastUsedAt: null,
  }
}

function page(bucket: string, prefix: string): ObjectPage {
  if (bucket === RESULT_BUCKET) {
    return {
      objects: RESULT_ARTIFACTS.map((artifact) => ({ key: artifact.key, name: artifact.name, size: artifact.size })),
      folders: [],
    }
  }
  if (bucket !== INPUT_BUCKET) return { objects: [], folders: [] }
  if (!prefix) return { objects: [], folders: [DATASET_FOLDER] }
  if (prefix === DATASET_PREFIX) return { objects: INPUT_OBJECTS, folders: [] }
  return { objects: [], folders: [] }
}

/** The S3 surface the tutorial provides; nothing here signs or sends a request. */
export function tutorialS3(userId: string): S3Surface {
  const session = tutorialSession(userId)
  const context = { nodeId: TUTORIAL_NODE_ID, userId, groupId: TUTORIAL_GROUP.id, session }
  return {
    ...useS3(),
    activeSession: computed(() => session),
    activeContext: computed(() => context),
    activeKey: computed(() => ({ accessKeyId: 'tutorial', secretAccessKey: 'tutorial', sessionToken: 'tutorial' })),
    hasActiveKey: computed(() => true),
    endpoint: computed(() => TUTORIAL_ENDPOINT),
    connectedEndpoint: computed(() => TUTORIAL_ENDPOINT),
    endpointForNode: () => TUTORIAL_ENDPOINT,
    nodeIdFor: () => TUTORIAL_NODE_ID,
    sessionState: () => 'usable' as const,
    contextMismatch: () => null,
    canRead: () => true,
    canWrite: () => true,
    canWritePrefix: () => true,
    canDeletePrefix: () => true,
    activateContext: async () => session,
    ensureSession: async () => undefined,
    listBuckets: async () => TUTORIAL_BUCKETS,
    listObjects: async (bucket: string, prefix: string) => page(bucket, prefix),
    listObjectsRecursive: async (bucket: string, prefix: string) => ({
      objects: page(bucket, prefix).objects,
      truncated: false,
    }),
    headObject: async (bucket: string, key: string) => objectHead(bucket, key),
    downloadUrl: async (bucket: string, key: string) => `${TUTORIAL_ENDPOINT}/${bucket}/${key}`,
    getObjectText: async (bucket: string, key: string) => {
      const artifact = artifactFor(bucket, key)
      if (artifact?.text !== undefined) return artifact.text
      return 'station,reading\nA,11.4\nB,12.1\n'
    },
    getObjectBlob: async (bucket: string, key: string) => {
      const artifact = artifactFor(bucket, key)
      if (artifact?.contentType === 'image/png') {
        return new Blob([plotPngBytes().slice().buffer as ArrayBuffer], { type: 'image/png' })
      }
      return new Blob([artifact?.text ?? ''], { type: artifact?.contentType ?? 'text/plain' })
    },
    putTextObject: async () => ({ versionId: null }),
  }
}
