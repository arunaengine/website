import { defineComponent, h, onMounted, ref } from 'vue'
import * as VueRuntime from 'vue'
import { describe, expect, it } from 'vitest'
import { compileClientComponent, content, flush, mountApp, moduleDefault } from '@/test/clientRender'

const IconStub = defineComponent((_, { attrs }) => () => h('i', attrs))
const Slotted = (tag: string) =>
  defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h(tag, attrs, slots.default?.()) })
// Each list reports an empty bucket once, when it is first shown.
const EmptyList = defineComponent({
  emits: ['count', 'available'],
  setup: (_, { emit }) => {
    onMounted(() => emit('count', 0))
    return () => h('section')
  },
})
const TitleStub = defineComponent({ props: { title: String }, setup: (props) => () => h('p', props.title) })

const tab = compileClientComponent(new URL('./TransfersTab.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => IconStub }),
  '@/components/data/AddDataDialog.vue': moduleDefault(Slotted('div')),
  '@/components/data/SyncBucketDialog.vue': moduleDefault(Slotted('div')),
  '@/components/storage/LinkedFolderRows.vue': moduleDefault(EmptyList),
  '@/components/storage/StagingJobRows.vue': moduleDefault(EmptyList),
  '@/components/storage/SyncsTab.vue': moduleDefault(EmptyList),
  '@/components/ui/Button.vue': moduleDefault(Slotted('button')),
  '@/components/ui/DropdownMenu.vue': moduleDefault(Slotted('div')),
  '@/components/ui/DropdownMenuContent.vue': moduleDefault(Slotted('div')),
  '@/components/ui/DropdownMenuItem.vue': moduleDefault(Slotted('button')),
  '@/components/ui/DropdownMenuTrigger.vue': moduleDefault(Slotted('span')),
  '@/components/ui/EmptyState.vue': moduleDefault(TitleStub),
  '@/components/ui/Notice.vue': moduleDefault(Slotted('aside')),
  '@/components/ui/OptionToggle.vue': moduleDefault(Slotted('div')),
  '@/components/ui/RefreshButton.vue': moduleDefault(Slotted('button')),
  '@/composables/usePortalFeatures': { usePortalFeatures: () => ({ shown: () => true }) },
  '@/composables/useRealmNodes': { useRealmNodes: () => ({ displayName: (id: string) => id }) },
  '@/lib/config': { featureEnabled: () => true },
})

describe('transfers tab', () => {
  it('forgets the counts of the previous bucket', async () => {
    const bucket = ref('reef')
    const host = defineComponent({ setup: () => () => h(tab, { bucket: bucket.value, nodeId: null, groupId: 'g-1' }) })
    const { root } = await mountApp(host)
    expect(content(root)).toContain('Nothing is copied into or out of this bucket.')

    bucket.value = 'archive'
    await flush()

    expect(content(root)).not.toContain('Nothing is copied into or out of this bucket.')
  })
})
