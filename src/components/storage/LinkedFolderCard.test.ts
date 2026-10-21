import { defineComponent, h, ref } from 'vue'
import * as VueRuntime from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as LinkedFolders from '@/lib/linkedFolders'
import * as Organize from '@/lib/organize'
import * as Utils from '@/lib/utils'
import { button, click, compileClientComponent, content, element, flush, mountApp, moduleDefault } from '@/test/clientRender'

const IconStub = defineComponent((_, { attrs }) => () => h('i', attrs))
const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})
const DialogStub = defineComponent({
  props: { open: Boolean },
  setup: (props) => () => h('div', { 'data-open': props.open }),
})
const ProgressStub = defineComponent({
  props: { job: Object },
  emits: ['control'],
  setup: (props, { emit }) => () => h('button', { onClick: () => emit('control', 'pause') }, `progress ${props.job?.done}`),
})

const renames = ref<unknown>(null)
const status = ref<unknown>(null)
const job = ref<unknown>(null)
const supported = ref(true)
const control = vi.fn()
const refresh = vi.fn()
const writesDisabled = ref(false)

const Card = compileClientComponent(new URL('./LinkedFolderCard.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => IconStub }),
  '@/components/storage/JobProgress.vue': moduleDefault(ProgressStub),
  '@/components/storage/OrganizeDialog.vue': moduleDefault(DialogStub),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/IconButton.vue': moduleDefault(ButtonStub),
  '@/composables/useLinkState': {
    useLinkState: () => ({ renames, status, job, supported, error: ref(null), controlling: ref(false), refresh, control }),
  },
  '@/lib/connectivity': { OFFLINE_WRITE_HINT: 'offline', useConnectivity: () => ({ writesDisabled }) },
  '@/lib/linkedFolders': LinkedFolders,
  '@/lib/organize': Organize,
  '@/lib/utils': Utils,
})

const RUN = { job_id: 'j', state: 'succeeded', started_at: '', imported: 12, skipped: 0, failed: 0, errors: [] }
const LINK = {
  import_id: 'i1',
  backend_id: 'b',
  backend_prefix: 'genomes/',
  bucket: 'reef',
  key_prefix: 'genomes/',
  write_pattern: '{dir}{name}~{id}',
  created_at: '',
  last_run: RUN,
}

async function mount(link: object = LINK) {
  const events: string[] = []
  const mounted = await mountApp(Card, {
    props: {
      groupId: 'g1',
      link,
      storage: 'lab',
      running: false,
      onRun: () => events.push('run'),
      onEdit: () => events.push('edit'),
    },
  })
  await flush()
  if (mounted.errors.length) throw mounted.errors[0]
  return { ...mounted, events }
}

beforeEach(() => {
  renames.value = null
  status.value = null
  job.value = null
  supported.value = true
  writesDisabled.value = false
  control.mockReset()
  refresh.mockReset()
})

describe('linked folder card', () => {
  it('shows the last run, the name style and an in sync state', async () => {
    status.value = { files: 300214, conflicts: [] }
    const { root } = await mount()
    const text = content(root)
    expect(text).toContain('12 new files')
    expect(text).toContain('New files are named name~ID')
    expect(text).toContain('300,214 files')
    expect(text).not.toContain('TB')
    expect(text).toContain('in sync')
  })

  it('lists the files a run did not add after Show', async () => {
    const errors = [{ key: 'share/a.csv', error: 'the file differs from version X of a.csv' }]
    const { root } = await mount({ ...LINK, last_run: { ...RUN, failed: 1, errors } })
    expect(content(root)).toContain('1 file could not be added.')
    expect(content(root)).not.toContain('the file differs')
    await click(button(root, 'Show'))
    expect(content(root)).toContain('the file differs from version X of a.csv')
    expect(content(root)).not.toContain('in sync')
  })

  it('tells the files of a run once and lists each with its reason', async () => {
    const errors = [{ key: 'raw/report.csv', error: 'run reason' }]
    status.value = { conflicts: [{ path: 'raw/report.csv', reason: 'several rules read this folder' }] }
    const { root } = await mount({ ...LINK, last_run: { ...RUN, failed: 1, errors } })
    expect(content(root)).toContain('1 file could not be added. Choose Show to see why.')
    expect(content(root)).not.toContain('needs a decision')
    expect(content(root)).not.toContain('in sync')
    await click(button(root, 'Show'))
    expect(content(root)).toContain('raw/report.csv')
    expect(content(root)).toContain('several rules read this folder')
  })

  it('opens Organize from a rename problem and from the button', async () => {
    renames.value = { count: 4, complete: true, files: [] }
    const { root } = await mount()
    expect(content(root)).toContain('4 files still have the old name.')
    const dialog = () => element(root, (node) => node.props['data-open'] !== undefined)
    expect(dialog().props['data-open']).toBe(false)
    await click(button(root, 'Show'))
    expect(dialog().props['data-open']).toBe(true)
  })

  it('passes a run, a change and a pause on', async () => {
    job.value = { kind: 'move', state: 'running', done: 5, total: 10, skipped: 0, controls: true }
    const { root, events } = await mount()
    expect(content(root)).toContain('progress 5')
    await click(button(root, 'progress'))
    expect(control).toHaveBeenCalledWith('pause')
    await click(button(root, 'Run now'))
    expect(events).toEqual(['run'])
  })

  it('blocks a run while offline', async () => {
    writesDisabled.value = true
    const { root } = await mount()
    expect(button(root, 'Run now').props.disabled).toBe(true)
    expect(button(root, 'Run now').props['aria-label']).toBe(LinkedFolders.RUN_HINT)
  })
})
