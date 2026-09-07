import { defineComponent, h, ref } from 'vue'
import * as VueRuntime from 'vue'
import { describe, expect, it, vi } from 'vitest'
import * as Pipeline from '@/lib/notebook/pipeline'
import { newCell } from '@/lib/notebook/nbformat'
import * as Tes from '@/lib/tes'
import { button, click, compileClientComponent, moduleDefault, mountApp } from '@/test/clientRender'

async function render() {
  const cell = newCell('raw', JSON.stringify({ image: 'alpine:3.20', command: ['true'], cpu_cores: 1, ram_bytes: 1_000_000_000 }))
  cell.metadata.aruna = { kind: 'pipeline' }
  const generation = ref(1)
  const noteCellRun = vi.fn()
  const submitJob = vi.fn()
  const stub = defineComponent({ setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()) })
  const component = compileClientComponent(new URL('./NotebookPipelineCell.vue', import.meta.url), {
    vue: VueRuntime,
    '@lucide/vue': new Proxy({}, { get: () => stub }),
    '@/components/ui/Button.vue': moduleDefault(stub),
    '@/components/ui/Input.vue': moduleDefault(stub),
    '@/components/ui/Notice.vue': moduleDefault(stub),
    '@/components/assistant/cards/JobCard.vue': moduleDefault(stub),
    '@/components/compute/TesDataRefDialog.vue': moduleDefault(stub),
    '@/composables/notebookContext': { injectNotebook: () => ({ notebook: {
      generation, noteCellRun,
      meta: ref({ group_id: 'group-1', workspace_bucket: 'lab-data' }),
      setSource: (_id: string, source: string) => { cell.source = source },
    } }) },
    '@/composables/useAruna': { useAruna: () => ({ apiBaseUrl: ref('/api/v1'), authToken: ref('token') }) },
    '@/lib/jobs': { submitJob, submitErrorMessage: (cause: Error) => cause.message },
    '@/lib/notebook/pipeline': Pipeline,
    '@/lib/tes': Tes,
  })
  const { root, app } = await mountApp(defineComponent({ setup: () => () => h(component, { cell }) }))
  return { root, app, submitJob, noteCellRun, generation }
}

describe('pipeline runs', () => {
  it('runs the same cell twice using different submission keys', async () => {
    const { root, app, submitJob } = await render()
    submitJob.mockResolvedValue({ job_id: 'job-1' })
    await click(button(root, 'Run this step'))
    await click(button(root, 'Run this step'))
    const keys = submitJob.mock.calls.map(([request]) => request.idempotency_key)
    expect(keys).toHaveLength(2)
    expect(keys[0]).toBeTruthy()
    expect(keys[1]).not.toBe(keys[0])
    app.unmount()
  })

  it('keeps the key when retrying a failed submission', async () => {
    const { root, app, submitJob } = await render()
    submitJob.mockRejectedValueOnce(new Error('connection lost')).mockResolvedValueOnce({ job_id: 'job-1' })
    await click(button(root, 'Run this step'))
    await click(button(root, 'Run this step'))
    const keys = submitJob.mock.calls.map(([request]) => request.idempotency_key)
    expect(keys[1]).toBe(keys[0])
    app.unmount()
  })

  it('does not record a result after the notebook changes', async () => {
    const { root, app, submitJob, noteCellRun, generation } = await render()
    let finish = (_value: { job_id: string }) => {}
    submitJob.mockReturnValue(new Promise((resolve) => { finish = resolve }))
    const sending = click(button(root, 'Run this step'))
    generation.value += 1
    finish({ job_id: 'old-job' })
    await sending
    expect(noteCellRun).not.toHaveBeenCalled()
    app.unmount()
  })
})
