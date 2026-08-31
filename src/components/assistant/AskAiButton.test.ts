import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { button, click, compileClientComponent, content, flush, moduleDefault, mountApp } from '@/test/clientRender'

const openWith = vi.fn()
const assistantAvailable = ref(false)

const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})
const icons = new Proxy({}, { get: () => defineComponent(() => () => h('i')) })

const AskAiButton = compileClientComponent(new URL('./AskAiButton.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': icons,
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/composables/assistantState': { assistantAvailable },
  '@/composables/useAssistantChat': { useAssistantChat: () => ({ openWith }) },
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
})
