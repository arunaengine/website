import { afterEach, describe, expect, it, vi } from 'vitest'
import { downloadProvenanceCrate, getRun, getVersionOrigin } from './provenance'

const client = { baseUrl: 'https://api.test/api/v1', token: 'tok' }

function stubFetch(status: number, body: BodyInit | null) {
  const calls: { url: string; auth: string | null }[] = []
  vi.stubGlobal('window', { location: { origin: 'https://portal.test' } })
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: URL, init: RequestInit) => {
      calls.push({ url: String(input), auth: new Headers(init.headers).get('Authorization') })
      return new Response(body, { status })
    }),
  )
  return calls
}

afterEach(() => vi.unstubAllGlobals())

describe('provenance requests', () => {
  it('reads an origin by version id and a run by id', async () => {
    const calls = stubFetch(200, JSON.stringify({ run_id: 'r1' }))
    await getVersionOrigin('https://w3id.org/aruna/data/realm/01K8', client)
    await getRun('r/1', client)

    expect(new URL(calls[0].url).searchParams.get('version')).toBe('https://w3id.org/aruna/data/realm/01K8')
    expect(calls[1].url).toBe('https://api.test/api/v1/compute/runs/r%2F1')
  })

  it('downloads the crate with the token in a header, never in the URL', async () => {
    const calls = stubFetch(200, 'zip')
    const blob = await downloadProvenanceCrate({ dataset: 'd1' }, client)

    expect(await blob.text()).toBe('zip')
    expect(calls[0].url).toBe('https://api.test/api/v1/data/provenance/crate?dataset=d1')
    expect(calls[0].auth).toBe('Bearer tok')
  })

  it('reports a refused export with the node message', async () => {
    stubFetch(400, JSON.stringify({ error: 'give either version or dataset' }))
    await expect(downloadProvenanceCrate({ version: '' }, client)).rejects.toMatchObject({ status: 400, message: 'give either version or dataset' })
  })
})
