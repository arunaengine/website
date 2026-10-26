import { defineComponent, h, ref } from 'vue'
import * as VueRuntime from 'vue'
import { describe, expect, it, vi } from 'vitest'
import * as Mock from '@/lib/distributedMock'
import * as Distribution from '@/lib/distribution'
import { compileClientComponent, content, mountApp, moduleDefault, nodes } from '@/test/clientRender'

const Slotted = (tag: string) =>
  defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h(tag, attrs, slots.default?.()) })
const Plain = defineComponent({ inheritAttrs: false, setup: (_, { attrs }) => () => h('div', attrs) })
const Toggle = defineComponent({ inheritAttrs: false, setup: (_, { attrs }) => () => h('button', { 'data-switch': attrs['aria-label'] }) })

const component = compileClientComponent(new URL('./SettingsDialog.vue', import.meta.url), {
  vue: VueRuntime,
  '@/components/ui/Button.vue': moduleDefault(Slotted('button')),
  '@/components/ui/Dialog.vue': moduleDefault(Slotted('div')),
  '@/components/ui/DialogContent.vue': moduleDefault(Slotted('div')),
  '@/components/ui/DialogDescription.vue': moduleDefault(Slotted('p')),
  '@/components/ui/DialogFooter.vue': moduleDefault(Slotted('footer')),
  '@/components/ui/DialogHeader.vue': moduleDefault(Slotted('header')),
  '@/components/ui/DialogTitle.vue': moduleDefault(Slotted('h2')),
  '@/components/ui/Input.vue': moduleDefault(Plain),
  '@/components/ui/Notice.vue': moduleDefault(Slotted('aside')),
  '@/components/ui/OptionToggle.vue': moduleDefault(Plain),
  '@/components/ui/Select.vue': moduleDefault(Plain),
  '@/components/ui/Switch.vue': moduleDefault(Toggle),
  '@/composables/useSetChanges': { useSetChanges: () => ({ busy: ref(false), failure: ref(null), settings: vi.fn() }) },
  '@/lib/distributedMock': Mock,
  '@/lib/distribution': Distribution,
})

describe('settings dialog', () => {
  it('offers no Public switch, which no node acts on', async () => {
    const bucket: Distribution.DistributedBucket = { name: 'spire', preset: 'mirror', members: [], ranges: [] }
    const { root } = await mountApp(component, { props: { open: true, bucket } })

    expect(nodes(root).filter((node) => node.props['data-switch']).map((node) => node.props['data-switch'])).toEqual(['Search index'])
    expect(content(root)).not.toContain('Public')
  })
})
