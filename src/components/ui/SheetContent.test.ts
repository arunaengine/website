import * as VueRuntime from 'vue'
import { defineComponent, h } from 'vue'
import { describe, expect, it } from 'vitest'
import * as Utils from '@/lib/utils'
import { compileClientComponent, content, element, moduleDefault, mountApp, nodes } from '@/test/clientRender'

const Slotted = (tag: string) => defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h(tag, attrs, slots.default?.()) })
const radix = {
  DialogPortal: Slotted('div'),
  DialogOverlay: Slotted('div'),
  DialogContent: Slotted('section'),
  DialogClose: Slotted('button'),
  DialogTitle: Slotted('h2'),
  DialogDescription: Slotted('p'),
  useForwardPropsEmits: (props: Record<string, unknown>) => props,
}
const icons = new Proxy({}, { get: () => defineComponent(() => () => h('i')) })
const SheetContent = compileClientComponent(new URL('./SheetContent.vue', import.meta.url), {
  vue: VueRuntime,
  'radix-vue': radix,
  'class-variance-authority': await import('class-variance-authority'),
  '@lucide/vue': icons,
  '@/components/ui/layers': { allowAssistantFocus: () => {}, insideFloatingLayer: () => false },
  '@/lib/utils': Utils,
})
const SheetHeader = compileClientComponent(new URL('./SheetHeader.vue', import.meta.url), { vue: VueRuntime, 'radix-vue': radix })

describe('right sheet', () => {
  it('is 480 px for files and 640 px for runs, and rings its close button for the keyboard only', async () => {
    for (const [size, width] of [['md', 'sm:max-w-[480px]'], ['lg', 'sm:max-w-[640px]']]) {
      const { root } = await mountApp(defineComponent(() => () => h(SheetContent, { size })))
      const sheet = element(root, (node) => node.tag === 'section')
      expect(String(sheet.props.class)).toContain(width)
      expect(String(sheet.props.class)).not.toContain('sm:max-w-xl')
      const close = element(root, (node) => node.tag === 'button' && node.props['aria-label'] === 'Close')
      expect(String(close.props.class)).toContain('focus-visible:ring-2')
      expect(String(close.props.class)).not.toMatch(/(^|\s)focus:ring/)
    }
  })

  it('heads a sheet like a page: icon tile, title, one subtitle line and its actions', async () => {
    const Icon = defineComponent(() => () => h('i', { 'data-icon': 'run' }))
    const { root } = await mountApp(defineComponent(() => () =>
      h(SheetHeader, { title: 'Annotate my genome with Bakta', subtitle: '01M63SDV', icon: Icon }, { actions: () => h('button', 'Refresh') })))
    expect(content(element(root, (node) => node.tag === 'h2'))).toBe('Annotate my genome with Bakta')
    expect(content(element(root, (node) => node.tag === 'p'))).toBe('01M63SDV')
    expect(nodes(root).some((node) => node.props['data-icon'] === 'run')).toBe(true)
    expect(content(root)).toContain('Refresh')
  })
})
