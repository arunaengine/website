import * as VueRuntime from 'vue'
import { defineComponent, h } from 'vue'
import { describe, expect, it } from 'vitest'
import * as Utils from '@/lib/utils'
import { compileClientComponent, element, mountApp } from '@/test/clientRender'

const Slotted = (tag: string) => defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h(tag, attrs, slots.default?.()) })
const radix = {
  DialogPortal: Slotted('div'),
  DialogOverlay: Slotted('div'),
  DialogContent: Slotted('section'),
  DialogClose: Slotted('button'),
  useForwardPropsEmits: (props: Record<string, unknown>) => props,
}
const icons = new Proxy({}, { get: () => defineComponent(() => () => h('i')) })
const DialogContent = compileClientComponent(new URL('./DialogContent.vue', import.meta.url), {
  vue: VueRuntime,
  'radix-vue': radix,
  '@lucide/vue': icons,
  '@/components/ui/layers': { allowAssistantFocus: () => {}, insideFloatingLayer: () => false },
  '@/lib/utils': Utils,
  './button': await import('./button'),
})
const DialogFooter = compileClientComponent(new URL('./DialogFooter.vue', import.meta.url), { vue: VueRuntime, '@/lib/utils': Utils })

describe('dialog content', () => {
  it('wraps long values and scrolls inside the viewport instead of clipping', async () => {
    const { root } = await mountApp(defineComponent(() => () => h(DialogContent, { class: 'max-w-md' }, () => h(DialogFooter))))
    const dialog = String(element(root, (node) => node.tag === 'section').props.class)
    for (const name of [
      'grid-cols-[minmax(0,1fr)]',
      '[overflow-wrap:anywhere]',
      '[&_.truncate:not(button_*)]:whitespace-normal',
      'max-h-[calc(100dvh-2rem)]',
      'w-[calc(100%-2rem)]',
      'overflow-auto',
      'max-w-md',
    ]) expect(dialog.split(' ')).toContain(name)
    expect(dialog).not.toContain('overflow-x-hidden')
    expect(dialog).not.toContain('max-w-xl')
    expect(dialog).not.toContain('sm:w-full')
    const footer = String(element(root, (node) => node.tag === 'div' && String(node.props.class).includes('sticky')).props.class)
    expect(footer.split(' ')).toEqual(expect.arrayContaining(['sticky', 'bottom-0', 'bg-[var(--dialog-surface)]']))
  })
})
