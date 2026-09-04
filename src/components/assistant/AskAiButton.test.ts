import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  button,
  click,
  compileClientComponent,
  content,
  element,
  flush,
  moduleDefault,
  mountApp,
} from '@/test/clientRender'
import * as Utils from '@/lib/utils'

const openWith = vi.fn()
const assistantAvailable = ref(false)

const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})
const TooltipStub = defineComponent({
  props: { label: String },
  setup: (props, { slots }) => () => h('span', { 'data-tooltip': props.label }, slots.default?.()),
})
const icons = new Proxy({}, { get: () => defineComponent(() => () => h('i')) })

const IconButton = compileClientComponent(new URL('../ui/IconButton.vue', import.meta.url), {
  vue: VueRuntime,
  './Button.vue': moduleDefault(ButtonStub),
  './Tooltip.vue': moduleDefault(TooltipStub),
})

const AskAiButton = compileClientComponent(new URL('./AskAiButton.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': icons,
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/IconButton.vue': moduleDefault(IconButton),
  '@/composables/assistantState': { assistantAvailable },
  '@/composables/useAssistantChat': { useAssistantChat: () => ({ openWith }) },
  '@/lib/utils': Utils,
})

beforeEach(() => {
  openWith.mockClear()
  assistantAvailable.value = false
})

describe('AskAiButton', () => {
  it('stays hidden without a provider', async () => {
    const mounted = await mountApp(AskAiButton, { props: { prompt: 'Do a thing' } })

    expect(content(mounted.root)).not.toContain('Ask AI')
    expect(() => button(mounted.root, 'Ask AI')).toThrow()
    mounted.app.unmount()
  })

  it('opens the assistant seeded with its prompt', async () => {
    assistantAvailable.value = true
    const mounted = await mountApp(AskAiButton, { props: { prompt: 'Explain run r1' } })

    await click(button(mounted.root, 'Ask AI'))
    await flush()

    expect(openWith).toHaveBeenCalledWith('Explain run r1')
    mounted.app.unmount()
  })

  it('names the icon-only button on hover', async () => {
    // Nothing in the portal may be an unlabelled icon.
    assistantAvailable.value = true
    const mounted = await mountApp(AskAiButton, {
      props: { prompt: 'Explain run r1', iconOnly: true },
    })

    const tooltip = element(mounted.root, (node) => node.props['data-tooltip'] === 'Ask AI about this')
    const control = element(mounted.root, (node) => node.tag === 'button')

    expect(content(tooltip)).not.toContain('Ask AI')
    expect(control.props['aria-label']).toBe('Ask AI about this')
    expect(control.props.size).toBe('icon-sm')
    await click(control)
    await flush()

    expect(openWith).toHaveBeenCalledWith('Explain run r1')
    mounted.app.unmount()
  })

  it('keeps the small icon in the labelled button', async () => {
    assistantAvailable.value = true
    const mounted = await mountApp(AskAiButton, { props: { prompt: 'Explain run r1' } })

    const icon = element(mounted.root, (node) => node.tag === 'i')

    expect(String(icon.props.class)).toContain('size-3.5')
    expect(String(button(mounted.root, 'Ask AI').props.class)).toContain('px-3.5')
    mounted.app.unmount()
  })
})
