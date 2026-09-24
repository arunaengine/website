import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { button, click, compileClientComponent, content, flush, input, moduleDefault, mountApp, typeValue } from '@/test/clientRender'
import * as Api from '@/lib/api'
import * as Invenio from '@/lib/invenio'
import * as Utils from '@/lib/utils'

const submitInvenioImport = vi.fn()
const lookupPid = vi.fn()
const listPersistentIds = vi.fn()
const createRepositoryConnector = vi.fn()
const loadConnectors = vi.fn()
const connectors = ref<unknown[] | null>([])
const canWriteData = ref(true)
const job = ref<unknown>(null)

const Empty = defineComponent(() => () => null)
const Slot = defineComponent((_, { attrs, slots }) => () => h('div', attrs, slots.default?.()))
const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})
const InputStub = defineComponent({
  props: { modelValue: String },
  emits: ['update:modelValue'],
  setup: (props, { attrs, emit }) => () =>
    h('input', {
      ...attrs,
      value: props.modelValue,
      onInput: (event: { target: { value: string } }) => emit('update:modelValue', event.target.value),
    }),
})
// Fills the target the way a user would; the dialog only needs the models.
const TargetStub = defineComponent({
  props: { groupId: String, bucket: String, prefix: String },
  emits: ['update:groupId', 'update:bucket', 'update:prefix'],
  setup: (_, { emit, slots }) => {
    emit('update:groupId', 'g1')
    emit('update:bucket', 'b1')
    return () => h('div', slots.default?.())
  },
})

const ImportDialog = compileClientComponent(new URL('./InvenioImportDialog.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { RouterLink: Slot },
  '@lucide/vue': new Proxy({}, { get: () => Empty }),
  '@/components/ui/Dialog.vue': moduleDefault(Slot),
  '@/components/ui/DialogContent.vue': moduleDefault(Slot),
  '@/components/ui/DialogHeader.vue': moduleDefault(Slot),
  '@/components/ui/DialogTitle.vue': moduleDefault(Slot),
  '@/components/ui/DialogDescription.vue': moduleDefault(Slot),
  '@/components/ui/DialogFooter.vue': moduleDefault(Slot),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/CopyButton.vue': moduleDefault(Empty),
  '@/components/ui/ExternalLink.vue': moduleDefault(defineComponent({
    props: { label: String },
    setup: (props) => () => h('a', props.label),
  })),
  '@/components/ui/DetailList.vue': moduleDefault(Empty),
  '@/components/ui/Input.vue': moduleDefault(InputStub),
  '@/components/ui/Notice.vue': moduleDefault(Slot),
  '@/components/ui/OptionToggle.vue': moduleDefault(Empty),
  '@/components/ui/Select.vue': moduleDefault(Empty),
  '@/components/ui/Spinner.vue': moduleDefault(Empty),
  '@/components/ui/Switch.vue': moduleDefault(Empty),
  '@/components/metadata/InvenioSearchPanel.vue': moduleDefault(Empty),
  '@/components/metadata/TransferJobStatus.vue': moduleDefault(Empty),
  '@/components/metadata/TransferReport.vue': moduleDefault(Empty),
  '@/components/metadata/TransferTarget.vue': moduleDefault(TargetStub),
  '@/composables/useAruna': {
    useAruna: () => ({ apiBaseUrl: ref('https://api.test'), authToken: ref('bearer'), sessionEpoch: ref(0) }),
  },
  '@/composables/useInvenio': {
    useRepositoryConnectors: () => ({ connectors, loading: ref(false), error: ref(null), load: loadConnectors }),
    useGroupRights: () => ({ canWriteData }),
  },
  '@/composables/useJobs': {
    useJobDetail: () => ({ job, loadState: ref('idle'), loadError: ref(null), lastPollError: ref(null), load: vi.fn() }),
  },
  '@/composables/useNotifications': { useNotifications: () => ({ bumpDashboard: vi.fn() }) },
  '@/lib/api': { ...Api, submitInvenioImport, lookupPid, createRepositoryConnector },
  '@/lib/invenio': Invenio,
  '@/lib/jobs': { isTerminalJobState: (state: string) => ['succeeded', 'failed', 'cancelled'].includes(state) },
  '@/lib/pid': { listPersistentIds },
  '@/lib/rocrateArchive': {
    importJobResult: (result: unknown) => (result && typeof result === 'object' && 'entries_total' in result ? result : null),
  },
  '@/lib/utils': Utils,
})

