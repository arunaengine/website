import { describe, expect, it } from 'vitest'
import { defaultPlace, freeSpace, placeName, placeTitle } from './bucketPlace'

const node = (nodeId: string, kind: 'management' | 'server' | 'user', extra: Record<string, unknown> = {}) => ({
  nodeId,
  kind,
  label: `label-${nodeId}`,
  isLocal: false,
  location: null,
  reachable: true,
  apiBase: null,
  s3Url: null,
  ...extra,
})

describe('place names', () => {
  it('names this computer, another device and a realm node with its location', () => {
    expect(placeName(node('dev', 'user', { isLocal: true }))).toBe('This computer')
    expect(placeName(node('laptop', 'user', { label: "Lena's laptop" }))).toBe("Lena's laptop")
    expect(placeName(node('n1', 'server', { label: 'node-1', location: 'Giessen' }))).toBe('node-1 · Giessen')
    expect(placeName(node('n2', 'server', { label: 'node-2' }))).toBe('node-2')
  })

  it('keeps kind and id prefix for the tooltip', () => {
    expect(placeTitle(node('12D3KooWabcdefghijkl', 'user'))).toBe('device 12D3KooW…ijkl')
  })
})

describe('default place', () => {
  it('prefers the realm node the shell remembers', () => {
    const nodes = [
      node('dev', 'user', { isLocal: true }),
      node('n1', 'server', { apiBase: 'https://api.node-1.example/api/v1' }),
      node('n2', 'server', { apiBase: 'https://api.node-2.example/api/v1' }),
    ]
    expect(defaultPlace(nodes, 'https://api.node-2.example')).toBe('n2')
  })

  it('falls back to the first reachable realm node, never this computer', () => {
    const nodes = [
      node('dev', 'user', { isLocal: true }),
      node('n1', 'server', { reachable: false }),
      node('n2', 'management'),
    ]
    expect(defaultPlace(nodes, 'https://aruna.example')).toBe('n2')
    expect(defaultPlace([node('dev', 'user', { isLocal: true })], null)).toBeNull()
  })
})

describe('free space', () => {
  const info = (backends: Array<{ quota_bytes?: number | null; used_bytes?: number }>) =>
    ({ services: { blob: { status: 'ok', backends } } }) as never

  it('sums what is left under each reported quota', () => {
    expect(freeSpace(info([{ quota_bytes: 100, used_bytes: 40 }, { quota_bytes: 10, used_bytes: 20 }]))).toBe(60)
  })

  it('reports nothing when no backend has a quota and usage', () => {
    expect(freeSpace(info([{ quota_bytes: null, used_bytes: 5 }, { quota_bytes: 50 }]))).toBeNull()
    expect(freeSpace(null)).toBeNull()
  })
})
