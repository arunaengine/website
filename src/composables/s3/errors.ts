import { BUCKET_NAME_REQUIREMENT, OBJECT_KEY_MAX_BYTES, bucketNameProblem } from '@/lib/bucketName'

export class S3ContextMismatchError extends Error {
  constructor(
    public issuerNodeId: string,
    public requiredNodeId: string,
  ) {
    super(`Session issuer ${issuerNodeId} cannot access node ${requiredNodeId}. Open the group on node ${requiredNodeId} first.`)
    this.name = 'S3ContextMismatchError'
  }
}

export class S3SessionUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'S3SessionUnavailableError'
  }
}

// The AWS SDK substitutes this when an S3 error carries no <Message>, which is
// what the S3 framework's parse-time rejections send. It must never reach a
// screen.
const SDK_PLACEHOLDER_MESSAGE = 'UnknownError'

const CODE_SENTENCES: Record<string, string> = {
  BucketAlreadyExists: 'That bucket name is already taken on this node.',
  BucketAlreadyOwnedByYou: 'You already own a bucket with that name.',
  AccessDenied: 'This session is not allowed to do that.',
  InvalidURI: 'That bucket or object address cannot be read as an S3 path.',
  KeyTooLongError: `An object key may be at most ${OBJECT_KEY_MAX_BYTES} bytes.`,
  NoSuchBucket: 'That bucket does not exist.',
  NoSuchKey: 'That object does not exist.',
  OperationAborted: 'The node is still assembling this object from its uploaded parts.',
}

/** A sentence for an S3 failure; `bucket` names the bucket a call was about. */
export function s3ErrorMessage(err: unknown, bucket?: string): string {
  if (isS3PurgeInProgressError(err)) return PURGE_IN_PROGRESS_MESSAGE
  if (!err || typeof err !== 'object') return String(err)
  const error = err as { name?: string; Code?: string; message?: string }
  const code = error.Code ?? error.name
  const message = error.message && error.message !== SDK_PLACEHOLDER_MESSAGE ? error.message : null
  if (code === 'InvalidBucketName') {
    return message ?? (bucket ? bucketNameProblem(bucket) : null) ?? BUCKET_NAME_REQUIREMENT
  }
  const sentence = code ? CODE_SENTENCES[code] : undefined
  if (message) return sentence ?? (code ? `${code}: ${message}` : message)
  if (sentence) return sentence
  if (code) return `The node refused the request with the code ${code}.`
  return String(err)
}

export const PURGE_IN_PROGRESS_MESSAGE =
  'A permanent deletion is running here; retry when it completes.'

export function isS3PurgeInProgressError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const error = err as {
    name?: string
    Code?: string
    code?: string
    status?: number
    statusCode?: number
    $metadata?: { httpStatusCode?: number }
  }
  const status = error.$metadata?.httpStatusCode ?? error.statusCode ?? error.status
  const purgeCode = [error.name, error.Code, error.code].includes('PurgeInProgress')
  return purgeCode && (status === undefined || status === 503)
}

// DeleteBucket refuses a non-empty bucket with the S3 code "BucketNotEmpty"
// (HTTP 409). After a full object purge this only happens on a versioning-
// enabled store, where noncurrent versions and delete markers survive, or
// while an open multipart upload remains. A browser-side current-key sweep
// cannot prove either condition absent.
export function isS3BucketNotEmptyError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const error = err as { name?: string; Code?: string }
  return error.name === 'BucketNotEmpty' || error.Code === 'BucketNotEmpty'
}

const S3_AUTH_ERROR_NAMES = new Set([
  'InvalidAccessKeyId',
  'SignatureDoesNotMatch',
  'ExpiredToken',
  'TokenRefreshRequired',
  'InvalidToken',
  'AccessDenied',
])

// The node rejects writes above the group's grace ceiling with the custom
// S3 code "QuotaExceeded" and HTTP 403 (aruna api/src/s3/error.rs). The SDK
// exposes the code as the error name.
export function isS3QuotaError(err: unknown): boolean {
  return Boolean(err && typeof err === 'object' && (err as { name?: string }).name === 'QuotaExceeded')
}

// A request that never produced an HTTP response: the endpoint is unreachable
// or the browser blocked it (CORS rejections surface as an opaque fetch
// TypeError). Distinct from auth/quota errors, which prove the node answered;
// remote browsing degrades to an info panel on this class of failure.
export function isS3NetworkError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const error = err as { name?: string; message?: string; $metadata?: { httpStatusCode?: number } }
  if (error.$metadata?.httpStatusCode !== undefined) return false
  if (error.name === 'TypeError' || error.name === 'NetworkError' || error.name === 'NetworkingError') {
    return true
  }
  const message = error.message ?? ''
  return /failed to fetch|networkerror|load failed|network request failed/i.test(message)
}

// A rejected or expired session surfaces as one of these SDK error names or as
// a 401/403 from the node. Keep those distinct from transient network faults so
// the UI can offer to open a fresh session.
export function isS3AuthError(err: unknown): boolean {
  // A full group is a 403 too; never misreport it as "credentials rejected".
  if (isS3QuotaError(err)) return false
  if (err && typeof err === 'object') {
    const error = err as { name?: string; $metadata?: { httpStatusCode?: number } }
    if (error.name && S3_AUTH_ERROR_NAMES.has(error.name)) return true
    const status = error.$metadata?.httpStatusCode
    if (status === 401 || status === 403) return true
  }
  return false
}
