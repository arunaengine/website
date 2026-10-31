import { afterEach, describe, expect, it, vi } from 'vitest'
import { listVisitFiles, openShare, shareUrl, shareUses, ticketUrl } from './shares'
import { crateSummary, expiryFor, modesFor, sameTarget } from '@/lib/shareLinks'

interface Sent {
  url: string
  method: string
  auth: string | null
  body: unknown
}

function stubFetch(answers: Array<{ status?: number; body?: unknown }>): Sent[] {
  const sent: Sent[] = []
  vi.stubGlobal('window', { location: { origin: 'https://portal.test' } })
  vi.stubGlobal('fetch', vi.fn(async (input: URL, init: RequestInit) => {
    const headers = new Headers(init.headers)
    sent.push({ url: String(input), method: init.method ?? 'GET', auth: headers.get('Authorization'), body: init.body ? JSON.parse(String(init.body)) : undefined })
    const next = answers.shift() ?? {}
    return new Response(JSON.stringify(next.body ?? {}), { status: next.status ?? 200 })
  }))
  return sent
}

afterEach(() => vi.unstubAllGlobals())

describe('share link requests', () => {
  it('keeps the token in the fragment of the link', () => {
    expect(shareUrl('https://portal.test/', 'node 1', 'abc.def')).toBe('https://portal.test/s/node%201#abc.def')
  })

  it('opens a link with the Share scheme and never a bearer token', async () => {
    const sent = stubFetch([{ body: { visit_token: 'v1', expires_at: '', share: { kind: 'folder', mode: 'read' } } }, {}])

    await openShare('link-1', undefined, 'https://node.test/api/v1')
    await openShare('link-1', 'secret', 'https://node.test/api/v1')

    expect(sent[0]).toEqual({ url: 'https://node.test/api/v1/shares/open', method: 'POST', auth: 'Share link-1', body: {} })
    expect(sent[1].body).toEqual({ password: 'secret' })
  })

  it('lists a folder with the visit token', async () => {
    const sent = stubFetch([{ body: { files: [], folders: [] } }])

    await listVisitFiles({ prefix: 'plots/' }, 'v1', 'https://node.test/api/v1')

    expect(sent[0].url).toBe('https://node.test/api/v1/shares/visit/files?prefix=plots%2F')
    expect(sent[0].auth).toBe('Share v1')
  })

  it('counts downloads and uploads over every log page', async () => {
    const sent = stubFetch([
      { body: { entries: [{ action: 'open' }, { action: 'download' }, { action: 'upload' }], next: 'L2' } },
      { body: { entries: [{ action: 'download' }, { action: 'wrong_password' }], next: null } },
    ])

    const uses = await shareUses('S1', { baseUrl: 'https://node.test/api/v1', token: 't' })

    expect(uses).toEqual({ downloads: 2, uploads: 1 })
    expect(sent.map((entry) => entry.url)).toEqual([
      'https://node.test/api/v1/shares/S1/log?limit=1000',
      'https://node.test/api/v1/shares/S1/log?after=L2&limit=1000',
    ])
  })

  it('builds the ticket address on the node origin', () => {
    const path = '/api/v1/shares/download?ticket=x'
    expect(ticketUrl('https://node.test/api/v1', path)).toBe('https://node.test/api/v1/shares/download?ticket=x')
    expect(ticketUrl('/api/v1/', path)).toBe(path)
  })
})

describe('share link choices', () => {
  it('offers upload modes for buckets and folders only', () => {
    expect(modesFor({ kind: 'folder', bucket: 'b', prefix: 'x/' })).toEqual(['read', 'read_upload', 'upload'])
    expect(modesFor({ kind: 'object', bucket: 'b', key: 'x' })).toEqual(['read'])
    expect(modesFor({ kind: 'dataset', dataset_id: 'd' })).toEqual(['read'])
  })

  it('ends a link after the chosen days, or never', () => {
    const now = new Date('2026-10-31T10:00:00Z')
    expect(expiryFor('7', now)).toBe('2026-11-07T10:00:00.000Z')
    expect(expiryFor('never', now)).toBeUndefined()
  })

  it('matches links by what they open', () => {
    expect(sameTarget({ kind: 'folder', bucket: 'b', prefix: 'x/' }, { kind: 'folder', bucket: 'b', prefix: 'x/' })).toBe(true)
    expect(sameTarget({ kind: 'bucket', bucket: 'b' }, { kind: 'folder', bucket: 'b', prefix: '' })).toBe(false)
  })

  it('reads the title and description of the root dataset a crate names', () => {
    const rocrate = {
      '@graph': [
        { '@id': 'ro-crate-metadata.json', about: { '@id': 'https://w3id.org/x' } },
        { '@id': './', name: 'Wrong root' },
        { '@id': 'https://w3id.org/x', name: 'Reef survey', description: [{ '@value': 'Counts' }, 'per site'] },
      ],
    }
    expect(crateSummary(rocrate)).toEqual({ title: 'Reef survey', description: 'Counts, per site' })
    expect(crateSummary({})).toEqual({ title: '', description: '' })
  })
})
