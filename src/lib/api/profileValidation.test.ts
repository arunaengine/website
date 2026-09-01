import { afterEach, describe, expect, it, vi } from 'vitest'
import { previewProfileValidation } from './profileValidation'
import { ApiError } from './client'

const CLIENT = { baseUrl: 'https://api.test/api/v1', token: 'bearer-1' }
const ACCEPTED = { accepted: true, state: 'valid', evaluator: 'node', findings: [], completeness: 'complete', structural_violations: [] }

// Answers the first request with `first`, every later one with the accepted
// verdict, and records what was posted.
function stubFetch(first: { status: number; payload: unknown }) {
  const bodies: Array<Record<string, unknown>> = []
  vi.stubGlobal('window', { location: { origin: 'https://portal.test' } })
  vi.stubGlobal('fetch', vi.fn(async (_input: URL, init: RequestInit) => {
    bodies.push(JSON.parse(String(init.body)))
    if (bodies.length === 1) return new Response(JSON.stringify(first.payload), { status: first.status })
    return new Response(JSON.stringify(ACCEPTED), { status: 200 })
  }))
  return bodies
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('profile validation preview', () => {
  it('names the owning group so a group profile resolves', async () => {
    const bodies = stubFetch({ status: 200, payload: ACCEPTED })

    await previewProfileValidation({ '@graph': [] }, CLIENT, undefined, 'group-1')

    expect(bodies).toHaveLength(1)
    expect(bodies[0]).toMatchObject({ group_id: 'group-1' })
  })

  it('retries once without the group a node does not know', async () => {
    const bodies = stubFetch({ status: 400, payload: { message: 'unknown field group_id' } })

    await previewProfileValidation({ '@graph': [] }, CLIENT, undefined, 'group-1')

    expect(bodies).toHaveLength(2)
    expect(bodies[1]).not.toHaveProperty('group_id')
  })

  it('keeps a refusal of the draft itself', async () => {
    const bodies = stubFetch({ status: 400, payload: { message: 'profile_not_registered' } })

    await expect(previewProfileValidation({ '@graph': [] }, CLIENT, undefined, 'group-1'))
      .rejects.toBeInstanceOf(ApiError)
    expect(bodies).toHaveLength(1)
  })
})
