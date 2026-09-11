import * as VueRuntime from 'vue'
import { defineComponent, h } from 'vue'
import { describe, expect, it } from 'vitest'
import { compileClientComponent, element, mountApp } from '@/test/clientRender'
import { insideFloatingLayer } from '@/components/ui/layers'

const SlotStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('div', attrs, slots.default?.()),
})
const ContentStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('div', { ...attrs, role: 'content' }, slots.default?.()),
})
const ArrowStub = defineComponent((_, { attrs }) => () => h('i', attrs))

const Popover = compileClientComponent(new URL('./Popover.vue', import.meta.url), {
  vue: VueRuntime,
  'radix-vue': {
    PopoverRoot: SlotStub,
    PopoverTrigger: SlotStub,
    PopoverPortal: SlotStub,
    PopoverContent: ContentStub,
    PopoverArrow: ArrowStub,
  },
  '@/components/ui/layers': { insideFloatingLayer },
})

function contentClass(root: Parameters<typeof element>[0]): string {
  return String(element(root, (node) => node.props.role === 'content').props.class ?? '')
}

describe('Popover', () => {
  it('keeps the usual layer by default', async () => {
    const { root, errors } = await mountApp(Popover)
    expect(errors).toEqual([])

    expect(contentClass(root)).toContain('z-50')
    expect(contentClass(root)).not.toContain('--z-assistant-modal')
  })

  it('opens above the assistant panel when raised', async () => {
    const { root, errors } = await mountApp(Popover, { props: { raised: true } })
    expect(errors).toEqual([])

    expect(contentClass(root)).toContain('z-[var(--z-assistant-modal)]')
    expect(contentClass(root)).not.toContain('z-50')
  })
})
