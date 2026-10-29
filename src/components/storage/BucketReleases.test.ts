import { defineComponent, h, ref } from 'vue'
import * as VueRuntime from 'vue'
import { describe, expect, it, vi } from 'vitest'
import * as Releases from '@/lib/releases'
import { compileClientComponent, content, flush, mountApp, moduleDefault } from '@/test/clientRender'

const Slotted = (tag: string) =>
  defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h(tag, attrs, slots.default?.()) })
const release = (label: string, versionId: string, prefix = '') => ({ key: `release-${label}.json`, version_id: versionId, label, prefix })
const listReleases = vi.fn(async () => ({
  bucket: 'bakta-db',
  complete: true,
  releases: [release('6.0', '01M62DCH5J7HXR3V6784DBERPA', 'db/'), release('5.1', '01M62DCH5J7HXR3V6784DBERPB')],
}))
const getFileOrigin = vi.fn(async (_bucket: string, query: { version_id: string }) =>
  query.version_id.endsWith('PA') ? { origin: { kind: 'job', run_id: 'run-1' } } : { origin: { kind: 'upload', node_id: 'n1' } })
const getRun = vi.fn(async () => ({ run_id: 'run-1', run_crate: 'record-1' }))

const component = compileClientComponent(new URL('./BucketReleases.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { RouterLink: defineComponent({ props: { to: Object }, setup: (props, { slots }) => () => h('a', { href: JSON.stringify(props.to) }, slots.default?.()) }) },
  '@/components/ui/Button.vue': moduleDefault(Slotted('button')),
  '@/components/ui/Input.vue': moduleDefault(Slotted('input')),
  '@/components/ui/Notice.vue': moduleDefault(Slotted('aside')),
  '@/components/ui/Spinner.vue': moduleDefault(Slotted('span')),
  '@/composables/aruna/state': { nodeClientReady: async () => ({ baseUrl: 'https://node.test', token: 't' }) },
  '@/composables/useAruna': { useAruna: () => ({ listReleases, publishRelease: vi.fn(), sessionEpoch: ref(1) }) },
  '@/lib/api': { apiErrorMessage: String, getFileOrigin, getRun },
  '@/lib/databases': { pageIdentifier: () => null },
  '@/lib/releases': Releases,
  '@lucide/vue': { Plus: Slotted('i') },
})

describe('bucket releases', () => {
  it('lists version, files, who made it and when it was published', async () => {
    const { root } = await mountApp(component, { props: { bucket: 'bakta-db', nodeId: null, canPublish: true } })
    await flush()
    const text = content(root).replace(/\s+/g, '')

    expect(text).toContain('VersionFilesMadebyPublished')
    expect(text).toContain('6.0db/Arun,openitsrecord')
    expect(text).toContain('5.1WholebucketByhand')
    expect(text).toContain(new Date('2026-10-28T23:26:37.234Z').toLocaleDateString().replace(/\s+/g, ''))
    expect(getRun).toHaveBeenCalledWith('run-1', { baseUrl: 'https://node.test', token: 't' })
  })
})
