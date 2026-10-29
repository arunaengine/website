import * as VueRuntime from 'vue'
import { defineComponent, h } from 'vue'
import { describe, expect, it } from 'vitest'
import { compileClientComponent, content, element, mountApp, nodes } from '@/test/clientRender'
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
    TooltipProvider: SlotStub,
    TooltipRoot: SlotStub,
    TooltipTrigger: SlotStub,
    TooltipPortal: SlotStub,
    TooltipContent: defineComponent({ inheritAttrs: false, setup: (_, { slots }) => () => h('p', { role: 'tooltip' }, slots.default?.()) }),
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

  it('adds a hover and focus tooltip to its trigger only when asked', async () => {
    const plain = await mountApp(Popover)
    expect(nodes(plain.root).some((node) => node.props.role === 'tooltip')).toBe(false)

    const tipped = await mountApp(Popover, { props: { tooltip: 'Stored on Giessen storage 1' } })
    expect(content(element(tipped.root, (node) => node.props.role === 'tooltip')).trim()).toBe('Stored on Giessen storage 1')
    // A real element anchors the popover, between its trigger and the tooltip's.
    const tooltip = element(tipped.root, (node) => node.props.role === 'tooltip')
    expect(nodes(tipped.root).some((node) => node.tag === 'span' && node.props.class === 'inline-flex' && nodes(node).includes(tooltip))).toBe(true)
  })
})
