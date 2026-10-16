import { afterEach, describe, expect, it, vi } from 'vitest'
import { getGroupDeletionBlockers, listGroupBuckets, sortDeletionCheck, type NodeDeletionBlockers } from './groups'

function node(id: string, extra: Partial<NodeDeletionBlockers> = {}): NodeDeletionBlockers {
  return { node_id: id, kinds: [], buckets: [], more: false, ...extra }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('group deletion blockers', () => {
  it('asks the group route with an encoded id', async () => {
    const urls: string[] = []
    vi.stubGlobal('window', { location: { origin: 'https://portal.test' } })
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: URL) => {
        urls.push(String(input))
        return new Response(JSON.stringify({ nodes: [] }), { status: 200 })
      }),
    )

    expect(await getGroupDeletionBlockers('g 1', { baseUrl: 'https://api.test/api/v1' })).toEqual({ nodes: [] })
    expect(urls).toEqual(['https://api.test/api/v1/access/groups/g%201/deletion-blockers'])
  })

  it('splits nodes into blocking, unanswered and empty', () => {
    const blocked = node('a', { kinds: ['S3 buckets'], buckets: ['lab-data'], more: true })
    const failed = node('b', { error: 'node unreachable' })
    const check = sortDeletionCheck({ nodes: [blocked, failed, node('c')] })

    expect(check).toEqual({ blocking: [blocked], unanswered: [failed], empty: ['c'], clear: false })
  })

  it('is clear only when every node answered with nothing', () => {
    expect(sortDeletionCheck({ nodes: [node('a'), node('b')] }).clear).toBe(true)
    expect(sortDeletionCheck({ nodes: [node('a'), node('b', { error: 'down' })] }).clear).toBe(false)
  })
})

describe('group buckets', () => {
  it('reads every page and keeps the bucket names', async () => {
    const pages = [
      { entries: [{ permission_path: '/r/g/g1/data/n/alpha/', kind: 'folder' }], continuation_token: 't2' },
      { entries: [{ permission_path: '/r/g/g1/data/n/beta/', kind: 'folder' }] },
    ]
    const urls: string[] = []
    vi.stubGlobal('window', { location: { origin: 'https://portal.test' } })
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: URL) => {
        urls.push(String(input))
        return new Response(JSON.stringify(pages[urls.length - 1]), { status: 200 })
      }),
    )

    expect(await listGroupBuckets('g1', { baseUrl: 'https://api.test/api/v1' })).toEqual(['alpha', 'beta'])
    expect(urls[1]).toContain('continuation_token=t2')
  })
})
