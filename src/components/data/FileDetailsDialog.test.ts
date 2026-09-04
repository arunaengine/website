import { computed, defineComponent, h, inject, provide, ref, type ComputedRef } from 'vue'
import * as VueRuntime from 'vue'
import { describe, expect, it, vi } from 'vitest'
import * as assistantObject from '@/composables/useAssistantObject'
import * as StateBadge from '@/lib/stateBadge'
import * as Utils from '@/lib/utils'
import {
  button,
  click,
  compileClientComponent,
  content,
  flush,
  mountApp,
  moduleDefault,
} from '@/test/clientRender'

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
const IconStub = defineComponent((_, { attrs }) => () => h('i', attrs))
const ButtonStub = defineComponent({
  inheritAttrs: false,
  props: { variant: String, size: String, class: String },
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})

const headObject = vi.fn()
const hasActiveKey = ref(true)

const dialog = compileClientComponent(new URL('./FileDetailsDialog.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => IconStub }),
  'vue-router': { RouterLink: Slotted('a') },
  '@/components/ui/Badge.vue': moduleDefault(Slotted('span')),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
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
  '@/composables/useS3': {
    useS3: () => ({ headObject, hasActiveKey }),
    s3ErrorMessage: (error: unknown) => String(error),
  },
  '@/composables/useAssistantObject': assistantObject,
  '@/lib/stateBadge': StateBadge,
  '@/lib/utils': Utils,
})

async function mount(tab: string) {
  headObject.mockResolvedValue({ contentType: 'text/plain', versionId: '01J000000000000000000HEAD' })
  const tabs: string[] = []
  const host = defineComponent({
    setup: () => () =>
      h(dialog, {
        open: true,
        tab,
        bucket: 'reef-survey',
        objectKey: 'raw/reads.fastq',
        name: 'reads.fastq',
        nodeId: null,
        groupId: 'g-1',
        'onUpdate:tab': (value: string) => tabs.push(value),
      }),
  })
  const { root } = await mountApp(host)
  await flush()
  return { root, tabs }
}

async function render(tab: string) {
  return content((await mount(tab)).root)
}

describe('file details storage tab', () => {
  it('loads the head once the S3 session arrives', async () => {
    // A deep link opens the dialog before the browser holds a session.
    hasActiveKey.value = false
    headObject.mockRejectedValueOnce(new Error('S3SessionUnavailableError: no session'))
    const { root } = await mount('general')
    expect(content(root)).toContain('S3SessionUnavailableError')

    hasActiveKey.value = true
    await flush()

    expect(content(root)).not.toContain('S3SessionUnavailableError')
    expect(content(root)).toContain('HEAD')
    expect(headObject).toHaveBeenCalledTimes(2)
  })

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

describe('file details preview mode', () => {
  it('fills the dialog with the preview instead of a tab', async () => {
    const text = await render('preview')

    expect(text).toContain('preview')
    expect(text).not.toContain('Versions')
    expect(text).not.toContain('Storage')
  })

  it('switches between the preview and the details', async () => {
    const details = await mount('general')
    await click(button(details.root, 'Preview'))
    expect(details.tabs).toEqual(['preview'])

    const preview = await mount('preview')
    await click(button(preview.root, 'Details'))
    expect(preview.tabs).toEqual(['general'])
  })

  it('keeps the details tabs without a preview trigger', async () => {
    const text = await render('general')

    expect(text).toContain('General')
    expect(text).toContain('Versions')
    expect(text).not.toContain('preview')
  })
})
