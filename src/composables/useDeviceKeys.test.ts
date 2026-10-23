import { nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api'
import type { S3CredentialSummary } from '@/lib/api'
import { useDeviceKeys } from './useDeviceKeys'

type Client = { baseUrl: string; token: string }
const clientA: Client = { baseUrl: 'http://127.0.0.1:9000/api/v1', token: 'a' }
const clientB: Client = { baseUrl: 'http://127.0.0.1:9001/api/v1', token: 'b' }
const { deviceClient } = await vi.hoisted(async () => {
  const { ref: make } = await import('vue')
  return { deviceClient: make<{ baseUrl: string; token: string } | null>(null) }
})

const list = vi.fn()
const create = vi.fn()
const revoke = vi.fn()

vi.mock('@/composables/useDeviceStatus', () => ({ useDeviceStatus: () => ({ deviceClient }) }))
vi.mock('@/lib/deviceApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/deviceApi')>()),
  listDeviceCredentials: (client: Client) => list(client),
  createDeviceCredential: (body: unknown, client: Client) => create(body, client),
  revokeDeviceCredential: (id: string, client: Client) => revoke(id, client),
}))

const key = (id: string): S3CredentialSummary => ({
  access_key_id: id,
  group_id: 'g1',
  expires_at: '2027-01-01T00:00:00Z',
  issued_by: 'u1',
  path_restrictions: [],
  status: 'active',
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => (resolve = done))
  return { promise, resolve }
}

// The store is a singleton; a device going away empties it, so each case
// starts from a device that is not there.
async function store() {
  await nextTick()
  return useDeviceKeys()
}

beforeEach(() => {
  deviceClient.value = null
  list.mockReset().mockResolvedValue([])
  create.mockReset()
  revoke.mockReset().mockResolvedValue(undefined)
})

describe('device access keys', () => {
  it('reads and changes keys through the device client only', async () => {
    list.mockResolvedValue([key('ARK1')])
    create.mockResolvedValue({ access_key_id: 'ARK2', access_secret: 's' })
    deviceClient.value = clientA
    const keys = await store()
    await keys.load()

    expect(list).toHaveBeenCalledWith(clientA)
    expect(keys.active.value.map((item) => item.access_key_id)).toEqual(['ARK1'])

    await keys.create('g1', 100)
    expect(create).toHaveBeenCalledWith({ group_id: 'g1', expires_in_seconds: 100 }, clientA)
    await keys.remove('ARK1')
    expect(revoke).toHaveBeenCalledWith('ARK1', clientA)
  })

  it('refuses to make or remove a key without the device', async () => {
    const keys = await store()

    await expect(keys.create('g1', 100)).rejects.toThrow(/not running/)
    await expect(keys.remove('ARK1')).rejects.toThrow(/not running/)
    expect(create).not.toHaveBeenCalled()
    expect(revoke).not.toHaveBeenCalled()
    expect(keys.available.value).toBe(false)
  })

  it('reports an absent node instead of an empty list', async () => {
    const keys = await store()
    await keys.load()

    expect(keys.state.value).toBe('offline')
    expect(keys.active.value).toEqual([])
  })

  it('drops the answer of a node it has since left', async () => {
    const slow = deferred<S3CredentialSummary[]>()
    list.mockReturnValueOnce(slow.promise).mockResolvedValue([key('ARKB')])
    deviceClient.value = clientA
    const keys = await store()
    const pending = keys.load()

    deviceClient.value = clientB
    await vi.waitFor(() => expect(list).toHaveBeenCalledWith(clientB))
    slow.resolve([key('ARKA')])
    await pending
    await vi.waitFor(() => expect(keys.state.value).toBe('ready'))

    expect(keys.active.value.map((item) => item.access_key_id)).toEqual(['ARKB'])
  })

  it('starts from nothing when the device goes away', async () => {
    list.mockResolvedValue([key('ARK1')])
    deviceClient.value = clientA
    const keys = await store()
    await keys.load()

    deviceClient.value = null
    await vi.waitFor(() => expect(keys.active.value).toEqual([]))

    expect(keys.available.value).toBe(false)
  })

  it('keeps the refusal of a node that does not serve keys', async () => {
    const keys = await store()
    list.mockRejectedValue(new ApiError(404, 'no route'))
    deviceClient.value = clientA
    await vi.waitFor(() => expect(keys.state.value).toBe('unsupported'))

    expect(keys.state.value).toBe('unsupported')
    expect(keys.available.value).toBe(false)
  })
})
