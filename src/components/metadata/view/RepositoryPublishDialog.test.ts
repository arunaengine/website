import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  button,
  click,
  compileClientComponent,
  content,
  flush,
  input,
  moduleDefault,
  mountApp,
  typeValue,
} from '@/test/clientRender'
import * as Api from '@/lib/api'
import * as Repository from '@/lib/repository'
import * as Utils from '@/lib/utils'

const SECRET = 'pat-secret-value'
const sessionEpoch = ref(0)
const createRepositoryLink = vi.fn()
const submitRepositoryExport = vi.fn()
const listPersistentIds = vi.fn()
const getRepositoryLink = vi.fn()
const listRepositoryLinks = vi.fn()
const publishRepositoryLink = vi.fn()
const createRepositoryConnector = vi.fn()
const loadConnectors = vi.fn()
const connectors = ref<unknown[] | null>([])
const canWriteMeta = ref(true)
const job = ref<unknown>(null)
const checkRepository = vi.fn()
const ALL_CAPABILITIES = { drafts: true, reserve_identifier: true, versions: true, review: true, pull: true, search: true, release_date: true }
const capabilities = ref<Record<string, boolean>>({ ...ALL_CAPABILITIES })
const PROFILE = { iri: 'https://w3id.org/aruna/profiles/repository/zenodo', name: 'Zenodo', shapes: ['@prefix a: <x:> .', 'a:b a:c a:d .'] }
let poller: { run: () => Promise<void>; skip: () => boolean } | null = null
const ZENODO = { connector_id: 'c1', kind: 'invenio', name: 'Zenodo', endpoint: 'https://zenodo.org/api/' }
const VIOLATION = { code: 'constraint_violation', severity: 'violation', focus_node: './', path: 'http://schema.org/author', rule: 'minCount', message: 'Add an author.', completeness: 'complete' }
const WARNING = { ...VIOLATION, severity: 'warning', path: 'http://schema.org/license', message: 'Add a license.' }

function checked(findings: unknown[] = [], mapping: unknown[] = []) {
  return { kind: 'invenio', profile: { iri: PROFILE.iri }, ready: !findings.length, findings, mapping }
}

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
const SwitchStub = defineComponent({
  props: { checked: Boolean },
  emits: ['update:checked'],
  setup: (props, { attrs, emit }) => () =>
    h('input', { 'aria-label': attrs['aria-label'], checked: props.checked, onClick: () => emit('update:checked', !props.checked) }),
})

const Dialog = compileClientComponent(new URL('./RepositoryPublishDialog.vue', import.meta.url), {
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
    props: { label: String, href: String },
    setup: (props) => () => h('a', { href: props.href }, props.label),
  })),
  '@/components/ui/Input.vue': moduleDefault(InputStub),
  '@/components/ui/Notice.vue': moduleDefault(Slot),
  '@/components/ui/Select.vue': moduleDefault(Empty),
  '@/components/ui/Spinner.vue': moduleDefault(Empty),
  '@/components/ui/Switch.vue': moduleDefault(SwitchStub),
  '@/components/ui/Textarea.vue': moduleDefault(Empty),
  '@/components/metadata/TransferJobStatus.vue': moduleDefault(Empty),
  './RequirementFindings.vue': moduleDefault(defineComponent({
    props: { findings: Array },
    setup: (props) => () => h('ul', (props.findings as Array<{ message: string }>).map((entry) => h('li', entry.message))),
  })),
  './RequirementForm.vue': moduleDefault(defineComponent({
    props: { shapes: String },
    emits: ['saved'],
    setup: (props, { emit }) => () => h('button', { onClick: () => emit('saved') }, `Save form ${props.shapes?.length ?? 0}`),
  })),
  '@/composables/useAruna': {
    useAruna: () => ({ apiBaseUrl: ref('https://api.test'), authToken: ref('bearer'), sessionEpoch }),
  },
  '@/composables/useRepository': {
    useRepositoryConnectors: () => ({ connectors, loading: ref(false), error: ref(null), load: loadConnectors }),
    useGroupRights: () => ({ canWriteMeta }),
    useRepositoryKinds: () => ({
      kinds: ref([{ kind: 'invenio' }]),
      error: ref(null),
      kindOf: (kind: string) => (kind === 'invenio' ? { kind, capabilities: capabilities.value, profiles: [PROFILE] } : null),
    }),
  },
  '@/composables/useJobs': {
    useJobDetail: () => ({ job, loadState: ref('idle'), loadError: ref(null), lastPollError: ref(null), load: vi.fn() }),
  },
  '@/lib/jobs': { isTerminalJobState: (state: string) => ['succeeded', 'failed', 'cancelled'].includes(state) },
  '@/lib/poll': {
    POLL_ACTIVE_MS: 3000,
    follow: (run: () => Promise<void>, _delay: unknown, skip: () => boolean) => {
      poller = { run, skip }
      return () => (poller = null)
    },
  },
  '@/lib/api': {
    ...Api, checkRepository, createRepositoryLink, submitRepositoryExport, getRepositoryLink, listRepositoryLinks, publishRepositoryLink, createRepositoryConnector,
  },
  '@/lib/repository': Repository,
  '@/lib/pid': { listPersistentIds },
  '@/lib/utils': Utils,
})

