import { describe, expect, it } from 'vitest'
import { BUCKET_NAME_REQUIREMENT } from '@/lib/bucketName'
import { s3ErrorMessage } from './errors'

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
    expect(s3ErrorMessage({ name: 'InternalError', message: 'storage backend unavailable' })).toBe(
      'InternalError: storage backend unavailable',
    )
  })
})
