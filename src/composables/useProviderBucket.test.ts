import { effectScope, nextTick, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/composables/useAruna', () => ({
  useAruna: () => ({ apiBaseUrl: ref('https://home.test/api/v1'), authToken: ref('t'), sessionEpoch: ref(1) }),
}))
vi.mock('@/composables/s3/endpoints', () => ({ nodeApiBase: (id: string) => `https://${id}.test/api/v1` }))

const { useProviderBucket } = await import('./useProviderBucket')

const BACKENDS = {
  backends: [
    { backend_id: 'split', group_id: 'g1', kind: 's3', name: 'lab', public_config: { endpoint: 'https://s3.lab' } },
    { backend_id: 'fixed', group_id: 'g1', kind: 's3', name: 'old', public_config: { bucket: 'one' } },
  ],
}
const LINK = { import_id: 'i', bucket: 'results', key_prefix: '', created_at: '' }

let urls: string[] = []
function serve(imports: unknown[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: URL) => {
      const url = String(input)
      urls.push(url)
      return Response.json(url.endsWith('/storage/imports') ? { imports } : BACKENDS)
    }),
  )
}

const settle = async () => {
  for (let i = 0; i < 6; i++) await nextTick()
  await new Promise((resolve) => setTimeout(resolve, 0))
}

function start(node: string | null) {
  const nodeId = ref(node)
  const scope = effectScope()
  const provider = scope.run(() => useProviderBucket(ref('results'), ref('g1'), nodeId))!
  return { nodeId, provider }
}

beforeEach(() => {
  urls = []
  vi.stubGlobal('window', { location: { origin: 'https://portal.test' } })
})
afterEach(() => vi.unstubAllGlobals())

describe('provider bucket line', () => {
  it('asks the browsed node and names the first folder of a whole-bucket link', async () => {
    serve([{ ...LINK, backend_id: 'split', backend_prefix: 'team-a-results/' }])
    const { provider } = start('node-2')
    await settle()

    expect(urls.every((url) => url.startsWith('https://node-2.test/api/v1/data/groups/g1/storage/'))).toBe(true)
    expect(provider.value).toBe('team-a-results')
  })

  it('asks again when the browsed node changes', async () => {
    serve([{ ...LINK, backend_id: 'split', backend_prefix: 'team-a-results/' }])
    const { nodeId } = start(null)
    await settle()
    expect(urls[0]).toMatch(/^https:\/\/home\.test\//)

    nodeId.value = 'node-3'
    await settle()
    expect(urls.slice(2).every((url) => url.startsWith('https://node-3.test/'))).toBe(true)
    expect(urls).toHaveLength(4)
  })

  it('names nothing for a folder link or a storage with a fixed bucket', async () => {
    serve([
      { ...LINK, backend_id: 'split', backend_prefix: 'team-a-results/', key_prefix: 'raw/' },
      { ...LINK, backend_id: 'fixed', backend_prefix: 'data/' },
    ])
    const { provider } = start(null)
    await settle()

    expect(provider.value).toBeNull()
  })
})
