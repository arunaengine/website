import { describe, expect, it, vi } from 'vitest'
import { apiRequest } from '@/lib/api'

vi.mock('@/lib/api', async (original) => ({ ...(await original<typeof import('@/lib/api')>()), apiRequest: vi.fn(async () => 'answer') }))

const state = await import('./state')

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))
const node2 = { node_id: 'node-2', info: { urls: { api: 'https://api.node-2.test' } } }

describe('requests to another node on a fresh load', () => {
  it('wait until the realm read with the token names the node', async () => {
    state.authToken.value = 't'
    state.sessionEpoch.value = 7
    // The first realm answer was asked without a token and names no node.
    state.realmInfo.value = { realm_id: 'r', nodes: [] } as never
    const answer = state.request('/data/buckets/ncbi-refseq/metadata', {}, 'node-2')
    await settle()
    expect(apiRequest).not.toHaveBeenCalled()

    state.realmInfo.value = { realm_id: 'r', nodes: [node2] } as never
    state.realmReadEpoch.value = 7
    await expect(answer).resolves.toBe('answer')
    expect(apiRequest).toHaveBeenCalledWith('/data/buckets/ncbi-refseq/metadata', {}, { baseUrl: 'https://api.node-2.test/api/v1', token: 't' })
  })

  it('fail once the read realm does not name the node', async () => {
    state.authToken.value = 't'
    state.sessionEpoch.value = 8
    state.realmInfo.value = { realm_id: 'r', nodes: [] } as never
    const answer = state.nodeClientReady('node-9')
    state.realmReadEpoch.value = 8
    await expect(answer).rejects.toThrow('The node publishes no API address.')
  })
})
