// Public surface of the portal S3 layer. The implementation lives in ./s3:
// session (minting, refresh, restrictions), client (signed client factory),
// endpoints (node endpoint selection), objects and buckets.
import { allowPublicReadCors, createBucket, deleteBucket, listBuckets } from './s3/buckets'
import { connectedEndpoint, endpointForNode, resolveObjectUrl } from './s3/endpoints'
import {
  copyObjectVersion,
  createFolder,
  deleteObject,
  deleteObjectVersion,
  deletePrefix,
  downloadUrl,
  fetchUrlText,
  getObjectBlob,
  getObjectText,
  headObject,
  listDeletedObjects,
  listObjects,
  listObjectsRecursive,
  listObjectVersions,
  putTextObject,
  uploadObject,
} from './s3/objects'
import {
  activateContext,
  activeContext,
  activeKey,
  activeSession,
  canAccess,
  canDeletePrefix,
  canWritePrefix,
  clearSessions,
  contextMismatch,
  endpoint,
  ensureSession,
  hasActiveKey,
  normalizeNodeId,
  referenceForContext,
  sessionRevision,
  sessions,
  sessionState,
} from './s3/session'

export {
  S3ContextMismatchError,
  S3SessionUnavailableError,
  PURGE_IN_PROGRESS_MESSAGE,
  isS3AuthError,
  isS3BucketNotEmptyError,
  isS3NetworkError,
  isS3PurgeInProgressError,
  isS3QuotaError,
  s3ErrorMessage,
  s3ErrorReport,
  type S3ErrorReport,
} from './s3/errors'
export {
  S3_SESSION_REFRESH_WINDOW_MS,
  purgeLegacyS3KeyStorage,
  s3RestrictionsAllowPath,
  s3SessionRefreshJitterMs,
  type PortalS3Session,
  type S3ActiveContext,
  type S3Key,
  type S3SessionReference,
  type S3SessionState,
} from './s3/session'
export { fetchUrlText } from './s3/objects'
export type {
  DeletedObjectList,
  DeletePrefixResult,
  FolderEntry,
  ObjectEntry,
  ObjectHead,
  ObjectPage,
  ObjectVersionList,
  UploadHandle,
} from './s3/objects'
export type { DeletedObjectEntry, ObjectVersionEntry } from '@/lib/objectVersions'
export type { BucketEntry } from './s3/buckets'

export function useS3() {
  return {
    sessions,
    sessionRevision,
    activeSession,
    activeContext,
    activeKey,
    hasActiveKey,
    endpoint,
    connectedEndpoint,
    endpointForNode,
    nodeIdFor: normalizeNodeId,
    resolveObjectUrl,
    activateContext,
    ensureSession,
    clearSessions,
    referenceForContext,
    sessionState,
    contextMismatch,
    canRead: (bucket: string, key?: string, nodeId?: string | null) =>
      canAccess('read', bucket, key, nodeId),
    canWrite: (bucket: string, key?: string, nodeId?: string | null) =>
      canAccess('write', bucket, key, nodeId),
    canWritePrefix,
    canDeletePrefix,
    listBuckets,
    createBucket,
    allowPublicReadCors,
    putTextObject,
    listObjects,
    listObjectsRecursive,
    listObjectVersions,
    listDeletedObjects,
    createFolder,
    uploadObject,
    deleteObject,
    deleteObjectVersion,
    copyObjectVersion,
    deletePrefix,
    deleteBucket,
    headObject,
    downloadUrl,
    getObjectText,
    getObjectBlob,
    fetchUrlText,
  }
}
