import { defineComponent, h, ref } from 'vue'
import * as VueRuntime from 'vue'
import { describe, expect, it } from 'vitest'
import type { DataLinkDocument } from '@/lib/api'
import { compileClientComponent, content, mountApp, moduleDefault } from '@/test/clientRender'

const links = {
  documents: ref<DataLinkDocument[]>([]),
  state: ref('ready'),
  error: ref<string | null>(null),
  complete: ref(true),
  hidden: ref(false),
  more: ref(false),
  loadingMore: ref(false),
  reload: () => undefined,
  loadMore: () => undefined,
}

const component = compileClientComponent(new URL('./LinkedDatasets.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { RouterLink: defineComponent((_, { slots }) => () => h('a', slots.default?.())) },
  '@/components/ui/Button.vue': moduleDefault(defineComponent((_, { slots }) => () => h('button', slots.default?.()))),
  '@/components/ui/Spinner.vue': moduleDefault(defineComponent(() => () => h('i'))),
  '@/composables/useDatasetLinks': { useDatasetLinks: () => links },
})

async function text() {
  const target = { bucket: 'lab', key: 'raw/', folder: true, remote: false }
  return content((await mountApp(component, { props: { heading: 'Linked by datasets', target, quietEmpty: true } })).root)
}

describe('linked datasets', () => {
  it('hides an empty list only when it is the whole answer', async () => {
    expect(await text()).toBe('')

    links.complete.value = false
    expect(await text()).toContain('The list may be incomplete')
    links.complete.value = true

    links.more.value = true
    expect(await text()).toContain('More datasets')
    expect(await text()).not.toContain('None you can read')
    links.more.value = false

    links.error.value = 'node busy'
    expect(await text()).toContain('More datasets could not be read: node busy')
    links.error.value = null
  })
})
