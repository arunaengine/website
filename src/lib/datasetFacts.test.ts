import { describe, expect, it } from 'vitest'
import type { MetadataDoc } from '@/data/types'
import { listFacts } from './datasetFacts'
import { formatDate, formatDateTime } from './utils'

const names = { group: (id: string) => `group ${id}`, node: (id: string) => `node ${id}` }

function doc(extra: Partial<MetadataDoc>): MetadataDoc {
  return {
    ulid: '01A', title: 'T', description: '', type: 'Dataset', license: '', keywords: [], currentVersion: 1, versions: [],
    linkedObjects: [], primaryBucketId: '', realmId: 'g1', createdAt: '', updatedAt: '2026-10-29T12:00:00Z', author: '',
    organization: '', nodeId: '', profileId: '', contributors: [], roCrate: {}, ...extra,
  }
}

describe('listFacts', () => {
  it('gives a dataset its license, group, binary size and date, leaving unknown size empty', () => {
    const crate = { '@graph': [{ '@id': 'ro-crate-metadata.json', about: { '@id': './' } }, { '@id': './', contentSize: '3758096384' }] }
    expect(listFacts(doc({ license: 'https://creativecommons.org/licenses/by/4.0/', roCrate: crate }), names)).toEqual([
      { label: 'License', value: 'CC BY 4.0', title: 'https://creativecommons.org/licenses/by/4.0/' },
      { label: 'Group', value: 'group g1' },
      { label: 'Size', value: '3.5 GiB' },
      { label: 'Updated', value: formatDate('2026-10-29T12:00:00Z'), title: '2026-10-29T12:00:00Z' },
    ])
    expect(listFacts(doc({}), names)[2]).toEqual({ label: 'Size', value: '' })
  })

  it('gives a run its start, duration and group instead', () => {
    const crate = { '@graph': [{ '@id': '#run', '@type': 'CreateAction', startTime: '2026-10-29T12:17:00Z', endTime: '2026-10-29T12:38:12Z' }] }
    const facts = listFacts(doc({ conformsToIds: ['https://w3id.org/ro/wfrun/workflow/0.5'], roCrate: crate }), names)
    expect(facts.map((fact) => [fact.label, fact.value])).toEqual([
      ['Started', formatDateTime('2026-10-29T12:17:00Z')],
      ['Duration', '21m 12s'],
      ['Node', ''],
      ['Group', 'group g1'],
    ])
  })
})
