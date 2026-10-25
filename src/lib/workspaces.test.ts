import { describe, expect, it } from 'vitest'
import { isFolderBucket, isHiddenBucket } from './workspaces'

describe('isFolderBucket', () => {
  it('matches the internal folder bucket name', () => {
    expect(isFolderBucket('folder-01m5rs8b3hngjtjva82x7vv8ng')).toBe(true)
  })

  it('rejects near misses', () => {
    expect(isFolderBucket('folder-test')).toBe(false)
    expect(isFolderBucket('folder-01M5RS8B3HNGJTJVA82X7VV8NG')).toBe(false)
    expect(isFolderBucket('folder-01m5rs8b3hngjtjva82x7vv8n')).toBe(false)
    expect(isFolderBucket('folder-01m5rs8b3hngjtjva82x7vv8ngg')).toBe(false)
    expect(isFolderBucket('my-folder-01m5rs8b3hngjtjva82x7vv8ng')).toBe(false)
    expect(isFolderBucket('folder-01m5rs8b3hngjtjva82x7vvlng')).toBe(false)
  })
})

describe('isHiddenBucket', () => {
  it('hides workspace and folder buckets only', () => {
    expect(isHiddenBucket('ws-abc')).toBe(true)
    expect(isHiddenBucket('folder-01m5rs8b3hngjtjva82x7vv8ng')).toBe(true)
    expect(isHiddenBucket('test')).toBe(false)
  })
})
