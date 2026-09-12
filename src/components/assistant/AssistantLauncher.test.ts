import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { click, compileClientComponent, element, flush, mountApp } from '@/test/clientRender'

const openPanel = vi.fn()
const closePanel = vi.fn()
const assistantAvailable = ref(false)
const assistantOpen = ref(false)
const assistantPageOpen = ref(false)
const assistantUnread = ref(0)
const uploadQueueItems = ref<unknown[]>([])

const icons = new Proxy({}, { get: () => defineComponent(() => () => h('i')) })

const AssistantLauncher = compileClientComponent(new URL('./AssistantLauncher.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': icons,
  '@/composables/assistantState': { assistantAvailable, assistantOpen, assistantPageOpen, assistantUnread },
  '@/composables/useAssistantChat': { useAssistantChat: () => ({ openPanel, closePanel }) },
  '@/composables/uploadQueueState': { uploadQueueItems },
})

beforeEach(() => {
  openPanel.mockClear()
  closePanel.mockClear()
  assistantAvailable.value = false
  assistantOpen.value = false
  assistantPageOpen.value = false
  assistantUnread.value = 0
  uploadQueueItems.value = []
})

function launcher(root: Parameters<typeof element>[0]) {
  return element(root, (node) => node.tag === 'button' && node.props.title === 'Assistant')
}

describe('AssistantLauncher', () => {
  it('stays hidden without a ready provider', async () => {
    const mounted = await mountApp(AssistantLauncher)
    await flush()
    expect(() => launcher(mounted.root)).toThrow()
    mounted.app.unmount()
  })

  it('steps aside while the panel or the assistant page shows the chat', async () => {
    assistantAvailable.value = true
    assistantPageOpen.value = true
    const mounted = await mountApp(AssistantLauncher)
    await flush()
    expect(() => launcher(mounted.root)).toThrow()
    assistantPageOpen.value = false
    assistantOpen.value = true
    await flush()
    expect(() => launcher(mounted.root)).toThrow()
    mounted.app.unmount()
  })

  it('floats bottom right and opens the panel', async () => {
    assistantAvailable.value = true
    const mounted = await mountApp(AssistantLauncher)
    await flush()
    const control = launcher(mounted.root)
    expect(String(control.props.class)).toContain('fixed')
    expect(String(control.props.class)).toContain('rounded-full')
    expect(String(control.props.class)).toContain('md:right-6')
    expect(String(control.props.class)).not.toContain('left-')
    expect('data-assistant-layer' in control.props).toBe(true)
    await click(control)
    expect(openPanel).toHaveBeenCalledOnce()
    mounted.app.unmount()
  })

  it('steps left of the transfers panel while uploads run', async () => {
    assistantAvailable.value = true
    uploadQueueItems.value = [{ id: 1 }]
    const mounted = await mountApp(AssistantLauncher)
    await flush()
    const control = launcher(mounted.root)
    expect(String(control.props.class)).toContain('right-[22.5rem]')
    expect(String(control.props.class)).toContain('max-md:hidden')
    mounted.app.unmount()
  })

  it('marks waiting background updates', async () => {
    assistantAvailable.value = true
    assistantUnread.value = 2
    const mounted = await mountApp(AssistantLauncher)
    await flush()
    expect(launcher(mounted.root).props['aria-label']).toBe('Assistant, 2 background updates')
    expect(() => element(mounted.root, (node) => 'data-unread' in node.props)).not.toThrow()
    mounted.app.unmount()
  })
})
