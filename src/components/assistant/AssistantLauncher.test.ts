import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { button, click, compileClientComponent, content, element, flush, mountApp } from '@/test/clientRender'
import * as Nav from '@/components/layout/nav'

const openPanel = vi.fn()
const closePanel = vi.fn()
const assistantAvailable = ref(false)
const assistantOpen = ref(false)
const assistantPageOpen = ref(false)
const assistantUnread = ref(0)

const icons = new Proxy({}, { get: () => defineComponent(() => () => h('i')) })

const AssistantLauncher = compileClientComponent(new URL('./AssistantLauncher.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': icons,
  '@/components/layout/nav': Nav,
  '@/composables/assistantState': { assistantAvailable, assistantOpen, assistantPageOpen, assistantUnread },
  '@/composables/useAssistantChat': { useAssistantChat: () => ({ openPanel, closePanel }) },
})

beforeEach(() => {
  openPanel.mockClear()
  closePanel.mockClear()
  assistantAvailable.value = false
  assistantOpen.value = false
  assistantPageOpen.value = false
  assistantUnread.value = 0
})

describe('AssistantLauncher', () => {
  it('stays hidden without a ready provider', async () => {
    const mounted = await mountApp(AssistantLauncher, { props: { collapsed: false } })

    expect(() => button(mounted.root, 'Assistant')).toThrow()
    mounted.app.unmount()
  })

  it('steps aside while the assistant page shows the chat', async () => {
    assistantAvailable.value = true
    assistantPageOpen.value = true
    const mounted = await mountApp(AssistantLauncher, { props: { collapsed: false } })

    expect(() => button(mounted.root, 'Assistant')).toThrow()
    mounted.app.unmount()
  })

  it('opens the panel when closed and closes it when open', async () => {
    assistantAvailable.value = true
    const mounted = await mountApp(AssistantLauncher, { props: { collapsed: false } })

    const control = button(mounted.root, 'Assistant')
    expect(control.props['aria-pressed']).toBe(false)
    await click(control)
    await flush()
    expect(openPanel).toHaveBeenCalledOnce()
    expect(closePanel).not.toHaveBeenCalled()

    assistantOpen.value = true
    await flush()
    expect(button(mounted.root, 'Assistant').props['aria-pressed']).toBe(true)
    await click(button(mounted.root, 'Assistant'))
    await flush()
    expect(closePanel).toHaveBeenCalledOnce()
    expect(openPanel).toHaveBeenCalledOnce()
    mounted.app.unmount()
  })

  it('keeps only the icon, title and name when the sidebar is collapsed', async () => {
    assistantAvailable.value = true
    const mounted = await mountApp(AssistantLauncher, { props: { collapsed: true } })

    const control = element(mounted.root, (node) => node.tag === 'button')
    expect(content(control)).not.toContain('Assistant')
    expect(control.props.title).toBe('Assistant')
    expect(control.props['aria-label']).toBe('Assistant')
    mounted.app.unmount()
  })

  it('marks waiting background updates', async () => {
    assistantAvailable.value = true
    assistantUnread.value = 2
    const mounted = await mountApp(AssistantLauncher, { props: { collapsed: false } })

    expect(button(mounted.root, 'Assistant').props['aria-label']).toBe('Assistant, 2 background updates')
    expect(() => element(mounted.root, (node) => 'data-unread' in node.props)).not.toThrow()
    mounted.app.unmount()
  })
})
