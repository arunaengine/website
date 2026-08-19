import { blake3 } from 'hash-wasm'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  s3: {
    endpoint: { value: 'https://s3.example.test' },
    hasActiveKey: { value: true },
    createBucket: vi.fn(),
    allowPublicReadCors: vi.fn(),
    putTextObject: vi.fn(),
  },
  aruna: {
    nodeInfo: { value: { node: { peer_id: 'node-id' } } },
    getGroup: vi.fn(),
    createGroupRole: vi.fn(),
  },
}))

vi.mock('./useS3', () => ({
  useS3: () => mocks.s3,
  isS3NetworkError: () => false,
}))

vi.mock('./useAruna', () => ({
  useAruna: () => mocks.aruna,
}))

import { useProfilePublish } from './useProfilePublish'

describe('useProfilePublish content identities', () => {
  beforeEach(() => {
    for (const value of Object.values(mocks.s3)) {
      if (typeof value === 'function' && 'mockReset' in value) value.mockReset()
    }
    mocks.s3.createBucket.mockResolvedValue(undefined)
    mocks.s3.allowPublicReadCors.mockResolvedValue(undefined)
    mocks.s3.putTextObject.mockResolvedValue(undefined)
    mocks.aruna.getGroup.mockReset().mockResolvedValue({ realm_id: 'realm-id', roles: [] })
    mocks.aruna.createGroupRole.mockReset().mockResolvedValue(undefined)
  })

  it('emits the uploaded artifact W3ID with its path-style contentUrl', async () => {
    const html = '<h1>Profile</h1>'
    const { publishProfileArtifacts } = useProfilePublish()
    const artifacts = await publishProfileArtifacts('GROUP-1', 'example', {
      html,
      schema: '{}',
      mode: '{}',
      shapes: '',
    })

    expect(artifacts.html).toMatchObject({
      id: `https://w3id.org/aruna/data/${await blake3(new TextEncoder().encode(html))}`,
      contentUrl: 'https://s3.example.test/profiles-group-1/profiles/example/profile.html',
      contentSize: new TextEncoder().encode(html).byteLength,
    })
  })
})
