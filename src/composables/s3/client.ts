import { S3Client } from '@aws-sdk/client-s3'
import { useAruna } from '../useAruna'
import { clientCache } from './cache'
import { S3ContextMismatchError, S3SessionUnavailableError } from './errors'
import {
  activeSession,
  markSessionUsed,
  normalizeNodeId,
  sessionForReference,
  sessions,
  sessionUsable,
  storeKey,
  type S3SessionReference,
} from './session'

const { currentUser } = useAruna()

export function client(nodeId?: string | null, reference?: S3SessionReference): S3Client {
  const session = reference ? sessionForReference(reference) : activeSession.value
  if (!sessionUsable(session)) {
    throw new S3SessionUnavailableError('No valid S3 session is available for this node and group.')
  }
  if (currentUser.value?.id !== session.userId) {
    throw new S3SessionUnavailableError('The S3 session belongs to a different authenticated user.')
  }
  const requiredNodeId = nodeId === undefined ? session.issuerNodeId : normalizeNodeId(nodeId)
  if (!requiredNodeId) throw new S3SessionUnavailableError('The required node identity is not available.')
  if (requiredNodeId !== session.issuerNodeId) {
    throw new S3ContextMismatchError(session.issuerNodeId, requiredNodeId)
  }
  const key = storeKey(session.issuerNodeId, session.groupId)
  const cacheKey = `${session.s3Endpoint}\u0000${key}\u0000${session.accessKeyId}`
  const cached = clientCache.get(cacheKey)
  if (cached) return cached.client
  const created = new S3Client({
    endpoint: session.s3Endpoint,
    region: 'us-east-1',
    forcePathStyle: true,
    credentials: async () => {
      const current = sessions.value.get(key)
      if (!sessionUsable(current) || current.accessKeyId !== session.accessKeyId) {
        throw new S3SessionUnavailableError('The S3 session expired before this request could start.')
      }
      markSessionUsed(key)
      return {
        accessKeyId: current.accessKeyId,
        secretAccessKey: current.secretAccessKey,
        sessionToken: current.sessionToken,
        expiration: new Date(current.expiresAt),
      }
    },
    maxAttempts: 1,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  })
  clientCache.set(cacheKey, { storeKey: key, accessKeyId: session.accessKeyId, client: created })
  return created
}
