import { describe, expect, it } from 'vitest'
import { BUCKET_NAME_REQUIREMENT } from '@/lib/bucketName'
import { s3ErrorMessage, s3ErrorReport } from './errors'

describe('s3 error messages', () => {
  it('never renders the SDK placeholder', () => {
    // A parse-time rejection carries a code and no message, and the AWS SDK
    // fills the gap with "UnknownError".
    const bare = { name: 'InvalidBucketName', message: 'UnknownError' }

    expect(s3ErrorMessage(bare, 'b1')).toBe('Bucket names must contain at least 3 characters.')
    expect(s3ErrorMessage(bare)).toBe(BUCKET_NAME_REQUIREMENT)
    expect(s3ErrorMessage({ name: 'SlowDown', message: 'UnknownError' })).toBe(
      'The node refused the request with the code SlowDown.',
    )
  })

  it('prefers the reason the node gave', () => {
    expect(
      s3ErrorMessage({ name: 'InvalidBucketName', message: 'Bucket names must not start with xn--.' }, 'xn--abc'),
    ).toBe('Bucket names must not start with xn--.')
  })

  it('turns a known code into a sentence', () => {
    expect(s3ErrorMessage({ Code: 'BucketAlreadyExists' })).toBe('That bucket name is already taken on this node.')
    expect(s3ErrorMessage({ name: 'NoSuchKey', message: 'UnknownError' })).toBe('That object does not exist.')
    expect(s3ErrorMessage({ name: 'KeyTooLongError' })).toBe('An object key may be at most 1024 bytes.')
  })

  it('keeps an unknown code with its own message', () => {
    expect(s3ErrorMessage({ name: 'SlowDown', message: 'reduce your request rate' })).toBe(
      'SlowDown: reduce your request rate',
    )
  })

  it('never headlines a node-side failure with its internals', () => {
    // A 500 carries a debug string from the node, which no reader can act on.
    const internal = {
      name: 'InternalError',
      message: 'UsageCounter { bytes: 0 } underflow',
      $metadata: { httpStatusCode: 500 },
    }
    const report = s3ErrorReport(internal)

    expect(report.message).toBe('The node hit an internal error and did not complete the request.')
    expect(report.detail).toBe('InternalError: UsageCounter { bytes: 0 } underflow')
    expect(s3ErrorMessage(internal).split('\n')[0]).toBe(report.message)
  })

  it('falls back to a sentence for any other node-side failure', () => {
    const report = s3ErrorReport({
      name: 'ServiceUnavailable',
      message: 'thread panicked at operations/src/quota.rs:41',
      $metadata: { httpStatusCode: 503 },
    })

    expect(report.message).toBe('The node could not complete the request.')
    expect(report.detail).toContain('operations/src/quota.rs')
  })
})
