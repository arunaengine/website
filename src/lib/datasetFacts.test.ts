import { describe, expect, it } from 'vitest'
import type { MetadataDoc } from '@/data/types'
import { datasetFacts } from './datasetFacts'
import { formatDate } from './utils'

const REALM = 'Q0iiGwoTikaR1gx2t9n6V5yqcDbN0FGLVvxnOYRdsB4'
const USER = `01M63KXP71RJ4MJAEDT9ZJ1VXP@${REALM}`
const names = { group: (id: string) => `group ${id}`, person: (id: string) => (id === USER ? 'Ana Lima' : '') }

function doc(extra: Partial<MetadataDoc>): MetadataDoc {
  return {
    ulid: '01A', title: 'T', description: '', type: 'Dataset', license: '', keywords: [], currentVersion: 1, versions: [],
    linkedObjects: [], primaryBucketId: '', realmId: 'g1', createdAt: '', updatedAt: '2026-10-29T12:00:00Z', author: '',
    organization: '', nodeId: '', profileId: '', contributors: [], roCrate: {}, ...extra,
  }
}

describe('datasetFacts', () => {
  it('gives a dataset its license, authors or else group, binary size and date, leaving unknown size empty', () => {
    const crate = { '@graph': [{ '@id': 'ro-crate-metadata.json', about: { '@id': './' } }, { '@id': './', contentSize: '3758096384' }] }
    expect(datasetFacts(doc({ license: 'https://creativecommons.org/licenses/by/4.0/', roCrate: crate }), names)).toEqual([
      { label: 'License', value: 'CC BY 4.0', title: 'https://creativecommons.org/licenses/by/4.0/' },
      { label: 'By', value: 'group g1' },
      { label: 'Size', value: '3.5\u00a0GiB' },
      { label: 'Updated', value: formatDate('2026-10-29T12:00:00Z'), title: '2026-10-29T12:00:00Z' },
    ])
    expect(datasetFacts(doc({}), names)[2]).toEqual({ label: 'Size', value: '' })
    const authored = { '@graph': [{ '@id': './', author: { '@id': '#ada' } }, { '@id': '#ada', '@type': 'Person', name: 'Ada Byron' }] }
    expect(datasetFacts(doc({ roCrate: authored }), names)[1]).toEqual({ label: 'By', value: 'Ada Byron' })
  })

  it('gives a run the same facts, by the person who started it and never by its group or raw id', () => {
    const graph = [
      { '@id': '#run', '@type': 'CreateAction', startTime: '2026-10-29T12:17:00Z', endTime: '2026-10-29T12:38:12Z', agent: { '@id': `#agent-${USER}` } },
      { '@id': `#agent-${USER}`, '@type': 'Person', identifier: USER },
    ]
    const run = (crate: unknown) => doc({ conformsToIds: ['https://w3id.org/ro/wfrun/workflow/0.5'], license: 'https://creativecommons.org/licenses/by/4.0/', roCrate: crate })
    expect(datasetFacts(run({ '@graph': graph }), names).map((fact) => [fact.label, fact.value])).toEqual([
      ['License', 'CC BY 4.0'],
      ['By', 'Ana Lima'],
      ['Size', ''],
      ['Updated', formatDate('2026-10-29T12:00:00Z')],
    ])
    const unknown = [{ ...graph[0], agent: { '@id': `#agent-01M63KXP71RJ4MJAEDT9ZJ1VXQ@${REALM}` } }, { ...graph[1], identifier: `01M63KXP71RJ4MJAEDT9ZJ1VXQ@${REALM}`, '@id': `#agent-01M63KXP71RJ4MJAEDT9ZJ1VXQ@${REALM}` }]
    expect(datasetFacts(run({ '@graph': unknown }), names)[1]).toEqual({ label: 'By', value: '' })
  })

  it('names the publisher before the group, and no group it cannot name', () => {
    const published = { '@graph': [{ '@id': 'ro-crate-metadata.json', about: { '@id': './' } }, { '@id': './', publisher: { '@id': 'https://ror.org/x' } }, { '@id': 'https://ror.org/x', name: 'NCBI' }] }
    expect(datasetFacts(doc({ roCrate: published }), names)[1]).toEqual({ label: 'By', value: 'NCBI' })
    expect(datasetFacts(doc({}), { ...names, group: () => '' })[1]).toEqual({ label: 'By', value: '' })
  })
})
