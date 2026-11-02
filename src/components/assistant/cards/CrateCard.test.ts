import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it } from 'vitest'
import CrateCard from './CrateCard.vue'
import type { DatasetSummary } from '@/lib/assistant/types'

const Stub = { render: () => null }

async function render(props: { title: string; crate: unknown; documentId?: string; summary?: DatasetSummary }): Promise<string> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/app/datasets/:id', name: 'dataset', component: Stub },
      { path: '/app/groups/:id', name: 'group', component: Stub },
      { path: '/app/status', name: 'status', component: Stub },
      { path: '/app/buckets/:bucketId', name: 'bucket', component: Stub },
      { path: '/:rest(.*)', component: Stub },
    ],
  })
  const app = createSSRApp({ render: () => h(CrateCard, props) })
  app.use(router)
  await router.push('/')
  await router.isReady()
  return renderToString(app)
}

const crate = {
  '@graph': [
    { '@id': 'ro-crate-metadata.json', '@type': 'CreativeWork', about: { '@id': './' } },
    { '@id': './', '@type': 'Dataset', name: 'Pictures', description: 'Holiday pictures.', hasPart: { '@id': 'a.png' } },
    { '@id': 'a.png', '@type': 'File', name: 'a.png' },
  ],
}

describe('CrateCard', () => {
  it('offers the graph when it has the crate', async () => {
    const markup = await render({ title: 'Pictures', crate })

    expect(markup).toContain('Holiday pictures.')
    expect(markup).toContain('Show graph')
    expect(markup).toContain('aria-pressed="false"')
  })

  it('offers no graph when it only has the id', async () => {
    const markup = await render({ title: 'Pictures', crate: {}, documentId: '01M1NXGE23RMY4RFBRBYTQDWDS' })

    expect(markup).not.toContain('Show graph')
    expect(markup).toContain('Open the dataset')
  })

  it('shows the size, owner and last change of a dataset, and leaves unknown facts out', async () => {
    const sized = {
      '@graph': [
        crate['@graph'][0],
        { ...crate['@graph'][1], hasPart: [{ '@id': 'a.png' }] },
        { '@id': 'a.png', '@type': 'File', name: 'a.png', contentSize: '2048' },
      ],
    }
    const markup = await render({
      title: 'Pictures',
      crate: sized,
      documentId: 'doc-1',
      summary: { public: false, groupId: 'g-1', groupName: 'Lab', updatedAt: '2026-10-29T10:00:00Z' },
    })
    const bare = await render({ title: 'Pictures', crate: sized, summary: { public: true, groupId: 'g-1' } })

    expect(markup).toContain('Private')
    expect(markup).toContain('2\u00a0KiB in 1\u00a0file')
    expect(markup).toContain('href="/app/groups/g-1"')
    expect(markup).toContain('29 Oct 2026')
    expect(bare).toContain('Public')
    expect(bare).not.toContain('Owner')
    expect(bare).not.toContain('Updated')
  })

  it('shows a run record by its state, timing, place, inputs and outputs, without raw entities', async () => {
    const RUN = 'https://w3id.org/aruna/01RUN'
    const record = {
      '@graph': [
        { '@id': 'ro-crate-metadata.json', about: { '@id': RUN } },
        { '@id': RUN, '@type': 'Dataset', conformsTo: { '@id': 'https://w3id.org/ro/wfrun/process/0.5' }, mentions: { '@id': '#run-1' } },
        {
          '@id': '#run-1',
          '@type': 'CreateAction',
          actionStatus: 'CompletedActionStatus',
          startTime: '2026-10-29T13:57:48Z',
          endTime: '2026-10-29T14:02:00Z',
          agent: { '@id': 'agent-01M6CBABRVVJ3T56541CEGP6N4' },
          location: { '@id': '#execution-site' },
          object: [{ '@id': 'genome' }],
          result: [{ '@id': 'out' }],
        },
        { '@id': '#execution-site', '@type': 'Place', identifier: 'node-2' },
        { '@id': 'agent-01M6CBABRVVJ3T56541CEGP6N4', '@type': 'Person', name: 'agent-01M6CBABRVVJ3T56541CEGP6N4' },
        { '@id': 'genome', '@type': 'File', isPartOf: [{ '@id': '#bucket-metadata-02' }] },
        { '@id': '#bucket-metadata-02', '@type': 'Dataset', name: 'NCBI RefSeq genomes (at admission)' },
        { '@id': 'out', '@type': 'File', contentSize: '1024', contentUrl: 's3://work/results/bakta/genome.gff3' },
      ],
    }
    const markup = await render({ title: 'Bakta', crate: record, documentId: 'doc-1' })

    expect(markup).toContain('Succeeded')
    expect(markup).toContain('Finished')
    expect(markup).toContain('4m 12s')
    expect(markup).toContain('Ran on')
    expect(markup).toContain('1\u00a0dataset, 1\u00a0file')
    expect(markup).toContain('NCBI RefSeq genomes')
    expect(markup).toContain('1\u00a0result file, 1\u00a0KiB')
    expect(markup).toContain('work/results/bakta/')
    expect(markup).toContain('Open the run')
    expect(markup).not.toContain('agent-01M6')
    expect(markup).not.toContain('Described entities')
  })
})
