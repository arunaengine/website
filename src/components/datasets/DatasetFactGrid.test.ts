import * as VueRuntime from 'vue'
import { ref } from 'vue'
import { describe, expect, it } from 'vitest'
import * as DatasetFacts from '@/lib/datasetFacts'
import { compileClientComponent, content, mountApp } from '@/test/clientRender'

const DatasetFactGrid = compileClientComponent(new URL('./DatasetFactGrid.vue', import.meta.url), {
  vue: VueRuntime,
  '@/composables/useAruna': { useAruna: () => ({ myGroups: ref([]) }) },
  '@/composables/useUserDirectory': { useUserDirectory: () => ({ resolveUsers: async () => {}, cachedUser: () => null }) },
  '@/lib/datasetFacts': DatasetFacts,
})

const doc = (roCrate: unknown) => ({ ulid: 'd1', title: 'T', type: 'Dataset', license: '', realmId: 'g1', updatedAt: '', conformsToIds: [], roCrate })

describe('dataset fact grid', () => {
  it('shows a known size and leaves an unknown one out instead of a dash', async () => {
    const sized = await mountApp(DatasetFactGrid, { props: { doc: doc({ '@graph': [{ '@id': 'ro-crate-metadata.json', about: { '@id': './' } }, { '@id': './', contentSize: '2048' }] }) } })
    expect(content(sized.root)).toContain('Size2.0 KiB')
    sized.app.unmount()

    const unknown = await mountApp(DatasetFactGrid, { props: { doc: doc({}) } })
    expect(content(unknown.root)).not.toContain('Size')
    expect(content(unknown.root)).toContain('License-')
    unknown.app.unmount()
  })
})
