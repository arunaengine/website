import { createSSRApp, defineComponent, h } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { describe, expect, it, vi } from 'vitest'
import type { MetadataDoc } from '@/data/types'
import { PROCESS_RUN_PROFILE_URI } from '@/lib/profiles/builtinProfiles'

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
  RouterLink: defineComponent({
    props: { to: { type: Object, required: true } },
    setup: (props, { slots }) => () => h('a', { href: JSON.stringify(props.to) }, slots.default?.()),
  }),
}))

const RunRecordTable = (await import('./RunRecordTable.vue')).default

const crate = {
  '@graph': [
    { '@id': 'ro-crate-metadata.json', '@type': 'CreativeWork', about: { '@id': './' } },
    { '@id': './', '@type': 'Dataset', name: 'Annotate my genome with Bakta', conformsTo: { '@id': PROCESS_RUN_PROFILE_URI }, mentions: { '@id': '#run' } },
    { '@id': '#run', '@type': 'CreateAction', name: 'Annotate', actionStatus: 'CompletedActionStatus', instrument: { '@id': '#tool' }, result: [{ '@id': 'a.gbff' }, { '@id': 'a.faa' }] },
    { '@id': '#tool', '@type': 'SoftwareApplication', name: 'bakta-rs' },
    { '@id': 'a.gbff', '@type': 'File', name: 'a.gbff' },
    { '@id': 'a.faa', '@type': 'File', name: 'a.faa' },
  ],
}
function doc(extra: Partial<MetadataDoc>): MetadataDoc {
  return { ulid: 'd1', title: 'Annotate my genome with Bakta', description: '', type: '', license: 'https://creativecommons.org/licenses/by/4.0/', keywords: [], currentVersion: 1, versions: [],
    linkedObjects: [], primaryBucketId: '', realmId: 'g-demo', createdAt: '', updatedAt: '2026-10-29T10:00:00Z', author: '', organization: '', nodeId: '', profileId: '', contributors: [], roCrate: crate, ...extra }
}
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

describe('run record table', () => {
  it('lists the newest record first', async () => {
    const docs = [doc({ ulid: 'old', title: 'Prepare Bakta DB', updatedAt: '2026-10-29T09:00:00Z' }), doc({ ulid: 'new', title: 'Annotate a genome', updatedAt: '2026-10-29T11:00:00Z' })]
    const html = text(await renderToString(createSSRApp(RunRecordTable, { docs, groupNames: new Map() })))
    expect(html.indexOf('Annotate a genome')).toBeLessThan(html.indexOf('Prepare Bakta DB'))
  })

  it('names the tool, group, result count and license, and links the record and its group', async () => {
    const html = await renderToString(createSSRApp(RunRecordTable, { docs: [doc({})], groupNames: new Map([['g-demo', 'demo']]) }))

    expect(text(html)).toContain('Annotate my genome with Bakta')
    expect(text(html)).toContain('bakta-rs')
    expect(text(html)).toContain('demo')
    expect(text(html)).toContain('2 files')
    expect(text(html)).toContain('CC BY 4.0')
    expect(html).toContain('aria-label="Completed"')
    expect(html).toContain(JSON.stringify({ name: 'group', params: { id: 'g-demo' } }).replaceAll('"', '&quot;'))
    expect(html).toContain(JSON.stringify({ name: 'dataset', params: { id: 'd1' } }).replaceAll('"', '&quot;'))
  })

  it('leaves out what the summary does not say instead of a zero', async () => {
    const html = await renderToString(createSSRApp(RunRecordTable, { docs: [doc({ roCrate: {}, license: '' })], groupNames: new Map() }))

    expect(text(html)).not.toContain('0 files')
    expect(html).not.toContain('aria-label="Completed"')
    expect(text(html)).toContain('g-demo')
  })
})
