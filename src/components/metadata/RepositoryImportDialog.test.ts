import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { button, click, compileClientComponent, content, flush, input, moduleDefault, mountApp, typeValue } from '@/test/clientRender'
import * as Api from '@/lib/api'
import * as Repository from '@/lib/repository'
import * as Utils from '@/lib/utils'

const submitRepositoryImport = vi.fn()
const lookupPid = vi.fn()
const listPersistentIds = vi.fn()
const createRepositoryConnector = vi.fn()
const loadConnectors = vi.fn()
const connectors = ref<unknown[] | null>([])
const canWriteMeta = ref(true)
const capabilities = ref<Record<string, boolean>>({ pull: true, search: true })
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
const SearchStub = defineComponent({
  emits: ['pick'],
  setup: (_, { emit }) => () =>
    h('button', { onClick: () => emit('pick', { id: '77', doi: '10.5281/zenodo.77' }) }, 'Pick record 77'),
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

const ImportDialog = compileClientComponent(new URL('./RepositoryImportDialog.vue', import.meta.url), {
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
  '@/components/metadata/RepositorySearchPanel.vue': moduleDefault(SearchStub),
  '@/components/metadata/TransferJobStatus.vue': moduleDefault(Empty),
  '@/components/metadata/TransferReport.vue': moduleDefault(Empty),
  '@/components/metadata/TransferTarget.vue': moduleDefault(TargetStub),
  '@/composables/useAruna': {
    useAruna: () => ({ apiBaseUrl: ref('https://api.test'), authToken: ref('bearer'), sessionEpoch: ref(0) }),
  },
  '@/composables/useRepository': {
    useRepositoryConnectors: () => ({ connectors, loading: ref(false), error: ref(null), load: loadConnectors }),
    useGroupRights: () => ({ canWriteMeta }),
    useRepositoryKinds: () => ({
      kinds: ref([{ kind: 'invenio' }]),
      error: ref(null),
      kindOf: (kind: string) => (kind === 'invenio' ? { kind, capabilities: capabilities.value, profiles: [] } : null),
    }),
  },
  '@/composables/useJobs': {
    useJobDetail: () => ({ job, loadState: ref('idle'), loadError: ref(null), lastPollError: ref(null), load: vi.fn() }),
  },
  '@/composables/useNotifications': { useNotifications: () => ({ bumpDashboard: vi.fn() }) },
  '@/lib/api': { ...Api, submitRepositoryImport, lookupPid, createRepositoryConnector },
  '@/lib/repository': Repository,
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

function hasButton(root: Parameters<typeof button>[0], label: string): boolean {
  try {
    button(root, label)
    return true
  } catch {
    return false
  }
}

function recordField(root: Parameters<typeof input>[0]) {
  return input(root, 'placeholder', '10.5281/zenodo.1234567')
}

beforeEach(() => {
  connectors.value = [{ connector_id: 'c1', kind: 'invenio', name: 'Zenodo', endpoint: 'https://zenodo.org/api/' }]
  canWriteMeta.value = true
  capabilities.value = { pull: true, search: true, import: true }
  job.value = null
  for (const mock of [submitRepositoryImport, lookupPid, listPersistentIds, createRepositoryConnector, loadConnectors]) mock.mockReset()
  lookupPid.mockResolvedValue([])
  submitRepositoryImport.mockResolvedValue({ job_id: 'j1', status_url: '/jobs/j1' })
})

describe('RepositoryImportDialog', () => {
  it('sends a typed DOI as doi and keeps the dataset updated by default', async () => {
    const mounted = await mount()
    await typeValue(recordField(mounted.root), 'https://doi.org/10.5281/zenodo.42')
    await click(button(mounted.root, 'Import record'))

    const body = submitRepositoryImport.mock.calls[0][0]
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
    expect(submitRepositoryImport.mock.calls[0][0]).toMatchObject({ url: 'https://zenodo.org/records/77' })
    mounted.app.unmount()

    const again = await mount()
    await typeValue(recordField(again.root), '77')
    await click(button(again.root, 'Import record'))
    expect(submitRepositoryImport.mock.calls[1][0]).toMatchObject({ record_id: '77' })
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

  it('asks to try again when not every node answered the DOI check', async () => {
    lookupPid.mockRejectedValue(new Api.ApiError(503, 'Service unavailable'))
    const mounted = await mount()
    await typeValue(recordField(mounted.root), '10.5281/zenodo.42')
    await flush()

    expect(content(mounted.root)).toContain('could not check')
    lookupPid.mockResolvedValue([{ document_id: 'd1', origin: 'imported' }])
    await click(button(mounted.root, 'Retry'))

    expect(lookupPid).toHaveBeenCalledTimes(2)
    expect(lookupPid).toHaveBeenLastCalledWith('doi', '10.5281/zenodo.42', expect.anything())
    expect(content(mounted.root)).toContain('A dataset already holds this DOI')
    mounted.app.unmount()
  })

  it('forgets the DOI of a hit picked twice once another record is typed', async () => {
    const mounted = await mount()
    await click(button(mounted.root, 'Pick record 77'))
    await click(button(mounted.root, 'Pick record 77'))
    await typeValue(recordField(mounted.root), '88')

    expect(lookupPid).toHaveBeenCalledTimes(1)
    expect(lookupPid).toHaveBeenCalledWith('doi', '10.5281/zenodo.77', expect.anything())
    mounted.app.unmount()
  })

  it('does not keep an import updated without metadata write in the group', async () => {
    canWriteMeta.value = false
    const mounted = await mount()
    expect(content(mounted.root)).toContain("Needs write access to the group's metadata.")
    await typeValue(recordField(mounted.root), '42')
    await click(button(mounted.root, 'Import record'))

    expect(submitRepositoryImport.mock.calls[0][0]).toMatchObject({ keep_updated: false })
    expect(submitRepositoryImport.mock.calls[0][0]).not.toHaveProperty('auto_update')
    mounted.app.unmount()
  })

  it('offers search and keeping updated only when the repository kind can', async () => {
    capabilities.value = { pull: false, search: false, import: true }
    const mounted = await mount()
    expect(hasButton(mounted.root, 'Pick record 77')).toBe(false)
    expect(content(mounted.root)).not.toContain('Keep updated')
    await typeValue(recordField(mounted.root), '10.5281/zenodo.42')
    expect(button(mounted.root, 'Import record').props.disabled).toBe(true)
    await typeValue(recordField(mounted.root), '42')
    await click(button(mounted.root, 'Import record'))

    expect(submitRepositoryImport.mock.calls[0][0]).toMatchObject({ keep_updated: false })
    mounted.app.unmount()
  })

  it('hides connectors of a kind without imports', async () => {
    capabilities.value = { pull: true, search: true, import: false }
    const mounted = await mount()
    await typeValue(recordField(mounted.root), '42')

    expect(button(mounted.root, 'Import record').props.disabled).toBe(true)
    mounted.app.unmount()
  })

  it('hides connectors of a kind the node cannot import from', async () => {
    connectors.value = [{ connector_id: 'c9', kind: 'oai_pmh', name: 'Harvest', endpoint: 'https://oai.example.org' }]
    const mounted = await mount()
    await typeValue(recordField(mounted.root), '42')

    expect(button(mounted.root, 'Import record').props.disabled).toBe(true)
    mounted.app.unmount()
  })

  it('shows why the repository has no record for a DOI', async () => {
    submitRepositoryImport.mockRejectedValue(new Api.ApiError(400, 'no published record has this DOI'))
    const mounted = await mount()
    await typeValue(recordField(mounted.root), '10.5281/zenodo.404')
    await click(button(mounted.root, 'Import record'))

    expect(content(mounted.root)).toContain('no published record has this DOI')
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
