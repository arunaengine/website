import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { describe, expect, it } from 'vitest'
import * as Utils from '@/lib/utils'
import { compileClientComponent, content, moduleDefault, mountApp, nodes } from '@/test/clientRender'

const Slotted = (tag: string) => defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h(tag, attrs, slots.default?.()) })
const icons = new Proxy({}, { get: () => Slotted('i') })
const DetailList = compileClientComponent(new URL('../ui/DetailList.vue', import.meta.url), { vue: VueRuntime })
const DataEntityDialog = compileClientComponent(new URL('./DataEntityDialog.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { RouterLink: Slotted('a') },
  '@/components/ui/Dialog.vue': moduleDefault(Slotted('div')),
  '@/components/ui/DialogContent.vue': moduleDefault(Slotted('section')),
  '@/components/ui/DialogHeader.vue': moduleDefault(Slotted('header')),
  '@/components/ui/DialogTitle.vue': moduleDefault(Slotted('h2')),
  '@/components/ui/DialogDescription.vue': moduleDefault(Slotted('p')),
  '@/components/ui/DialogFooter.vue': moduleDefault(Slotted('footer')),
  '@/components/ui/DialogClose.vue': moduleDefault(Slotted('span')),
  '@/components/ui/Badge.vue': moduleDefault(Slotted('span')),
  '@/components/ui/Button.vue': moduleDefault(Slotted('button')),
  '@/components/ui/ScrollArea.vue': moduleDefault(Slotted('div')),
  '@/components/ui/ExternalLink.vue': moduleDefault(Slotted('a')),
  '@/components/ui/DetailList.vue': moduleDefault(DetailList),
  '@/components/metadata/EntityFieldList.vue': moduleDefault(Slotted('dl')),
  '@/components/ui/ListPager.vue': moduleDefault(Slotted('nav')),
  '@lucide/vue': icons,
  '@/composables/useCrateReferences': { useCrateReferences: () => ({ referencesFor: () => [] }) },
  '@/composables/usePagedList': await import('@/composables/usePagedList'),
  '@/composables/useS3': { useS3: () => ({ endpoint: ref(null) }) },
  '@/lib/datasetAbout': await import('@/lib/datasetAbout'),
  '@/lib/crate/dataIdentity': await import('@/lib/crate/dataIdentity'),
  '@/lib/cratePresenter': await import('@/lib/cratePresenter'),
  '@/lib/dataEntities': await import('@/lib/dataEntities'),
  '@/lib/profiles/uri': await import('@/lib/profiles/uri'),
  '@/lib/utils': Utils,
})

const CONTENT = `https://w3id.org/aruna/data/${'20e7d910547b19d71b9f4d36d1c4770f'.repeat(2)}`
const S3 = 's3://drought-study-2026/plots/a07/measurements/season-2026/plant_traits.csv'
const crate = {
  '@context': 'https://w3id.org/ro/crate/1.2/context',
  '@graph': [
    { '@id': 'ro-crate-metadata.json', '@type': 'CreativeWork', about: { '@id': './' } },
    { '@id': './', '@type': 'Dataset', name: 'Drought Resilience Study 2026', hasPart: [{ '@id': CONTENT }] },
    { '@id': CONTENT, '@type': ['File', 'MediaObject'], name: 'plant_traits.csv', contentSize: '106189', encodingFormat: 'text/csv', contentUrl: S3 },
  ],
}

describe('file info dialog', () => {
  it('shows the full content address, S3 path and the open action without truncating', async () => {
    const { root, errors } = await mountApp(defineComponent(() => () =>
      h(DataEntityDialog, { open: true, crate, entityId: CONTENT })))
    expect(errors).toEqual([])
    const text = content(root)
    expect(text.split(CONTENT).length - 1).toBeGreaterThanOrEqual(2)
    expect(text).toContain('drought-study-2026/plots/a07/measurements/season-2026/plant_traits.csv')
    expect(text).toContain('Open in Data')
    expect(text).toContain('Drought Resilience Study 2026')
    expect(nodes(root).filter((node) => /(^|\s)truncate(\s|$)/.test(String(node.props.class ?? '')))).toEqual([])
    const id = nodes(root).find((node) => node.tag === 'span' && content(node) === CONTENT)
    expect(String(id?.props.class)).toContain('break-all')
  })
})