async function mount() {
  const mounted = await mountApp(Dialog, { props: { open: true, documentId: 'd1', groupId: 'g1' } })
  await flush()
  if (mounted.errors.length) throw mounted.errors[0]
  return mounted
}

function tokenInput(root: Parameters<typeof input>[0]) {
  return input(root, 'aria-label', 'Personal access token')
}

async function exportOnce(root: Parameters<typeof input>[0]) {
  await click(button(root, 'Advanced options'))
  await click(input(root, 'aria-label', 'Export once'))
}

function draftLink(remote: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return { link_id: 'l1', document_id: 'd1', status: 'enabled', pending: false, remote: { published: false, ...remote }, ...extra }
}

beforeEach(() => {
  sessionEpoch.value = 0
  connectors.value = [ZENODO]
  canWriteMeta.value = true
  job.value = null
  capabilities.value = { ...ALL_CAPABILITIES }
  checkRepository.mockReset().mockResolvedValue(checked())
  getRepositoryLink.mockReset()
  listRepositoryLinks.mockReset().mockResolvedValue([])
  publishRepositoryLink.mockReset()
  createRepositoryConnector.mockReset()
  loadConnectors.mockReset()
  createRepositoryLink.mockReset().mockResolvedValue(draftLink({}, { pending: true }))
  submitRepositoryExport.mockReset().mockResolvedValue({ job_id: 'j1', status_url: '/compute/jobs/j1' })
  listPersistentIds.mockReset().mockResolvedValue([
    { secondary_identifiers: [{ kind: 'invenio_parent', value: 'parent-1', endpoint: 'https://zenodo.org/api' }] },
  ])
})

