import { defineComponent, h } from 'vue'
import * as VueRuntime from 'vue'
import { describe, expect, it } from 'vitest'
import * as Utils from '@/lib/utils'
import {
  compileClientComponent,
  content,
  element,
  mountApp,
  moduleDefault,
  type HostNode,
} from '@/test/clientRender'

const IconStub = defineComponent((_, { attrs }) => () => h('i', attrs))
const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (props, { attrs, slots }) => () => h('button', { ...props, ...attrs }, slots.default?.()),
  props: { variant: String, size: String, class: String },
})
// The real tooltip renders through a portal; the label it receives is the point.
const TooltipStub = defineComponent({
  props: { label: String },
  setup: (props, { slots }) => () => h('span', { 'data-tooltip': props.label }, slots.default?.()),
})

const iconButton = compileClientComponent(new URL('./IconButton.vue', import.meta.url), {
  vue: VueRuntime,
  '@/lib/utils': Utils,
  './Button.vue': moduleDefault(ButtonStub),
  './Tooltip.vue': moduleDefault(TooltipStub),
  './button': { buttonVariants: () => '' },
})

async function render(props: Record<string, unknown>): Promise<HostNode> {
  const host = defineComponent({
    setup: () => () => h(iconButton, props, { default: () => h(IconStub) }),
  })
  const { root } = await mountApp(host)
  return root
}

describe('icon button', () => {
  it('names the control for readers and for the pointer', async () => {
    const root = await render({ label: 'Download' })
    const button = element(root, (node) => node.tag === 'button')
    const tooltip = element(root, (node) => node.props['data-tooltip'] !== undefined)

    expect(button.props['aria-label']).toBe('Download')
    expect(button.props.title).toBe('Download')
    expect(tooltip.props['data-tooltip']).toBe('Download')
    expect(content(root)).toBe('')
  })

  it('shows the reason instead of the label when it is blocked', async () => {
    const root = await render({
      label: 'Delete…',
      disabledReason: 'This session cannot delete this object.',
    })
    const button = element(root, (node) => node.tag === 'button')

    expect(button.props.disabled).toBe(true)
    expect(button.props['aria-label']).toBe('Delete…')
    expect(button.props.title).toBe('This session cannot delete this object.')
    expect(element(root, (node) => node.props['data-tooltip'] !== undefined).props['data-tooltip']).toBe(
      'This session cannot delete this object.',
    )
  })

  it('stays enabled without a reason', async () => {
    const root = await render({ label: 'Preview' })

    expect(element(root, (node) => node.tag === 'button').props.disabled).toBe(false)
  })
})