async function mount() {
  const mounted = await mountApp(ImportDialog, { props: { open: true } })
  // The group pick reloads its connectors, which preselects the only one.
  connectors.value = [...(connectors.value ?? [])]
  await flush()
  if (mounted.errors.length) throw mounted.errors[0]
  return mounted
}

function recordField(root: Parameters<typeof input>[0]) {
  return input(root, 'placeholder', '10.5281/zenodo.1234567')
}

beforeEach(() => {
  connectors.value = [{ connector_id: 'c1', kind: 'invenio', name: 'Zenodo', endpoint: 'https://zenodo.org/api/' }]
  canWriteData.value = true
  job.value = null
  for (const mock of [submitInvenioImport, lookupPid, listPersistentIds, createRepositoryConnector, loadConnectors]) mock.mockReset()
  lookupPid.mockResolvedValue([])
  submitInvenioImport.mockResolvedValue({ job_id: 'j1', status_url: '/jobs/j1' })
})

describe('InvenioImportDialog', () => {
  it('sends a typed DOI as doi and keeps the dataset updated by default', async () => {
    const mounted = await mount()
    await typeValue(recordField(mounted.root), 'https://doi.org/10.5281/zenodo.42')
    await click(button(mounted.root, 'Import record'))

    const body = submitInvenioImport.mock.calls[0][0]
    expect(body).toMatchObject({
      doi: '10.5281/zenodo.42', group_id: 'g1', connector_id: 'c1', mode: 'copy', all_versions: false,
      keep_updated: true, auto_update: false, metadata: { path: 'datasets/zenodo.42' },
    })
    expect(body).not.toHaveProperty('record_id')
    mounted.app.unmount()
  })

  it('sends a record link as url and a plain id as record_id', async () => {
    const mounted = await mount()
    await typeValue(recordField(mounted.root), 'https://zenodo.org/records/77')
    await click(button(mounted.root, 'Import record'))
    expect(submitInvenioImport.mock.calls[0][0]).toMatchObject({ url: 'https://zenodo.org/records/77' })
    mounted.app.unmount()

    const again = await mount()
    await typeValue(recordField(again.root), '77')
    await click(button(again.root, 'Import record'))
    expect(submitInvenioImport.mock.calls[1][0]).toMatchObject({ record_id: '77' })
    again.app.unmount()
  })

  it('warns when datasets already hold the typed DOI', async () => {
    lookupPid.mockResolvedValue([{ document_id: 'd1', origin: 'published' }, { document_id: 'd2', origin: 'imported' }])
    const mounted = await mount()
    await typeValue(recordField(mounted.root), '10.5281/zenodo.42')
    await flush()

    expect(lookupPid).toHaveBeenCalledWith('doi', '10.5281/zenodo.42', expect.anything())
    expect(content(mounted.root)).toContain('2 datasets already hold this DOI')
    mounted.app.unmount()
  })

  it('shows the imported DOIs after success', async () => {
    listPersistentIds.mockResolvedValue([{
      secondary_identifiers: [
        { kind: 'doi', value: '10.5281/zenodo.42', origin: 'imported' },
        { kind: 'doi', value: '10.5281/zenodo.41', origin: 'imported' },
      ],
    }])
    const mounted = await mount()
    await typeValue(recordField(mounted.root), '42')
    await click(button(mounted.root, 'Import record'))
    job.value = { state: 'succeeded', result: { entries_total: 1, imported: 1, unlisted: 0, failed: 0, document_id: 'new' } }
    await flush()
    await flush()

    expect(listPersistentIds).toHaveBeenCalledWith('new', expect.anything())
    expect(content(mounted.root)).toContain('10.5281/zenodo.41')
    mounted.app.unmount()
  })

  it('associates the record and path labels with their fields', async () => {
    const mounted = await mount()
    const record = recordField(mounted.root)
    const path = input(mounted.root, 'placeholder', 'datasets/my-dataset')

    expect(record.props.id).toBeTruthy()
    expect(path.props.id).toBeTruthy()
    expect(record.props.id).not.toBe(path.props.id)
    mounted.app.unmount()
  })
})
