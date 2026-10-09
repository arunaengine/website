import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RealmInfoResponse } from '@/lib/api'
import { checkOwnerNode, importKey, ownerNodeAllowed } from './transfer'

function realmWith(nodes: Array<{ api: string | null; configured?: boolean }>) {
  return {
    nodes: nodes.map((node, index) => ({
      node_id: `n${index}`,
      configured: node.configured ?? true,
      info: { urls: { api: node.api } },
    })),
  } as unknown as RealmInfoResponse
}

afterEach(() => vi.unstubAllGlobals())

describe('ownerNodeAllowed', () => {
  it('accepts a configured node of this realm, ignoring a trailing slash', () => {
    const realm = realmWith([{ api: 'https://b1.example/api/v1/' }])
    expect(ownerNodeAllowed('https://b1.example/api/v1', realm)).toBe(true)
  })

  it('refuses a node the other realm made up, or one no longer configured', () => {
    const realm = realmWith([{ api: 'https://b1.example/api/v1' }, { api: 'https://old.example/api/v1', configured: false }])
    expect(ownerNodeAllowed('https://evil.example/api/v1', realm)).toBe(false)
    expect(ownerNodeAllowed('https://old.example/api/v1', realm)).toBe(false)
    expect(ownerNodeAllowed('not a url', realm)).toBe(false)
  })
})

describe('checkOwnerNode', () => {
  it('reads the node list from this realm and sends the token only there', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify(realmWith([{ api: 'https://b1.example/api/v1' }]))))
    vi.stubGlobal('fetch', fetch)
    vi.stubGlobal('window', { location: { origin: 'https://b.example' } })
    await expect(checkOwnerNode('https://evil.example/api/v1', 'https://b.example/api/v1', 'TOKEN')).rejects.toThrow('not part of this realm')
    const calls = fetch.mock.calls as unknown as Array<[URL]>
    expect(calls.every(([url]) => String(url).startsWith('https://b.example/'))).toBe(true)
  })
})

describe('importKey', () => {
  const grant = {
    source: Array.from({ length: 32 }, (_, index) => index),
    document_id: '01JJ0B0123456789ABCDEFGHJK',
    dataset_digest: 'aa'.repeat(32),
    selection_digest: 'bb'.repeat(32),
  } as never
  const destination = { group_id: 'G', bucket: 'imports', prefix: 'giessen/river', metadata_path: 'datasets/river' }

  it('matches the key the Rust code makes', async () => {
    expect(await importKey(grant, destination)).toBe(
      'federation-04a2c404ebc44733d4c5b288e20659a1a76f2d7c6ab914422cecef8132c83a09',
    )
  })

  it('changes with the destination', async () => {
    const moved = await importKey(grant, { ...destination, prefix: 'giessen' })
    expect(moved).not.toBe(await importKey(grant, destination))
  })
})
