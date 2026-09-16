import { ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { referencedContent } from '@/test/deletionImpact'
import type { BacklinkPreflightRequest, BacklinkPreflightResponse } from '@/lib/backlinks'

const preflightBacklinks = vi.fn()

vi.mock('@/lib/backlinks', () => ({
  preflightBacklinks: (...args: unknown[]) => preflightBacklinks(...args),
}))
vi.mock('@/composables/useAruna', () => ({
  useAruna: () => ({ authToken: ref('token') }),
}))

const { useBacklinks } = await import('@/composables/useBacklinks')

const request: BacklinkPreflightRequest = {
  target: { kind: 'content_w3ids', content_w3ids: ['w3id://content/reef'] },
}

function deferred() {
  let resolve!: (value: BacklinkPreflightResponse) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<BacklinkPreflightResponse>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('useBacklinks', () => {
  it('keeps only the latest lookup', async () => {
    const first = deferred()
    const second = deferred()
    preflightBacklinks.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const backlinks = useBacklinks()

    const firstLoad = backlinks.load(request, 'https://one/api/v1')
    const firstSignal = preflightBacklinks.mock.calls[0][2] as AbortSignal
    const secondLoad = backlinks.load(request, 'https://two/api/v1')

    expect(firstSignal.aborted).toBe(true)
    expect(backlinks.busy.value).toBe(true)

    first.resolve(referencedContent(3))
    await firstLoad
    expect(backlinks.result.value).toBeNull()
    expect(backlinks.busy.value).toBe(true)

    second.resolve(referencedContent(1))
    await secondLoad
    expect(backlinks.result.value?.targets[0].visible_references).toHaveLength(1)
    expect(backlinks.busy.value).toBe(false)
    expect(preflightBacklinks.mock.calls[1][1]).toEqual({
      baseUrl: 'https://two/api/v1',
      token: 'token',
    })
  })

  it('drops a failure that arrives after a reset', async () => {
    const pending = deferred()
    preflightBacklinks.mockReturnValueOnce(pending.promise)
    const backlinks = useBacklinks()

    const load = backlinks.load(request, 'https://one/api/v1')
    backlinks.reset()
    pending.reject(new Error('node unreachable'))
    await load

    expect(backlinks.error.value).toBeNull()
    expect(backlinks.busy.value).toBe(false)
  })

  it('reports a failed lookup', async () => {
    preflightBacklinks.mockRejectedValueOnce(new Error('node unreachable'))
    const backlinks = useBacklinks()

    await backlinks.load(request, 'https://one/api/v1')

    expect(backlinks.error.value).toContain('node unreachable')
    expect(backlinks.result.value).toBeNull()
    expect(backlinks.busy.value).toBe(false)
  })
})
