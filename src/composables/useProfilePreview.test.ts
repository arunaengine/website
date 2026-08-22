import { effectScope, type EffectScope } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useProfilePreview } from './useProfilePreview'
import type { ProfileValidationPreviewResponse } from '@/lib/api'

const CLIENT = { baseUrl: 'https://api.test/api/v1', token: 'bearer-token' }
const CRATE = { '@context': 'https://w3id.org/ro/crate/1.3/context', '@graph': [] }

const pending: Array<(value: Response) => void> = []
let scope: EffectScope | undefined

function body(accepted: boolean): ProfileValidationPreviewResponse {
  return {
    accepted,
    state: accepted ? 'valid' : 'invalid',
    profile_id: 'profile-1',
    profile_iri: 'https://w3id.org/aruna/profile/profile-1',
    profile_revision: 'rev-1',
    evaluator: 'craqle',
    findings: accepted
      ? []
      : [{
          code: 'constraint_violation',
          severity: 'violation',
          rule: 'http://www.w3.org/ns/shacl#minCount',
          message: 'A required value is missing.',
          completeness: 'complete',
        }],
    completeness: 'complete',
    structural_violations: [],
  }
}

function setupPreview() {
  scope = effectScope()
  return scope.run(() => useProfilePreview({ client: () => CLIENT }))!
}

function answer(index: number, payload: unknown, status = 200, headers: Record<string, string> = {}) {
  pending[index]!(new Response(JSON.stringify(payload), { status, headers }))
}

// Drains the promise chain apiRequest walks (fetch, buffer, text, parse).
async function flush() {
  for (let index = 0; index < 12; index += 1) await Promise.resolve()
}

beforeEach(() => {
  vi.useFakeTimers()
  pending.length = 0
  vi.stubGlobal('window', { location: { origin: 'https://portal.test' } })
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => { pending.push(resolve) })))
})

afterEach(() => {
  scope?.stop()
  scope = undefined
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('server profile validation preview', () => {
  it('debounces form-change previews and reports an accepted draft', async () => {
    const preview = setupPreview()

    preview.preview(CRATE)
    vi.advanceTimersByTime(499)
    expect(fetch).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(preview.running.value).toBe(true)

    const [url, init] = vi.mocked(fetch).mock.calls[0] as [URL, RequestInit]
    expect(String(url)).toBe('https://api.test/api/v1/metadata/profile-validation/preview')
    expect(init.method).toBe('POST')
    expect(init.body).toBe(JSON.stringify({ rocrate: CRATE }))
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer bearer-token')

    answer(0, body(true))
    await flush()

    expect(preview.running.value).toBe(false)
    expect(preview.error.value).toBeNull()
    expect(preview.result.value?.accepted).toBe(true)
  })

  it('keeps the newest verdict when an older request settles last', async () => {
    const preview = setupPreview()

    preview.previewNow(CRATE)
    preview.previewNow({ ...CRATE, name: 'edited' })
    expect(fetch).toHaveBeenCalledTimes(2)

    answer(1, body(false))
    await flush()
    answer(0, body(true))
    await flush()

    expect(preview.result.value?.state).toBe('invalid')
    expect(preview.result.value?.findings).toHaveLength(1)
    expect(preview.running.value).toBe(false)
  })

  it('marks the preview unavailable when the node does not serve it', async () => {
    const preview = setupPreview()

    preview.previewNow(CRATE)
    answer(0, { message: 'Not Found' }, 404)
    await flush()

    expect(preview.unavailable.value).toBe(true)
    expect(preview.result.value).toBeNull()
    expect(preview.error.value).toBeNull()

    preview.previewNow(CRATE)
    preview.preview(CRATE)
    vi.advanceTimersByTime(1_000)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('surfaces a retryable error when the validator is unavailable', async () => {
    const preview = setupPreview()

    preview.previewNow(CRATE)
    answer(0, { message: 'Validator unavailable.' }, 503, { 'Retry-After': '5' })
    await flush()

    expect(preview.unavailable.value).toBe(false)
    expect(preview.running.value).toBe(false)
    expect(preview.error.value).toBe('Validator unavailable.')

    preview.previewNow(CRATE)
    expect(fetch).toHaveBeenCalledTimes(2)
    answer(1, body(true))
    await flush()

    expect(preview.error.value).toBeNull()
    expect(preview.result.value?.accepted).toBe(true)
  })

  it('drops a pending preview and the last result on reset', async () => {
    const preview = setupPreview()

    preview.previewNow(CRATE)
    answer(0, body(false))
    await flush()
    preview.preview(CRATE)
    preview.reset()
    vi.advanceTimersByTime(1_000)

    expect(fetch).toHaveBeenCalledTimes(1)
    expect(preview.result.value).toBeNull()
    expect(preview.running.value).toBe(false)
  })
})
