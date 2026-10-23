import { describe, expect, it } from 'vitest'
import { releaseName, versionGap } from './updateRequired'

describe('version gap', () => {
  it('tells which side is ahead', () => {
    expect(versionGap('3.0.0-alpha.131', '3.0.0-alpha.133')).toBe('realm-newer')
    expect(versionGap('3.0.0-alpha.140', '3.0.0-alpha.133')).toBe('realm-older')
    expect(versionGap('3.0.0-alpha.99', '3.0.0-alpha.100')).toBe('realm-newer')
    expect(versionGap('3.1.0-alpha.1', '3.0.0-alpha.133')).toBe('realm-older')
  })

  it('puts a pre-release below the release it leads up to', () => {
    expect(versionGap('3.0.0-alpha.133', '3.0.0')).toBe('realm-newer')
    expect(versionGap('3.0.0', '3.0.0-alpha.133')).toBe('realm-older')
    expect(versionGap('3.0.0-alpha.2', '3.0.0-alpha.10')).toBe('realm-newer')
    expect(versionGap('3.0.0-alpha.1', '3.0.0-beta.1')).toBe('realm-newer')
    expect(versionGap('3.0.0-alpha', '3.0.0-alpha.1')).toBe('realm-newer')
  })

  it('does not guess when the versions are equal or not versions', () => {
    expect(versionGap('3.0.0', '3.0.0+build.5')).toBe('unknown')
    expect(versionGap('3.0', '3.0.1')).toBe('unknown')
    expect(versionGap('3.0.0-alpha.131', '3.0.0-alpha.131')).toBe('unknown')
    expect(versionGap('dev', '3.0.0-alpha.131')).toBe('unknown')
  })
})

describe('release name', () => {
  it('keeps the tag people say out loud', () => {
    expect(releaseName('3.0.0-alpha.133')).toBe('alpha.133')
    expect(releaseName('3.0.0')).toBe('3.0.0')
  })
})
