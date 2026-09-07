import { defineComponent, h, ref } from 'vue'
import * as VueRuntime from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { compileClientComponent, content, flush, moduleDefault, mountApp } from '@/test/clientRender'

async function render() {
  const jobId = ref('first-job')
  const open = ref(true)
  const readScratch = vi.fn()
  const stub = defineComponent({ setup: (_, { attrs, slots }) => () => h('div', attrs, slots.default?.()) })
  const preview = defineComponent({ props: ['text'], setup: (props) => () => h('pre', props.text) })
  const modules: Record<string, unknown> = {
    vue: VueRuntime,
    '@/lib/notebook/session': { readScratch },
    '@/lib/utils': { errorMessage: (cause: Error) => cause.message },
  }
  for (const path of ['ui/Dialog', 'ui/DialogContent', 'ui/DialogDescription', 'ui/DialogHeader', 'ui/DialogTitle', 'ui/Notice', 'ui/Spinner', 'preview/ImagePreview']) {
    modules[`@/components/${path}.vue`] = moduleDefault(stub)
  }
  for (const path of ['HtmlPreview', 'TextPreview']) modules[`@/components/preview/${path}.vue`] = moduleDefault(preview)
  const component = compileClientComponent(new URL('./ScratchFileDialog.vue', import.meta.url), modules)
  let finish = (_value: string) => {}
  readScratch.mockResolvedValue({ contentType: 'text/plain', blob: { text: () => new Promise<string>((resolve) => { finish = resolve }) } })
  const { root, app } = await mountApp(defineComponent({ setup: () => () => h(component, {
    jobId: jobId.value, open: open.value, path: 'same.txt', client: { baseUrl: '/api/v1', token: 'token' },
  }) }))
  return { root, app, jobId, open, readScratch, finish: (value: string) => finish(value) }
}

describe('scratch previews', () => {
  it('reloads the same path for a new job and ignores the previous text read', async () => {
    const { root, app, jobId, readScratch, finish } = await render()
    readScratch.mockResolvedValue({ contentType: 'text/plain', blob: new Blob(['current file']) })
    jobId.value = 'second-job'
    await flush()
    finish('stale file')
    await flush()
    expect(readScratch).toHaveBeenCalledTimes(2)
    expect(content(root)).toContain('current file')
    expect(content(root)).not.toContain('stale file')
    app.unmount()
  })

  it('ignores a text read completed after closing', async () => {
    const { root, app, open, finish } = await render()
    open.value = false
    await flush()
    finish('closed file')
    await flush()
    expect(content(root)).not.toContain('closed file')
    app.unmount()
  })
})