describe('RepositoryPublishDialog', () => {
  it('creates a public link that starts a new record and forgets the token', async () => {
    const mounted = await mount()
    expect(content(mounted.root)).toContain('deposit:write and deposit:actions')
    await typeValue(tokenInput(mounted.root), SECRET)
    await click(button(mounted.root, 'Publish to Zenodo'))

    expect(createRepositoryLink).toHaveBeenCalledWith(
      'd1',
      { group_id: 'g1', connector_id: 'c1', access_token: SECRET, auto_publish: false, public_files: true },
      expect.anything(),
    )
    expect(content(mounted.root)).toContain('Creating the draft and reserving a DOI')
    mounted.app.unmount()
  })

  it('shows the reserved DOI and publishes once the push finished', async () => {
    getRepositoryLink
      .mockResolvedValueOnce(draftLink({ draft_id: 'r1', doi: '10.5281/zenodo.7', doi_reserved: true }, { pending: true }))
      .mockResolvedValueOnce(draftLink({ draft_id: 'r1', doi: '10.5281/zenodo.7', doi_reserved: true }))
    publishRepositoryLink.mockResolvedValue({ job_id: 'j9', status_url: '/jobs/j9' })
    const mounted = await mount()
    await typeValue(tokenInput(mounted.root), SECRET)
    await click(button(mounted.root, 'Publish to Zenodo'))
    expect(poller?.skip()).toBe(false)

    await poller!.run()
    await flush()
    expect(content(mounted.root)).toContain('10.5281/zenodo.7')
    expect(content(mounted.root)).toContain('Reserved, becomes active when published.')
    expect(button(mounted.root, 'Publish').props.disabled).toBe(true)

    await poller!.run()
    await flush()
    expect(poller?.skip()).toBe(true)
    await click(button(mounted.root, 'Publish'))
    expect(publishRepositoryLink).toHaveBeenCalledWith('d1', 'l1', expect.anything())
    mounted.app.unmount()
  })

  it('checks the dataset first and blocks publishing on a violation', async () => {
    checkRepository.mockResolvedValueOnce(checked([VIOLATION, WARNING])).mockResolvedValueOnce(checked([WARNING]))
    const mounted = await mount()
    await typeValue(tokenInput(mounted.root), SECRET)

    expect(checkRepository).toHaveBeenCalledWith('d1', { group_id: 'g1', connector_id: 'c1' }, expect.anything())
    expect(content(mounted.root)).toContain('Add an author.')
    expect(content(mounted.root)).toContain('Add a license.')
    expect(button(mounted.root, 'Publish to Zenodo').props.disabled).toBe(true)

    // The form gets the joined profile shapes and a save checks again.
    await click(button(mounted.root, `Save form ${PROFILE.shapes.join('\n').length}`))
    await flush()
    expect(checkRepository).toHaveBeenCalledTimes(2)
    expect(content(mounted.root)).not.toContain('Add an author.')
    expect(button(mounted.root, 'Publish to Zenodo').props.disabled).toBe(false)
    mounted.app.unmount()
  })

  it('shows the unmet requirements of a refused link and keeps the token', async () => {
    createRepositoryLink
      .mockRejectedValueOnce(new Api.ApiError(400, 'unmet', 'requirements_unmet', { error: 'x', findings: [VIOLATION] }))
    const mounted = await mount()
    await typeValue(tokenInput(mounted.root), SECRET)
    await click(button(mounted.root, 'Publish to Zenodo'))

    expect(content(mounted.root)).toContain('Add an author.')
    expect(content(mounted.root)).toContain('needs more metadata')
    expect(tokenInput(mounted.root).props.value).toBe(SECRET)
    expect(button(mounted.root, 'Publish to Zenodo').props.disabled).toBe(true)
    mounted.app.unmount()
  })

  it('lets the node decide when the check could not run', async () => {
    checkRepository.mockRejectedValue(new Api.ApiError(503, 'node busy'))
    const mounted = await mount()
    await typeValue(tokenInput(mounted.root), SECRET)

    expect(content(mounted.root)).toContain('The check did not run: node busy')
    expect(button(mounted.root, 'Publish to Zenodo').props.disabled).toBe(false)
    mounted.app.unmount()
  })

  it('shows where dataset entities go in the repository', async () => {
    checkRepository.mockResolvedValue(checked([], [{ entity_id: 'data.csv', target: 'files', field: 'entries' }]))
    const mounted = await mount()
    await click(button(mounted.root, 'Show what goes where'))

    expect(content(mounted.root)).toContain('data.csv to files, field entries')
    mounted.app.unmount()
  })

  it('leaves out DOI reservation and review texts the repository kind does not have', async () => {
    capabilities.value = { ...ALL_CAPABILITIES, reserve_identifier: false, review: false }
    connectors.value = [{ ...ZENODO, community: 'ecology' }]
    const mounted = await mount()
    expect(content(mounted.root)).not.toContain('reserves its DOI')
    expect(content(mounted.root)).not.toContain('community ecology')
    await typeValue(tokenInput(mounted.root), SECRET)
    await click(button(mounted.root, 'Publish to Zenodo'))

    expect(content(mounted.root)).toContain('Creating the draft…')
    mounted.app.unmount()
  })

  it('treats a 400 without the requirements code as an error', async () => {
    createRepositoryLink.mockRejectedValueOnce(new Api.ApiError(400, 'bad token', 'invalid_request', { findings: [VIOLATION] }))
    const mounted = await mount()
    await typeValue(tokenInput(mounted.root), SECRET)
    await click(button(mounted.root, 'Publish to Zenodo'))

    expect(content(mounted.root)).not.toContain('Add an author.')
    expect(content(mounted.root)).toContain('bad token')
    mounted.app.unmount()
  })

  it('stops following a draft without a DOI and still offers publish', async () => {
    getRepositoryLink.mockResolvedValue(draftLink({ draft_id: 'r1', doi: null }))
    const mounted = await mount()
    await typeValue(tokenInput(mounted.root), SECRET)
    await click(button(mounted.root, 'Publish to Zenodo'))
    await poller!.run()
    await flush()

    expect(poller?.skip()).toBe(true)
    expect(content(mounted.root)).toContain('No DOI was reserved. The repository assigns one on publish.')
    expect(button(mounted.root, 'Publish').props.disabled).toBe(false)
    mounted.app.unmount()
  })

  it('does not continue a record the dataset imports updates from', async () => {
    listRepositoryLinks.mockResolvedValue([{
      link_id: 'p', direction: 'pull', status: 'enabled', endpoint: 'https://zenodo.org/api/',
      remote: { parent_id: 'parent-1', published: true },
    }])
    const mounted = await mount()

    expect(content(mounted.root)).toContain('imports updates from its source record (parent-1)')
    expect(() => input(mounted.root, 'aria-label', 'Continue the source record')).toThrow()
    mounted.app.unmount()
  })

  it('words the continued record by its origin', async () => {
    listPersistentIds.mockResolvedValue([{
      secondary_identifiers: [{ kind: 'invenio_parent', value: 'parent-1', endpoint: 'https://zenodo.org/api', origin: 'published' }],
    }])
    const mounted = await mount()

    expect(content(mounted.root)).toContain('Continue the published record')
    expect(content(mounted.root)).not.toContain('imported from')
    mounted.app.unmount()
  })

  it('drops a preset answer that arrives after the session changed', async () => {
    connectors.value = []
    let answer: (value: unknown) => void = () => {}
    createRepositoryConnector.mockReturnValue(new Promise((resolve) => (answer = resolve)))
    const mounted = await mount()
    const pending = click(button(mounted.root, 'Add Zenodo'))
    sessionEpoch.value++
    await flush()
    answer({ connector_id: 'new' })
    await pending

    expect(loadConnectors).not.toHaveBeenCalled()
    mounted.app.unmount()
  })

  it('hides publish while the community reviews the record', async () => {
    getRepositoryLink.mockResolvedValue(draftLink({ draft_id: 'r1', doi: '10.5281/zenodo.7', doi_reserved: true, review: 'pending' }))
    const mounted = await mount()
    await typeValue(tokenInput(mounted.root), SECRET)
    await click(button(mounted.root, 'Publish to Zenodo'))
    await poller!.run()
    await flush()

    expect(content(mounted.root)).toContain('Waiting for community review')
    expect(content(mounted.root)).not.toContain('Publishing is permanent')
    mounted.app.unmount()
  })

  it('adds the Zenodo preset when the group has no repository', async () => {
    connectors.value = []
    createRepositoryConnector.mockResolvedValue({ connector_id: 'new' })
    const mounted = await mount()
    await click(button(mounted.root, 'Add Zenodo'))

    expect(createRepositoryConnector).toHaveBeenCalledWith(
      'g1',
      { name: 'Zenodo', kind: 'invenio', endpoint: 'https://zenodo.org/api/', secret_config: {} },
      expect.anything(),
    )
    expect(loadConnectors).toHaveBeenCalled()
    mounted.app.unmount()
  })

  it('offers no preset to a member who cannot manage repositories', async () => {
    connectors.value = []
    canWriteMeta.value = false
    const mounted = await mount()

    expect(content(mounted.root)).not.toContain('Add Zenodo')
    expect(content(mounted.root)).toContain('Ask someone who manages')
    mounted.app.unmount()
  })

  it('shows the DOIs of a finished one-time export', async () => {
    const mounted = await mount()
    await exportOnce(mounted.root)
    await typeValue(tokenInput(mounted.root), SECRET)
    await click(button(mounted.root, 'Start export'))
    job.value = {
      state: 'succeeded',
      result: {
        repository: {
          id: 'r1', url: 'https://zenodo.org/api/records/r1', published: true, parent_id: 'p1', revision_id: 3,
          doi: '10.5281/zenodo.2', concept_doi: '10.5281/zenodo.1', html_url: 'https://zenodo.org/records/2',
          in_review: false, warning: 'The file check failed after publishing.',
        },
      },
    }
    await flush()
    const text = content(mounted.root)

    expect(text).toContain('10.5281/zenodo.2')
    expect(text).toContain('10.5281/zenodo.1')
    expect(text).toContain('Open in the repository')
    expect(text).toContain('Published')
    expect(text).toContain('The file check failed after publishing.')
    mounted.app.unmount()
  })

  it('shows a one-time export that waits for community review', async () => {
    const mounted = await mount()
    await exportOnce(mounted.root)
    await typeValue(tokenInput(mounted.root), SECRET)
    await click(button(mounted.root, 'Start export'))
    job.value = {
      state: 'succeeded',
      result: {
        repository: {
          id: 'r1', url: 'https://zenodo.org/api/records/r1/draft', published: false, parent_id: 'p1', revision_id: 1,
          doi: '10.5281/zenodo.4', in_review: true,
        },
      },
    }
    await flush()
    const text = content(mounted.root)

    expect(text).toContain('Waiting for community review')
    expect(text).toContain('Reserved, becomes active when published.')
    mounted.app.unmount()
  })

  it('keeps the token out of the export idempotency key', async () => {
    const mounted = await mount()
    await exportOnce(mounted.root)
    await typeValue(tokenInput(mounted.root), SECRET)
    await click(button(mounted.root, 'Start export'))

    const [documentId, repository, key] = submitRepositoryExport.mock.calls[0]
    expect(documentId).toBe('d1')
    expect(repository).toMatchObject({ access_token: SECRET, publish: false, public_files: true })
    expect(key).not.toContain(SECRET)
    mounted.app.unmount()
  })

  it('clears a typed token when the session changes', async () => {
    const mounted = await mount()
    await typeValue(tokenInput(mounted.root), SECRET)
    sessionEpoch.value++
    await flush()

    expect(tokenInput(mounted.root).props.value).toBe('')
    mounted.app.unmount()
  })
})
