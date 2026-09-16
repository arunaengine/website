import { computed, defineComponent, h, ref } from 'vue'
import * as VueRuntime from 'vue'
import { describe, expect, it } from 'vitest'
import { button, click, compileClientComponent, content, mountApp, moduleDefault } from '@/test/clientRender'

const Slotted = (tag: string) =>
  defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h(tag, attrs, slots.default?.()) })
const DialogStub = defineComponent({
  props: { open: Boolean },
  setup: (props, { slots }) => () => (props.open ? h('div', slots.default?.()) : null),
})
const PublicDialogStub = defineComponent({
  props: { open: Boolean, targets: { type: Array, default: () => [] } },
  setup: (props) => () => (props.open ? h('section', `public access for ${JSON.stringify(props.targets)}`) : null),
})
const IconStub = defineComponent((_, { attrs }) => () => h('i', attrs))

const dialog = compileClientComponent(new URL('./FolderDetailsDialog.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => IconStub }),
  '@/components/data/PublicAccessDialog.vue': moduleDefault(PublicDialogStub),
  '@/components/ui/Badge.vue': moduleDefault(Slotted('span')),
  '@/components/ui/Button.vue': moduleDefault(Slotted('button')),
  '@/components/ui/Dialog.vue': moduleDefault(DialogStub),
  '@/components/ui/DialogContent.vue': moduleDefault(Slotted('div')),
  '@/components/ui/DialogDescription.vue': moduleDefault(Slotted('p')),
  '@/components/ui/DialogHeader.vue': moduleDefault(Slotted('div')),
  '@/components/ui/DialogTitle.vue': moduleDefault(Slotted('h2')),
  '@/composables/useRealmNodes': { useRealmNodes: () => ({ displayName: () => 'this node' }) },
})

async function render(isPublic: boolean) {
  const access = { isPublic: () => isPublic, groupName: computed(() => 'Reef lab') }
  const host = defineComponent({
    setup: () => () =>
      h(dialog, { open: true, bucket: 'reef', prefix: 'raw/', name: 'raw', nodeId: null, access }),
  })
  const { root, errors } = await mountApp(host)
  expect(errors).toEqual([])
  return root
}

describe('folder details', () => {
  it('shows where the folder lives and whether everyone can read it', async () => {
    const root = await render(false)

    expect(content(root)).toContain('reef/raw/')
    expect(content(root)).toContain('Reef lab')
    expect(content(root)).toContain('private')
    expect(content(root)).not.toContain('public access for')

    await click(button(root, 'Make public…'))

    expect(content(root)).toContain('public access for [{"kind":"folder","bucket":"reef","key":"raw/"}]')
  })

  it('names a public folder', async () => {
    const root = await render(true)
    expect(content(root)).toContain('public')
    expect(content(root)).toContain('Public access…')
  })
})
