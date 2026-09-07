import { defineComponent, h, ref } from 'vue'
import * as VueRuntime from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { button, click, compileClientComponent, content, flush, moduleDefault, mountApp } from '@/test/clientRender'

async function render() {
  const generation = ref(1)
  const activeCellId = ref('first')
  const noteCellInputs = vi.fn()
  const addSessionInputs = vi.fn()
  const stub = defineComponent({ setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()) })
  const picker = defineComponent({ setup: (_, { emit }) => () => h('button', {
    onClick: () => emit('add', { kind: 'file', url: 's3://source/input.txt', name: 'input.txt' }),
  }, 'Pick input') })
  const modules: Record<string, unknown> = {
    vue: VueRuntime,
    '@lucide/vue': new Proxy({}, { get: () => stub }),
    '@/composables/notebookContext': { injectNotebook: () => ({
      notebook: { generation, activeCellId, noteCellInputs, meta: ref({ workspace_bucket: 'workspace' }) },
      session: { jobId: ref('job-a'), live: ref(true), client: ref({ baseUrl: '/api/v1' }) },
    }) },
    '@/composables/useS3': { useS3: () => ({ listObjects: vi.fn() }) },
    '@/lib/notebook/session': { addSessionInputs, listScratch: vi.fn() },
    '@/lib/notebook/document': { NOTEBOOK_DATA_PREFIX: 'data/' },
    '@/lib/tes': { parseS3Url: () => ({ bucket: 'source', key: 'input.txt' }) },
    '@/lib/utils': { errorMessage: (cause: Error) => cause.message, formatBytes: String },
  }
  for (const path of ['ui/Button', 'ui/Notice', 'ui/OptionToggle', 'data/ObjectBrowserPanel', 'data/AddDataDialog', 'notebook/ScratchFileDialog']) {
    modules[`@/components/${path}.vue`] = moduleDefault(stub)
  }
  modules['@/components/compute/TesDataRefDialog.vue'] = moduleDefault(picker)
  const component = compileClientComponent(new URL('./NotebookFiles.vue', import.meta.url), modules)
  const { root, app } = await mountApp(component)
  return { root, app, generation, activeCellId, noteCellInputs, addSessionInputs }
}

describe('notebook input provenance', () => {
  it.each([false, true])('binds a staged input to the originating cell and document: changed=%s', async (changed) => {
    const { root, app, generation, activeCellId, noteCellInputs, addSessionInputs } = await render()
    let finish = (_result: unknown) => {}
    addSessionInputs.mockReturnValue(new Promise((resolve) => { finish = resolve }))
    await click(button(root, 'Pick input'))
    activeCellId.value = 'second'
    if (changed) generation.value += 1
    finish({ staged: [{ dest_key: 'data/input.txt', version_id: 'source-version', blake3: 'hash' }] })
    await flush()
    if (changed) {
      expect(noteCellInputs).not.toHaveBeenCalled()
      expect(content(root)).not.toContain('files are now')
    } else {
      expect(noteCellInputs).toHaveBeenCalledWith('first', [expect.objectContaining({ version_id: 'source-version' })])
    }
    app.unmount()
  })
})
