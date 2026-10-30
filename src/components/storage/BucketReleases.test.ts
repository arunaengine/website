import { defineComponent, h, ref } from 'vue'
import * as VueRuntime from 'vue'
import { describe, expect, it, vi } from 'vitest'
import * as ContentIdentity from '@/lib/contentIdentity'
import * as Releases from '@/lib/releases'
import * as Utils from '@/lib/utils'
import * as DataEntities from '@/lib/dataEntities'
import { compileClientComponent, content, flush, mountApp, moduleDefault } from '@/test/clientRender'

const Slotted = (tag: string) =>
  defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h(tag, attrs, slots.default?.()) })
const release = (label: string, versionId: string, prefix = '') => ({ key: `release-${label}.json`, version_id: versionId, label, prefix })
const listReleases = vi.fn(async () => ({
  bucket: 'bakta-db',
  complete: true,
  releases: [release('6.0', '01M62DCH5J7HXR3V6784DBERPA', 'db/'), release('5.1', '01M62DCH5J7HXR3V6784DBERPB')],
}))
// The release crate of 6.0 names its preparation run; 5.1 names none. Its file was written by the
// release route, so an origin read would wrongly answer an upload for both.
const releasePreparation = vi.fn(async (objectId: string) => (objectId.endsWith('PA') ? ['run-1'] : []))
const getRun = vi.fn(async () => ({ run_id: 'run-1', run_crate: 'record-1' }))
const fetchRoCrateRaw = vi.fn(async () => ({
  '@graph': [
    { '@id': 'ro-crate-metadata.json', about: { '@id': './' } },
    { '@id': './', '@type': 'Dataset', name: 'Prepare Bakta DB 6.0 light', conformsTo: { '@id': 'https://w3id.org/ro/wfrun/process/0.5' } },
  ],
}))

const component = compileClientComponent(new URL('./BucketReleases.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { RouterLink: defineComponent({ props: { to: Object }, setup: (props, { slots }) => () => h('a', { href: JSON.stringify(props.to) }, slots.default?.()) }) },
  '@/components/ui/Button.vue': moduleDefault(Slotted('button')),
  '@/components/ui/Input.vue': moduleDefault(Slotted('input')),
  '@/components/ui/Notice.vue': moduleDefault(Slotted('aside')),
  '@/components/ui/Spinner.vue': moduleDefault(Slotted('span')),
  '@/components/ui/SectionHeading.vue': moduleDefault(defineComponent({
    props: { title: String, count: String, info: String },
    setup: (props, { slots }) => () => h('div', [h('h2', props.title), props.count ?? '', props.info ? h('i', { 'data-info': props.info }) : null, slots.actions?.()]),
  })),
  '@/composables/aruna/state': { nodeClientReady: async () => ({ baseUrl: 'https://node.test', token: 't' }) },
  '@/composables/useAruna': {
    useAruna: () => ({ listReleases, publishRelease: vi.fn(), sessionEpoch: ref(1), nodeInfo: ref({ node: { realm_id: 'realm', peer_id: 'node-2' } }), fetchRoCrateRaw }),
  },
  '@/lib/api': { apiErrorMessage: String, getRun, releasePreparation },
  '@/lib/contentIdentity': ContentIdentity,
  '@/lib/dataEntities': DataEntities,
  '@/lib/databases': { pageIdentifier: () => null },
  '@/lib/releases': Releases,
  '@/lib/utils': Utils,
  '@lucide/vue': { Plus: Slotted('i'), Tag: Slotted('i') },
})

describe('bucket releases', () => {
  it('lists version, files, who made it and when it was published', async () => {
    const { root } = await mountApp(component, { props: { bucket: 'bakta-db', nodeId: null, canPublish: true } })
    await flush()
    const text = content(root).replace(/\s+/g, '')

    expect(text).toContain('VersionFilesMadebyPublished')
    expect(text).toContain('6.0db/PrepareBaktaDB6.0light')
    expect(text).toContain('5.1WholebucketByhand')
    expect(text).toContain(Utils.formatDate('2026-10-28T23:26:37.234Z').replace(/\s+/g, ''))
    expect(getRun).toHaveBeenCalledWith('run-1', { baseUrl: 'https://node.test', token: 't' })
    expect(releasePreparation).toHaveBeenCalledWith(
      'https://w3id.org/aruna/data/arn:aruna:realm:node-2:s3/bakta-db/release-6.0.json@01M62DCH5J7HXR3V6784DBERPA',
      { baseUrl: 'https://node.test', token: 't' },
    )
  })
})
