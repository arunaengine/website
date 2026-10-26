import { defineComponent, h, ref } from 'vue'
import * as VueRuntime from 'vue'
import { describe, expect, it } from 'vitest'
import * as Tes from '@/lib/tes'
import { button, click, compileClientComponent, content, element, flush, mountApp, moduleDefault } from '@/test/clientRender'

const Passthrough = defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h('div', attrs, slots.default?.()) })
const Empty = defineComponent(() => () => null)

const component = compileClientComponent(new URL('./TesDataRefDialog.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { RouterLink: Passthrough },
  '@lucide/vue': new Proxy({}, { get: () => Empty }),
  '@/components/ui/Dialog.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogClose.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogContent.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogDescription.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogFooter.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogHeader.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogTitle.vue': moduleDefault(Passthrough),
  '@/components/ui/Notice.vue': moduleDefault(Passthrough),
  '@/components/ui/Switch.vue': moduleDefault(Empty),
  '@/components/ui/Button.vue': moduleDefault(defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()) })),
  '@/components/ui/Input.vue': moduleDefault(Empty),
  '@/components/ui/OptionToggle.vue': moduleDefault(defineComponent({ inheritAttrs: false, setup: (_, { attrs }) => () => h('div', { ...attrs, role: 'radiogroup' }) })),
  '@/components/data/ObjectBrowserPanel.vue': moduleDefault(defineComponent({
    props: { bucket: String, groupId: String },
    setup: (props) => () => h('section', `browser ${props.bucket ?? 'any'} ${props.groupId ?? ''}`),
  })),
  '@/components/data/CreateCredentialDialog.vue': moduleDefault(Empty),
  '@/components/data/add/DatabasesTab.vue': moduleDefault(defineComponent({
    emits: ['choose'],
    setup: (_, { emit }) => () => h('div', [
      h('button', { onClick: () => emit('choose', 'far-db', 'n2', 'g2') }, 'Far database'),
      h('button', { onClick: () => emit('choose', 'spire', 'n1', 'g3') }, 'Local database'),
    ]),
  })),
  '@/composables/useS3': { useS3: () => ({ endpoint: ref('https://s3.test'), hasActiveKey: ref(true), ensureSession: async () => {} }) },
  '@/composables/useAruna': { useAruna: () => ({ currentUser: ref(null), myGroups: ref([]) }) },
  '@/composables/useGroupSelection': { activeGroupId: ref('') },
  '@/composables/useRealmNodes': { useRealmNodes: () => ({ isLocalNode: (id: string) => id === 'n1' }) },
  '@/lib/utils': { errorMessage: (cause: unknown) => String(cause) },
  '@/lib/tes': Tes,
})

describe('TES input picker databases', () => {
  it('browses a database this node holds in its own group, and refuses one of another node', async () => {
    const { root } = await mountApp(component, { props: { open: true, mode: 'input' } })
    ;(element(root, (node) => node.props.role === 'radiogroup').props['onUpdate:modelValue'] as (value: string) => void)('databases')
    await flush()

    await click(button(root, 'Far database'))
    expect(content(root)).toContain('This database is on another node.')
    await click(button(root, 'Local database'))
    expect(content(root)).toContain('browser spire g3')
  })
})
