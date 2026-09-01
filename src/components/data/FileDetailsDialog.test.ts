import { computed, defineComponent, h, inject, provide, type ComputedRef } from 'vue'
import * as VueRuntime from 'vue'
import { describe, expect, it, vi } from 'vitest'
import * as StateBadge from '@/lib/stateBadge'
import * as Utils from '@/lib/utils'
import { compileClientComponent, content, flush, mountApp, moduleDefault } from '@/test/clientRender'

const Slotted = (tag: string) =>
  defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h(tag, attrs, slots.default?.()) })
const DetailDialogStub = defineComponent({
  props: { open: Boolean },
  setup: (props, { slots }) => () =>
    props.open ? h('div', [slots.header?.(), slots.default?.()]) : null,
})
const TabsStub = defineComponent({
  props: { modelValue: String },
  setup(props, { slots }) {
    provide('active-tab', computed(() => props.modelValue))
    return () => h('div', slots.default?.())
  },
})
const TabsContentStub = defineComponent({
  props: { value: String },
  setup(props, { slots }) {
    const active = inject<ComputedRef<string>>('active-tab')
    return () => (active?.value === props.value ? h('div', slots.default?.()) : null)
  },
})
const Marker = (text: string) => defineComponent({ setup: () => () => h('section', text) })

const headObject = vi.fn()

const dialog = compileClientComponent(new URL('./FileDetailsDialog.vue', import.meta.url), {
  vue: VueRuntime,
  '@/components/ui/Badge.vue': moduleDefault(Slotted('span')),
  '@/components/ui/CopyButton.vue': moduleDefault(Slotted('button')),
  '@/components/ui/DetailDialog.vue': moduleDefault(DetailDialogStub),
  '@/components/ui/DialogTitle.vue': moduleDefault(Slotted('h2')),
  '@/components/ui/Spinner.vue': moduleDefault(Slotted('i')),
  '@/components/ui/Tabs.vue': moduleDefault(TabsStub),
  '@/components/ui/TabsContent.vue': moduleDefault(TabsContentStub),
  '@/components/ui/TabsList.vue': moduleDefault(Slotted('div')),
  '@/components/ui/TabsTrigger.vue': moduleDefault(Slotted('button')),
  '@/components/data/ObjectLocationsPanel.vue': moduleDefault(Marker('copies of this version')),
  '@/components/data/ObjectVersionsPanel.vue': moduleDefault(Marker('version rows')),
  '@/components/storage/ObjectRulesEditor.vue': moduleDefault(Marker('edit rules for this file')),
  '@/components/storage/PolicyColumn.vue': moduleDefault(Marker('rules this file carries')),
  '@/components/preview/PreviewBody.vue': moduleDefault(Marker('preview')),
  '@/composables/useS3': { useS3: () => ({ headObject }), s3ErrorMessage: (error: unknown) => String(error) },
  '@/lib/stateBadge': StateBadge,
  '@/lib/utils': Utils,
})

async function render(tab: string) {
  headObject.mockResolvedValue({ contentType: 'text/plain', versionId: '01J000000000000000000HEAD' })
  const { root } = await mountApp(dialog, {
    props: {
      open: true,
      tab,
      bucket: 'reef-survey',
      objectKey: 'raw/reads.fastq',
      name: 'reads.fastq',
      nodeId: null,
      groupId: 'g-1',
    },
  })
  await flush()
  return content(root)
}

describe('file details storage tab', () => {
  it('puts the rules beside the copies of the chosen version', async () => {
    const text = await render('storage')

    expect(text).toContain('rules this file carries')
    expect(text).toContain('copies of this version')
    expect(text).toContain('edit rules for this file')
  })

  it('keeps the storage tab out of the other tabs', async () => {
    const text = await render('general')

    expect(text).not.toContain('rules this file carries')
    expect(text).not.toContain('copies of this version')
  })
})
