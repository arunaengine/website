import { describe, expect, it } from 'vitest'
import { crateRunState, crateTypeOf } from './crateType'

describe('crateTypeOf', () => {
  it('names runs and profiles from conformsTo and everything else a dataset', () => {
    expect(crateTypeOf({ type: 'Dataset', conformsToIds: ['https://w3id.org/ro/wfrun/workflow/0.5'] })).toBe('workflow-run')
    expect(crateTypeOf({ type: 'Dataset', conformsToIds: ['https://w3id.org/ro/wfrun/provenance/0.5'] })).toBe('workflow-run')
    expect(crateTypeOf({ type: 'Dataset', conformsToIds: ['https://w3id.org/ro/wfrun/process/0.5'] })).toBe('process-run')
    expect(crateTypeOf({ type: 'Dataset, Profile', conformsToIds: [] })).toBe('profile')
    expect(crateTypeOf({ type: 'Dataset', conformsToIds: ['https://w3id.org/workflowhub/workflow-ro-crate/1.0'] })).toBe('dataset')
    expect(crateTypeOf(null)).toBe('dataset')
  })
})

describe('crateRunState', () => {
  const crate = (...statuses: unknown[]) => ({
    '@graph': statuses.map((status, index) => ({ '@id': `#run-${index}`, '@type': 'CreateAction', actionStatus: status })),
  })

  it('fails when one action failed and succeeds only when all completed', () => {
    expect(crateRunState(crate({ '@id': 'http://schema.org/CompletedActionStatus' }, 'FailedActionStatus'))).toBe('failed')
    expect(crateRunState(crate({ '@id': 'http://schema.org/CompletedActionStatus' }, undefined))).toBe('succeeded')
    expect(crateRunState(crate('ActiveActionStatus'))).toBeNull()
    expect(crateRunState({ '@graph': [{ '@id': './', '@type': 'Dataset' }] })).toBeNull()
  })
})
