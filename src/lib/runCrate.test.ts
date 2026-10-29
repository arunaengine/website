import { describe, expect, it } from 'vitest'
import { parseRunCrate, runDuration, runState } from './runCrate'

const RUN = 'https://w3id.org/aruna/01RUNRECORD'
const crate = {
  '@graph': [
    { '@id': 'ro-crate-metadata.json', about: { '@id': RUN } },
    { '@id': RUN, '@type': 'Dataset', conformsTo: { '@id': 'https://w3id.org/ro/wfrun/process/0.5' }, name: 'Annotation', mentions: { '@id': '#run-01EXEC' } },
    {
      '@id': '#run-01EXEC',
      '@type': 'CreateAction',
      location: { '@id': '#execution-site' },
      additionalProperty: [{ '@id': '#cpu-cores' }, { '@id': '#ram-bytes' }],
      object: [{ '@id': 'input-db' }],
    },
    { '@id': '#execution-site', '@type': 'Place', additionalType: 'kubernetes', identifier: 'node-2' },
    { '@id': '#cpu-cores', '@type': 'PropertyValue', propertyID: 'https://w3id.org/aruna/terms/cpu-cores', value: '4' },
    { '@id': '#ram-bytes', '@type': 'PropertyValue', propertyID: 'https://w3id.org/aruna/terms/ram-bytes', value: '8589934592' },
    { '@id': 'input-db', '@type': 'MediaObject', name: 'bakta-db', identifier: '10.5281/zenodo.14916843', version: '6.0 light' },
  ],
}

describe('run crate', () => {
  it('reads where the run executed, its resources and what an input names as its release', () => {
    const run = parseRunCrate(crate, 'runs/01EXEC')!

    expect(run.site).toEqual({ nodeId: 'node-2', kind: 'kubernetes', reason: undefined })
    expect([run.cpuCores, run.ramBytes]).toEqual(['4', '8589934592'])
    expect(run.inputs[0]).toMatchObject({ name: 'bakta-db', identifier: '10.5281/zenodo.14916843', version: '6.0 light' })
  })

  it('leaves what the crate does not say unset', () => {
    const graph = crate['@graph'].filter((entity) => !['#execution-site', '#cpu-cores', '#ram-bytes'].includes(entity['@id']))
    const run = parseRunCrate({ '@graph': graph }, 'runs/01EXEC')!

    expect(run.site).toBeUndefined()
    expect(run.cpuCores).toBeUndefined()
  })
})

describe('run state and duration', () => {
  it('words the end state and the time a run took', () => {
    const run = { inputs: [], outputs: [], actionStatus: 'CompletedActionStatus', startTime: '2026-10-28T10:00:00Z', endTime: '2026-10-28T10:04:12Z' }
    expect(runState(run)).toBe('succeeded')
    expect(runDuration(run)).toBe('4m 12s')
    expect(runDuration({ ...run, endTime: 'later' })).toBe('')
    expect(runState({ inputs: [], outputs: [] })).toBeNull()
  })
})
