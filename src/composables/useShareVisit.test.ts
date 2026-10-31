import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listVisitFiles } from '@/lib/api'
import { useShareVisit } from './useShareVisit'

let answers: Array<{ status?: number; body?: unknown }> = []
let sent: Array<{ url: string; auth: string | null; body: unknown }> = []
const storage = new Map<string, string>()
const location = { origin: 'https://portal.test', pathname: '/s/node-2', search: '', hash: '' }
const replaceState = vi.fn((_state: unknown, _title: string, url: string) => {
  location.hash = ''
  location.pathname = url
})

const realm = { nodes: [], public_nodes: [{ node_id: 'node-2', api_url: 'https://node2.test/' }, { node_id: 'node-3', api_url: 'https://node3.test/api/v1' }] }
const opened = (expires = Date.now() + 3_600_000) => ({
  body: { visit_token: 'v1', expires_at: new Date(expires).toISOString(), share: { kind: 'folder', name: 'results', mode: 'read' } },
})
const refused = (status: number, code: string) => ({ status, body: { error: code, code } })

beforeEach(() => {
  answers = []
  sent = []
  storage.clear()
  Object.assign(location, { pathname: '/s/node-2', hash: '#L1.secret' })
  replaceState.mockClear()
  vi.stubGlobal('window', {
    location,
    history: { state: null, replaceState },
    sessionStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) },
  })
  vi.stubGlobal('fetch', vi.fn(async (input: URL, init: RequestInit = {}) => {
    sent.push({ url: String(input), auth: new Headers(init.headers).get('Authorization'), body: init.body ? JSON.parse(String(init.body)) : undefined })
    const next = answers.shift() ?? {}
    return new Response(JSON.stringify(next.body ?? {}), { status: next.status ?? 200 })
  }))
})

afterEach(() => vi.unstubAllGlobals())

describe('useShareVisit', () => {
  it('takes the token out of the address bar and opens the link on the node it names', async () => {
    answers.push({ body: realm }, opened())
    const visit = useShareVisit()

    await visit.start('node-2')

    expect(replaceState).toHaveBeenCalledWith(null, '', '/s/node-2')
    expect(sent[1]).toEqual({ url: 'https://node2.test/api/v1/shares/open', auth: 'Share L1.secret', body: {} })
    expect(visit.phase.value).toBe('ready')
    expect(visit.share.value?.name).toBe('results')
    expect(storage.get('aruna.share.node-2')).toBe('L1.secret')
  })

  it('opens the remembered link again after a reload without a fragment', async () => {
    storage.set('aruna.share.node-2', 'L1.secret')
    location.hash = ''
    answers.push({ body: realm }, opened())
    const visit = useShareVisit()

    await visit.start('node-2')

    expect(replaceState).not.toHaveBeenCalled()
    expect(sent[1].auth).toBe('Share L1.secret')
  })

  it('asks for the password, names a wrong one and opens with the right one', async () => {
    answers.push({ body: realm }, refused(401, 'password_required'), refused(401, 'wrong_password'), opened())
    const visit = useShareVisit()

    await visit.start('node-2')
    expect(visit.phase.value).toBe('password')
    expect(visit.error.value).toBeNull()
    await visit.open('wrong')
    expect(visit.error.value).toBe('The password is wrong.')
    await visit.open('right')

    expect(visit.phase.value).toBe('ready')
    expect(sent.at(-1)?.body).toEqual({ password: 'right' })
  })

  it('gives the same answer for an unknown link and a link without a token', async () => {
    answers.push({ body: realm }, refused(404, 'share_unavailable'))
    const unknown = useShareVisit()
    await unknown.start('node-2')
    expect(unknown.phase.value).toBe('broken')

    location.hash = ''
    storage.clear()
    const empty = useShareVisit()
    await empty.start('node-3')
    expect(empty.phase.value).toBe('broken')
  })

  it('asks to wait after too many attempts', async () => {
    answers.push({ body: realm }, refused(429, 'rate_limited'), refused(429, 'rate_limited'))
    const visit = useShareVisit()
    await visit.start('node-2')
    expect(visit.error.value).toBe('Too many attempts. Wait a minute and try again.')
  })

  it('opens the visit again when it ended, keeping the password, and turns broken once the link ended', async () => {
    answers.push({ body: realm }, refused(401, 'password_required'), opened(Date.now() + 10_000))
    const visit = useShareVisit()
    await visit.start('node-2')
    await visit.open('secret')

    answers.push(opened(), { body: { files: [], folders: [] } })
    await visit.visit((token, base) => listVisitFiles({}, token, base))
    expect(sent.at(-2)?.body).toEqual({ password: 'secret' })
    expect(sent.at(-1)?.auth).toBe('Share v1')

    answers.push(refused(404, 'share_unavailable'), refused(404, 'share_unavailable'))
    await expect(visit.visit((token, base) => listVisitFiles({}, token, base))).rejects.toThrow()
    expect(visit.phase.value).toBe('broken')
  })

  it('reads the node from the public list on the portal node and calls an unknown node a broken link', async () => {
    answers.push({ body: realm }, opened(), { body: realm })
    const known = useShareVisit()
    await known.start('node-3')
    expect(sent[0].url).toBe('https://portal.test/api/v1/system/realm')
    expect(sent[0].auth).toBeNull()
    expect(sent[1].url).toBe('https://node3.test/api/v1/shares/open')

    location.hash = '#L2.secret'
    const unknown = useShareVisit()
    await unknown.start('node-9')
    expect(unknown.phase.value).toBe('broken')
    expect(sent).toHaveLength(3)
  })

  it('offers to try again when the realm cannot be read, and then opens the link', async () => {
    answers.push({ status: 400 }, { body: realm }, opened())
    const visit = useShareVisit()
    await visit.start('node-2')
    expect(visit.phase.value).toBe('opening')
    expect(visit.error.value).toBeTruthy()

    await visit.open()
    expect(visit.phase.value).toBe('ready')
    expect(sent.at(-1)?.url).toBe('https://node2.test/api/v1/shares/open')
  })
})
