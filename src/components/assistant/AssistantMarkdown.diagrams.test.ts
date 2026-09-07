import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import MarkdownIt from 'markdown-it'
import { describe, expect, it, vi } from 'vitest'
import { compileClientComponent, element, flush, mountApp } from '@/test/clientRender'

async function mount(render: ReturnType<typeof vi.fn>) {
  const initialize = vi.fn()
  const text = ref('```mermaid\nflowchart LR\nA-->B\n```')
  const component = compileClientComponent(new URL('./AssistantMarkdown.vue', import.meta.url), {
    vue: VueRuntime,
    'markdown-it': { __esModule: true, default: MarkdownIt },
    mermaid: { __esModule: true, default: { initialize, render } },
    '@lucide/vue': new Proxy({}, { get: () => defineComponent(() => () => null) }),
    '@/lib/assistant/citations': { citations: () => {} },
    '@/lib/assistant/objectLinks': { objectLinks: () => {} },
    '@/composables/usePageContext': { usePageContext: () => ({ currentPage: () => null }) },
    '@/composables/useAssistantObject': { useAssistantObject: () => ({ follow: vi.fn() }) },
    '@/composables/useTheme': { useTheme: () => ({ isDark: ref(true) }) },
  })
  const { root, app } = await mountApp(defineComponent({ setup: () => () => h(component, { text: text.value, mermaid: true }) }))
  await flush()
  return { text, app, initialize, html: () => String(element(root, (node) => typeof node.props.innerHTML === 'string').props.innerHTML) }
}

describe('Markdown diagrams', () => {
  it('renders Mermaid as an image using strict dark-theme settings', async () => {
    const render = vi.fn().mockResolvedValue({ svg: '<svg xmlns="http://www.w3.org/2000/svg"><text>Diagram</text></svg>' })
    const view = await mount(render)
    expect(view.initialize).toHaveBeenCalledWith(expect.objectContaining({ securityLevel: 'strict', theme: 'dark', startOnLoad: false }))
    expect(view.html()).toContain('alt="Mermaid diagram"')
    expect(view.html()).toContain('data:image/svg+xml')
    expect(view.html()).not.toContain('<svg')
    view.app.unmount()
  })

  it('keeps invalid diagram source visible with a readable error', async () => {
    const view = await mount(vi.fn().mockRejectedValue(new Error('invalid graph')))
    expect(view.html()).toContain('Could not render this Mermaid diagram')
    expect(view.html()).toContain('A--&gt;B')
    view.app.unmount()
  })

  it('ignores a diagram result after its source changes', async () => {
    let finish = (_result: { svg: string }) => {}
    const view = await mount(vi.fn().mockReturnValue(new Promise((resolve) => { finish = resolve })))
    view.text.value = '# Changed'
    await flush()
    finish({ svg: '<svg>old diagram</svg>' })
    await flush()
    expect(view.html()).toContain('<h1>Changed</h1>')
    expect(view.html()).not.toContain('Mermaid diagram')
    view.app.unmount()
  })
})
