import { describe, expect, it, vi } from 'vitest'
import { ApiError } from './api'
import {
  coverageLimitLabel,
  createOperationId,
  isPolicyListUnsupported,
  listPlacementPolicies,
  normalizeCreatePolicyRequest,
  placementPoliciesErrorMessage,
  policyOwnerLabel,
  runBulkToCompletion,
  type BulkRunResponse,
  type ListPoliciesResponse,
} from './placementPolicies'

function response(overrides: Partial<BulkRunResponse> = {}): BulkRunResponse {
  return {
    operation_id: '01J00000000000000000000000',
    status: 'active',
    generation: 7,
    target_policies: [],
    observed: 4,
    covered: 3,
    minted: 1,
    replanned: 0,
    blocked: [],
    cursor: 'abcd',
    complete: false,
    ...overrides,
  }
}

describe('placement policy admin helpers', () => {
  it('stops a bulk run immediately when the bucket default supersedes it', async () => {
    const post = vi.fn().mockResolvedValue(response({
      status: 'superseded',
      cursor: 'still-returned',
      blocked: [{ key: 'raw/a.fastq', reason: 'policy_unresolved' }],
    }))

    const progress = await runBulkToCompletion(post, undefined, '01J00000000000000000000000')

    expect(post).toHaveBeenCalledTimes(1)
    expect(progress.status).toBe('superseded')
    expect(progress.message).toContain('bucket default changed underneath it')
    expect(progress.blocked).toEqual([{ key: 'raw/a.fastq', reason: 'policy_unresolved' }])
  })

  it('renders the dedicated bucket CAS conflict explanation', () => {
    const message = placementPoliciesErrorMessage(
      new ApiError(409, 'stored generation differs from expected generation', 'Conflict'),
      'bucket-cas',
    )
    expect(message).toBe(
      'Bucket placement policies changed by someone else. Reload the bucket defaults before saving again.',
    )
  })

  it('explains immutable placement policy id reuse', () => {
    const message = placementPoliciesErrorMessage(
      new ApiError(409, 'policy id already carries another definition', 'Conflict'),
      'create',
    )
    expect(message).toContain('Publishing a changed definition requires a new policy id')
  })

  it('generates a backend-parseable ULID-shaped operation id', () => {
    expect(createOperationId(1_755_500_000_000)).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
  })
})

function stubPage(pages: ListPoliciesResponse[], urls: string[]) {
  vi.stubGlobal('window', { location: { origin: 'https://portal.test' } })
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: URL) => {
      urls.push(String(input))
      return new Response(JSON.stringify(pages.shift()), { status: 200 })
    }),
  )
}

describe('placement policy listing', () => {
  it('follows next_cursor across pages', async () => {
    const urls: string[] = []
    const policy = {
      policy_id: '01POLICY',
      digest: 'f'.repeat(64),
      name: 'EU only',
      allowed: [],
      publisher: 'node',
      created_by: 'user@realm',
      created_at_ms: 1,
    }
    stubPage(
      [
        { policies: [policy], next_cursor: 'page-two', complete: false },
        { policies: [policy], next_cursor: null, complete: true },
      ],
      urls,
    )
    const client = { baseUrl: 'https://node.test/api/v1' }

    const first = await listPlacementPolicies({ limit: 50 }, client)
    const second = await listPlacementPolicies(
      { limit: 50, cursor: first.next_cursor!, groupId: 'g-1' },
      client,
    )

    expect(urls).toEqual([
      'https://node.test/api/v1/data/placement/policies?limit=50',
      'https://node.test/api/v1/data/placement/policies?limit=50&cursor=page-two&group_id=g-1',
    ])
    expect(first.complete).toBe(false)
    expect(second.next_cursor).toBeNull()
    vi.unstubAllGlobals()
  })

  it('treats an absent list route as unsupported, not empty', () => {
    expect(isPolicyListUnsupported(new ApiError(404, 'Not found'))).toBe(true)
    expect(isPolicyListUnsupported(new ApiError(405, 'Method not allowed'))).toBe(true)
    expect(isPolicyListUnsupported(new ApiError(403, 'Forbidden'))).toBe(false)
  })
})

describe('placement policy ownership', () => {
  it('carries a trimmed owner into the create request', () => {
    const request = normalizeCreatePolicyRequest({
      name: '  Copies inside the EU ',
      allowed: [{ location: ' eu-west ', labels: [{ key: ' tier ', value: ' cold ' }] }],
      owner_group_id: ' g-1 ',
    })

    expect(request).toEqual({
      name: 'Copies inside the EU',
      allowed: [{ location: 'eu-west', labels: [{ key: 'tier', value: 'cold' }] }],
      owner_group_id: 'g-1',
    })
  })

  it('publishes realm wide when no owner is given', () => {
    expect(normalizeCreatePolicyRequest({ name: 'Any', allowed: [] }).owner_group_id).toBeUndefined()
  })

  it('labels an owner only when the node reports one', () => {
    expect(policyOwnerLabel(undefined)).toBeUndefined()
    expect(policyOwnerLabel(null)).toBe('Realm')
    expect(policyOwnerLabel('g-1', 'Reef survey')).toBe('Reef survey')
  })
})

describe('coverage caveats', () => {
  it('says what a limit means without implementation words', () => {
    expect(coverageLimitLabel('responder_local')).toBe('Counted on this node only')
    expect(coverageLimitLabel('bounded-page')).toBe('One page of a longer listing')
    expect(coverageLimitLabel('unknown_limit')).toBe('unknown limit')
  })
})
