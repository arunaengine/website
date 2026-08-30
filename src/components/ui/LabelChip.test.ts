import * as VueRuntime from 'vue'
import { defineComponent, h } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  click,
  compileClientComponent,
  content,
  element,
  flush,
  moduleDefault,
  mountApp,
  type HostNode,
} from '@/test/clientRender'
import { cn } from '@/lib/utils'

const VALUE = 'zone=eu-west-1-availability-zone-a'

const clipboard = vi.fn(() => Promise.resolve())
const TooltipStub = defineComponent((_, { attrs, slots }) => () => h('div', attrs, slots.default?.()))

const LabelChip = compileClientComponent(new URL('./LabelChip.vue', import.meta.url), {
  vue: VueRuntime,
  '@/components/ui/Tooltip.vue': moduleDefault(TooltipStub),
  '@/lib/utils': { cn, copyToClipboard: clipboard },
})

async function render(props: Record<string, unknown>): Promise<HostNode> {
  const { root } = await mountApp(LabelChip, { props })
  return root
}

function chip(root: HostNode): HostNode {
  return element(root, (node) => node.tag === 'button')
}

describe('label chip', () => {
  beforeEach(() => clipboard.mockClear())

  it('renders the value with its count', async () => {
    const root = await render({ value: VALUE, count: 3 })

    expect(content(chip(root))).toContain(VALUE)
    expect(content(chip(root))).toContain('· 3')
  })

  it('truncates the value but keeps it readable on hover', async () => {
    const root = await render({ value: VALUE, count: 3, class: 'text-[10px]' })
    const value = element(root, (node) => String(node.props.class ?? '').includes('truncate'))
    const tooltip = element(root, (node) => node.tag === 'div')

    expect(String(chip(root).props.class)).toContain('max-w-[12rem]')
    expect(String(chip(root).props.class)).toContain('text-[10px]')
    expect(content(value).trim()).toBe(VALUE)
    expect(chip(root).props.title).toBe(`${VALUE} · 3`)
    expect(tooltip.props.label).toBe(`${VALUE} · 3`)
  })

  it('keeps the count outside the truncated value', async () => {
    const root = await render({ value: VALUE, count: 3 })
    const count = element(root, (node) => String(node.props.class ?? '').includes('shrink-0'))

    expect(content(count).trim()).toBe('· 3')
  })

  describe('copying', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    it('copies the full value and confirms it', async () => {
      const root = await render({ value: VALUE })

      expect(chip(root).props['aria-label']).toBe(`Copy ${VALUE}`)
      await click(chip(root))

      const live = element(root, (node) => node.props['aria-live'] === 'polite')
      expect(clipboard).toHaveBeenCalledWith(VALUE)
      expect(content(live).trim()).toBe('Copied')

      vi.advanceTimersByTime(1500)
      await flush()

      expect(content(chip(root)).trim()).toBe(VALUE)
    })
  })
})
