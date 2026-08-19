import { describe, expect, it, vi } from 'vitest'
import { ApiError } from './api'
import {
  createOperationId,
  placementPoliciesErrorMessage,
  runBulkToCompletion,
  type BulkRunResponse,
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

describe('residency policy admin helpers', () => {
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
      'Bucket residency policies changed by someone else. Reload the bucket defaults before saving again.',
    )
  })

  it('explains immutable residency policy id reuse', () => {
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
