import { computed, defineComponent, h, ref, type Component } from 'vue'
import * as VueRuntime from 'vue'
import { describe, expect, it, vi } from 'vitest'
import * as CursorPage from '@/composables/useCursorPage'
import * as Organize from '@/lib/organize'
import * as Utils from '@/lib/utils'
import * as DeletionOptions from '@/lib/deletion/options'
import * as DeletionRequest from '@/lib/deletion/request'
import * as ObjectVersions from '@/lib/objectVersions'
import * as StateBadge from '@/lib/stateBadge'
import { s3ErrorMessage } from '@/composables/s3/errors'
import { prefixDeleteFailure, useSelectionDelete } from './deletion/useSelectionDelete'
import {
  button,
  click,
  compileClientComponent,
  content,
  element,
  flush,
  mountApp,
  moduleDefault,
  nodes,
  typeValue,
  type HostNode,
} from '@/test/clientRender'
import { deletionImpact, referencedContent } from '@/test/deletionImpact'
import type { BacklinkPreflightResponse } from '@/lib/backlinks'

// The real selection helper drives one dialog below, so the module it asks for
// its S3 calls is replaced with the same double that dialog is compiled with.
const selectionS3 = vi.hoisted(() => ({
  deleteObject: vi.fn(async (_bucket: string, _key: string, _nodeId: string | null) => undefined),
  deletePrefix: vi.fn(async (_bucket: string, _prefix: string, _nodeId: string | null) => ({
    deleted: 3,
    errors: [] as { key: string; message: string }[],
  })),
  canWrite: () => true,
  canDeletePrefix: () => true,
}))
vi.mock('@/composables/useS3', async () => {
  const errors = await import('@/composables/s3/errors')
  return { ...errors, useS3: () => selectionS3 }
})

const listObjectVersions = vi.fn()
const deleteObject = vi.fn(async () => undefined)
const deletePrefix = vi.fn(async () => ({ deleted: 1, errors: [] as { key: string; message: string }[] }))
const deleteObjectVersion = vi.fn(async () => undefined)
const copyObjectVersion = vi.fn(async () => ({ versionId: 'new' }))
const deleteBucket = vi.fn(async () => undefined)
const purgeStatus = ref<unknown>(null)
const purgePaused = ref(false)
const purgeControl = vi.fn(async (..._args: unknown[]) => undefined)
const purgeRun = vi.fn(async () => ({ state: 'succeeded' }))
const removeBucket = vi.fn(async (_nodeId: string, _bucket: string, _job: unknown) => undefined)
const preflightResponse = vi.fn()
const getDeleteImpact = vi.fn(async (..._args: unknown[]): Promise<unknown> => {
  throw Object.assign(new Error('not found'), { status: 404 })
})
const backlinkPreflight = ref<BacklinkPreflightResponse | null>(null)
const sessionEpoch = ref(1)
const offline = ref(false)

function slotted(tag: string) {
  return defineComponent({
    inheritAttrs: false,
    setup: (_, { attrs, slots }) => () => h(tag, attrs, slots.default?.()),
  })
}

const pagedStub = defineComponent({
  props: { total: Number, shown: Number, hasNext: Boolean, summary: String, filterable: { type: Boolean, default: true } },
  emits: ['filter'],
  setup: (props, { slots, emit }) => () =>
    h('div', [
      h('ul', slots.default?.()),
      h('span', props.summary ?? `shown ${props.shown} of ${props.total}`),
      props.filterable ? h('button', { onClick: () => emit('filter', 'x') }, 'filter x') : null,
    ]),
})

const jobProgress = defineComponent({
  props: { job: Object, busy: Boolean },
  emits: ['control'],
  setup: (props, { emit }) => () =>
    h('button', { 'data-busy': props.busy, onClick: () => emit('control', 'abort') }, `job ${(props.job as { state: string }).state} ${(props.job as { done: number }).done} of ${(props.job as { total: number }).total}`),
})

const ButtonStub = defineComponent({
  inheritAttrs: false,
  props: { variant: String, disabled: Boolean },
  setup: (props, { attrs, slots }) => () =>
    h('button', { ...attrs, disabled: props.disabled }, slots.default?.()),
})
const InputStub = defineComponent({
  props: { modelValue: String, class: String, placeholder: String, id: String, autocomplete: String },
  emits: ['update:modelValue'],
  setup: (props, { emit }) => () =>
    h('input', {
      id: props.id,
      value: props.modelValue,
      onInput: (event: { target: { value: string } }) => emit('update:modelValue', event.target.value),
    }),
})
const DialogStub = defineComponent({
  props: { open: Boolean },
  setup: (props, { slots }) => () => (props.open ? h('div', slots.default?.()) : null),
})
const PanelStub = (name: string) => defineComponent(() => () => h('section', name))
// The impact panel renders the quota sentence the dialog computes for it.
const ImpactStub = defineComponent({
  props: { quotaNote: String },
  setup: (props) => () => h('section', props.quotaNote ?? 'impact'),
})

const RefusalStub = defineComponent({
  props: { message: String, tone: String },
  setup: (props) => () => h('aside', props.message),
})
const versionPicker = compileClientComponent(
  new URL('./deletion/VersionPicker.vue', import.meta.url),
  {
    vue: VueRuntime,
    '@/lib/utils': Utils,
    '@/lib/objectVersions': ObjectVersions,
    '@/lib/stateBadge': StateBadge,
    '@/components/ui/Badge.vue': moduleDefault(slotted('span')),
    '@/components/ui/ErrorPanel.vue': moduleDefault(RefusalStub),
    '@/components/ui/Spinner.vue': moduleDefault(slotted('i')),
    '@/composables/useS3': {
      s3ErrorMessage,
      useS3: () => ({ listObjectVersions }),
    },
  },
)

function dialogModules(overrides: Record<string, unknown> = {}) {
  return {
  vue: VueRuntime,
  '@/lib/utils': Utils,
  '@/lib/deletion/options': DeletionOptions,
  '@/lib/deletion/request': DeletionRequest,
  '@/lib/objectVersions': ObjectVersions,
  '@/lib/api': { getDeleteImpact },
  '@/lib/organize': Organize,
  '@/components/data/deletion/PermanentDeleteImpact.vue': moduleDefault(
    compileClientComponent(new URL('./deletion/PermanentDeleteImpact.vue', import.meta.url), {
      vue: VueRuntime,
      '@/components/storage/PagedList.vue': moduleDefault(pagedStub),
      '@/components/ui/Button.vue': moduleDefault(ButtonStub),
      '@/composables/useCursorPage': CursorPage,
      '@/lib/api': { PAGE_SIZE: 100, getDeleteImpact },
      '@/lib/organize': Organize,
      '@/lib/utils': Utils,
    }),
  ),
  '@/lib/storageDeletion': {
    createStoragePurgeOperation: (scope: unknown, _key?: string, storage?: object) => ({ scope, idempotencyKey: 'key', ...storage }),
    isTerminalStoragePurgeJob: (state: string) => ['succeeded', 'failed', 'cancelled'].includes(state),
    getStorageDeletionPreflight: preflightResponse,
    isStorageDeletionNotFound: () => false,
    storageDeletionErrorMessage: (error: unknown) => String(error),
  },
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Dialog.vue': moduleDefault(DialogStub),
  '@/components/ui/DialogContent.vue': moduleDefault(slotted('div')),
  '@/components/ui/DialogDescription.vue': moduleDefault(slotted('p')),
  '@/components/ui/DialogFooter.vue': moduleDefault(slotted('footer')),
  '@/components/ui/DialogHeader.vue': moduleDefault(slotted('header')),
  '@/components/ui/DialogTitle.vue': moduleDefault(slotted('h2')),
  '@/components/ui/Input.vue': moduleDefault(InputStub),
  '@/components/ui/RefusalNote.vue': moduleDefault(RefusalStub),
  '@/components/data/deletion/VersionPicker.vue': moduleDefault(versionPicker),
  '@/components/data/deletion/DeletionImpact.vue': moduleDefault(ImpactStub),
  '@/components/data/deletion/DeletionOutcome.vue': moduleDefault(PanelStub('outcome')),
  '@/components/data/deletion/PurgeProgress.vue': moduleDefault(PanelStub('progress')),
  '@/components/storage/JobProgress.vue': moduleDefault(jobProgress),
  '@/components/data/deletion/useDeletionPreflight': {
    useDeletionPreflight: () => ({
      backlinkPreflight,
      backlinkPreflightBusy: ref(false),
      backlinkPreflightError: ref(null),
      permanentDeleteApiBase: () => 'https://api.test',
      resetBacklinkPreflightState: () => {},
      loadBacklinkPreflight: async () => {},
      loadBulkBacklinkPreflight: async () => {},
    }),
  },
  '@/components/data/deletion/usePurgeJob': {
    usePurgeJob: () => ({
      submission: ref(null),
      status: purgeStatus,
      progress: ref({ current: 3, total: 10, unit: 'versions' }),
      paused: purgePaused,
      reset: () => {},
      run: purgeRun,
      control: purgeControl,
    }),
  },
  '@/components/data/deletion/useSelectionDelete': {
    prefixDeleteFailure,
    useSelectionDelete: () => ({
      outcome: ref(null),
      scopes: ref([]),
      scopesBusy: ref(false),
      inventory: computed(() => ({
        current_heads: 0,
        noncurrent_versions: 0,
        delete_markers: 0,
        open_multipart_uploads: 0,
        complete: true,
      })),
      scopeErrors: computed(() => []),
      deniedKeys: computed(() => []),
      purgeReady: () => true,
      pendingKeys: (keys: string[]) => keys,
      reset: () => {},
      loadScopes: async () => {},
      deleteMarkers: async () => {},
      purgeKeys: async () => {},
      paused: ref(false),
      pollError: ref(null),
      controlError: ref(null),
      starting: ref(false),
      controlAll: async () => {},
    }),
  },
  '@/components/groups/bucketRemoval': { removeBucket },
  '@/composables/s3/endpoints': { nodeApiBase: (id: string) => `https://${id}.test/api/v1` },
  '@/composables/useAruna': {
    isUnsupportedEndpoint: (err: { status?: number }) => err?.status === 404,
    useAruna: () => ({ authToken: ref('token'), sessionEpoch }),
  },
  '@/lib/connectivity': { OFFLINE_WRITE_HINT: 'offline', useConnectivity: () => ({ writesDisabled: offline }) },
  '@/composables/useRealmNodes': {
    useRealmNodes: () => ({ displayName: (id: string) => `node ${id}` }),
  },
  '@/composables/useStagingReferences': {
    useStagingReferences: () => ({ entries: ref([]), status: ref('loaded'), error: ref(null) }),
  },
  '@/composables/useS3': {
    s3ErrorMessage,
    useS3: () => ({
      canWrite: () => true,
      canDeletePrefix: () => true,
      listObjectVersions,
      deleteObject,
      deletePrefix,
      deleteObjectVersion,
      copyObjectVersion,
      deleteBucket,
    }),
  },
  ...overrides,
  }
}

const dialog = compileClientComponent(
  new URL('./DeleteDialog.vue', import.meta.url),
  dialogModules(),
)

// The same dialog driven by the real selection helper, so a selection runs the
// object and folder calls it would run in the app.
const selectionDialog = compileClientComponent(
  new URL('./DeleteDialog.vue', import.meta.url),
  dialogModules({
    '@/components/data/deletion/useSelectionDelete': { prefixDeleteFailure, useSelectionDelete },
    '@/components/data/deletion/DeletionOutcome.vue': moduleDefault(
      compileClientComponent(new URL('./deletion/DeletionOutcome.vue', import.meta.url), {
        vue: VueRuntime,
      }),
    ),
    '@/composables/useS3': { s3ErrorMessage, useS3: () => selectionS3 },
  }),
)

// A second build with the real impact panel, for what its lists show.
const impactDialog = compileClientComponent(
  new URL('./DeleteDialog.vue', import.meta.url),
  dialogModules({
    '@/components/data/deletion/DeletionImpact.vue': moduleDefault(deletionImpact()),
  }),
)

const IMPACT = {
  files: 1,
  versions: 1,
  bytes: 1,
  storage_files: 1,
  storage_bytes: 1,
  kept_files: 0,
  complete: true,
  items: [],
}

const currentVersion = {
  key: 'a.txt',
  versionId: '01CURRENT000',
  isLatest: true,
  deleteMarker: false,
  size: 2048,
  lastModified: new Date('2026-02-01T00:00:00Z'),
}
const olderVersion = {
  key: 'a.txt',
  versionId: '01OLDER00000',
  isLatest: false,
  deleteMarker: false,
  size: 1024,
  lastModified: new Date('2026-01-01T00:00:00Z'),
}

async function open(
  request: DeletionRequest.DeleteRequest,
  component: typeof dialog = dialog,
) {
  listObjectVersions.mockResolvedValue({
    versions: [currentVersion, olderVersion],
    truncated: false,
  })
  preflightResponse.mockResolvedValue({
    scope: { kind: 'bucket', bucket: request.bucket },
    counts: {
      current_heads: 1,
      noncurrent_versions: 0,
      delete_markers: 0,
      open_multipart_uploads: 0,
      complete: true,
    },
    sync_relationships_apply_to_bucket_delete: false,
    sync_relationships: [],
    permissions: { read: true, purge: true },
    truncation: { truncated: false, versions_truncated: false, multipart_uploads_truncated: false },
    reference_coverage: {
      complete: true,
      hidden_references_exist: false,
      queried_nodes: 1,
      failed_nodes: 0,
      index_freshness: 'current',
      excluded: [],
    },
  })
  const completed: unknown[] = []
  const closes: number[] = []
  const host = defineComponent({
    setup: () => () =>
      h(component, {
        request,
        onCompleted: (result: unknown) => completed.push(result),
        onClose: () => closes.push(1),
      }),
  })
  const { root } = await mountApp(host)
  await flush()
  return { root, completed, closes }
}

// The outcome radios carry their option id as the value.
async function choose(root: HostNode, id: string) {
  const radio = element(root, (node) => node.tag === 'input' && node.props.value === id)
  const handler = radio.props.onChange
  if (typeof handler === 'function') await handler({ target: radio })
  await flush()
}

// The confirm button is the last one in the footer, after any button in the body.
function confirmButton(root: HostNode): HostNode {
  const found = nodes(root).filter((node) => node.tag === 'button' && content(node).trim() !== 'Cancel')
  return found[found.length - 1]
}

function labels(root: HostNode): string[] {
  return nodes(root)
    .filter((node) => node.tag === 'input' && node.props.type === 'radio')
    .map((node) => String(node.props.value))
}

describe('delete dialog', () => {
  it('names the target and the node it acts on', async () => {
    const { root } = await open({ kind: 'object', bucket: 'reef', nodeId: null, key: 'raw/a.txt' })

    expect(content(root)).toContain('Delete object')
    expect(content(root)).toContain('reef/raw/a.txt')
    expect(content(root)).toContain('this node')
  })

  it('offers only the applicable outcome per kind', async () => {
    const object = await open({ kind: 'object', bucket: 'reef', nodeId: null, key: 'a.txt' })
    expect(labels(object.root)).toEqual(['delete', 'delete-version', 'delete-permanently'])

    const deleted = await open({
      kind: 'deleted-object',
      bucket: 'reef',
      nodeId: null,
      key: 'a.txt',
      headState: 'marker',
    })
    expect(labels(deleted.root)).toEqual(['restore', 'delete-permanently'])

    const older = await open({
      kind: 'version',
      bucket: 'reef',
      nodeId: null,
      key: 'a.txt',
      versionId: 'v1',
      isCurrent: false,
    })
    expect(labels(older.root)).toEqual(['make-current', 'delete-version'])
    expect(content(older.root)).toContain('Make this version current')
  })

  it('writes a delete marker for a live object', async () => {
    deleteObject.mockClear()
    const { root, completed } = await open({
      kind: 'object',
      bucket: 'reef',
      nodeId: null,
      key: 'a.txt',
      bytes: 1024,
    })
    expect(content(root)).toContain('keeps using 1 KB of your quota')

    await click(confirmButton(root))

    expect(deleteObject).toHaveBeenCalledWith('reef', 'a.txt', null)
    expect(completed).toHaveLength(1)
  })

  it('deletes exactly the named version', async () => {
    deleteObjectVersion.mockClear()
    const { root } = await open({
      kind: 'version',
      bucket: 'reef',
      nodeId: null,
      key: 'a.txt',
      versionId: 'v9',
      isCurrent: true,
    })

    await click(confirmButton(root))

    expect(deleteObjectVersion).toHaveBeenCalledWith('reef', 'a.txt', 'v9', null)
  })

  it('closes once the delete marker is written', async () => {
    deleteObject.mockClear()
    const { root, closes } = await open({ kind: 'object', bucket: 'reef', nodeId: null, key: 'a.txt' })

    await click(confirmButton(root))

    expect(deleteObject).toHaveBeenCalledTimes(1)
    expect(closes).toHaveLength(1)
  })

  it('stays open with the reason when the node fails', async () => {
    deleteObject.mockClear()
    deleteObject.mockRejectedValueOnce({
      name: 'InternalError',
      message: 'UsageCounter underflow',
      $metadata: { httpStatusCode: 500 },
    })
    const { root, closes } = await open({ kind: 'object', bucket: 'reef', nodeId: null, key: 'a.txt' })

    await click(confirmButton(root))

    expect(closes).toHaveLength(0)
    expect(content(root)).toContain('The node hit an internal error')
    expect(content(root)).toContain('UsageCounter underflow')
    expect(content(root)).toContain('Try again')
  })

  it('deletes the version picked for a whole file', async () => {
    deleteObjectVersion.mockClear()
    const { root } = await open({ kind: 'object', bucket: 'reef', nodeId: null, key: 'a.txt' })

    await choose(root, 'delete-version')
    // The current version is the default, and it says what removing it does.
    expect(content(root)).toContain('makes the previous version current')
    const older = element(
      root,
      (node) => node.tag === 'input' && node.props.value === '01OLDER00000',
    )
    await (older.props.onChange as (event: unknown) => void)({ target: older })
    await flush()
    await click(confirmButton(root))

    expect(deleteObjectVersion).toHaveBeenCalledWith('reef', 'a.txt', '01OLDER00000', null)
  })

  it('offers the restore instead of a second marker for a deleted key', async () => {
    deleteObjectVersion.mockClear()
    const { root } = await open({
      kind: 'object',
      bucket: 'reef',
      nodeId: null,
      key: 'a.txt',
      headState: 'marker',
      versionId: '01MARKER0000',
      option: 'restore',
    })

    expect(labels(root)).toEqual(['restore', 'delete-permanently'])

    await click(confirmButton(root))

    expect(deleteObjectVersion).toHaveBeenCalledWith('reef', 'a.txt', '01MARKER0000', null)
  })

  it('routes deleting everything through the purge job', async () => {
    purgeRun.mockClear()
    const { root } = await open({ kind: 'object', bucket: 'reef', nodeId: null, key: 'a.txt' })

    await choose(root, 'delete-permanently')
    expect(confirmButton(root).props.disabled).toBe(true)
    await typeValue(element(root, (node) => node.tag === 'input' && node.props.type !== 'radio'), 'a.txt')
    await click(confirmButton(root))

    expect(purgeRun).toHaveBeenCalledTimes(1)
  })

  it('holds a folder purge until the exact name is typed', async () => {
    const { root } = await open({
      kind: 'folder',
      bucket: 'reef',
      nodeId: null,
      key: 'raw/',
      option: 'delete-permanently',
    })

    expect(content(root)).toContain('to confirm')
    expect(confirmButton(root).props.disabled).toBe(true)

    const field = element(root, (node) => node.tag === 'input' && node.props.type !== 'radio')
    await typeValue(field, 'wrong')
    expect(confirmButton(root).props.disabled).toBe(true)

    await typeValue(field, 'raw')
    expect(confirmButton(root).props.disabled).toBe(false)
  })

  it('shows what goes in Aruna and in storage before a permanent folder delete', async () => {
    getDeleteImpact.mockResolvedValueOnce({
      files: 4210,
      versions: 4388,
      bytes: 1,
      complete: true,
      items: [],
      storage_files: 4206,
      storage_bytes: 310e9,
      kept_files: 4,
    })
    const { root } = await open({
      kind: 'folder',
      bucket: 'reef',
      nodeId: null,
      key: 'old-runs/',
      option: 'delete-permanently',
    })

    const text = content(root)
    expect(text).toContain('4,210 files with all 4,388 versions')
    expect(text).toContain('Your storage holds 4,206 files (288.7 GB)')
    expect(text).toContain('4 files in your storage stay because other links or files still use them.')
    expect(text).toContain('This cannot be undone.')
    expect(getDeleteImpact).toHaveBeenCalledWith(
      { kind: 'folder', bucket: 'reef', key: 'old-runs/' },
      expect.anything(),
    )
    // The typed name still guards the red button.
    expect(confirmButton(root).props.disabled).toBe(true)
    await typeValue(element(root, (node) => node.tag === 'input' && node.props.type !== 'radio'), 'old-runs')
    expect(confirmButton(root).props.disabled).toBe(false)
  })

  it('lists what goes page by page', async () => {
    getDeleteImpact.mockResolvedValueOnce({
      files: 1,
      versions: 2,
      bytes: 30,
      storage_files: 1,
      storage_bytes: 30,
      kept_files: 1,
      complete: true,
      items: [],
    })
    getDeleteImpact.mockResolvedValueOnce({
      files: 1,
      versions: 2,
      bytes: 30,
      storage_files: 1,
      storage_bytes: 30,
      kept_files: 1,
      complete: true,
      next: 'c1',
      items: [
        { key: 'a/x.txt', version_id: 'v1', bytes: 10, storage_file: { path: 'lab/x.txt', bytes: 10, kept: true } },
        { key: 'a/y.txt', version_id: 'v2', bytes: 20, storage_file: { path: 'lab/y.txt', bytes: 20 } },
      ],
    })
    const { root } = await open({ kind: 'folder', bucket: 'reef', nodeId: null, key: 'a/', option: 'delete-permanently' })
    expect(content(root)).not.toContain('a/x.txt')
    await click(button(root, 'Show files'))
    expect(getDeleteImpact).toHaveBeenLastCalledWith(
      { kind: 'folder', bucket: 'reef', key: 'a/' },
      expect.anything(),
      { filter: '', limit: 100, after: null },
    )
    const text = content(root)
    expect(text).toContain('a/x.txt')
    expect(text).toContain('stays in your storage: lab/x.txt')
    expect(text).toContain('deleted in your storage: lab/y.txt')
    expect(text).toContain('shown 2 of 2')
  })

  it('filters the delete list and drops the filter on a node that rejects it', async () => {
    const page = { ...IMPACT, items: [{ key: 'a/x.txt', version_id: 'v1', bytes: 1 }] }
    getDeleteImpact.mockResolvedValueOnce(IMPACT).mockResolvedValueOnce(page)
    const { root } = await open({ kind: 'folder', bucket: 'reef', nodeId: null, key: 'a/', option: 'delete-permanently' })
    await click(button(root, 'Show files'))
    getDeleteImpact.mockResolvedValueOnce(page)
    await click(button(root, 'filter x'))
    expect(getDeleteImpact).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), { filter: 'x', limit: 100, after: null })
    // The whole-scope totals are not the count of the filtered page.
    expect(content(root)).toContain('1 on this page match "x"')
    expect(content(root)).not.toContain('shown 1 of')

    getDeleteImpact.mockRejectedValueOnce(Object.assign(new Error('bad field'), { status: 400 })).mockResolvedValueOnce(page)
    await click(button(root, 'filter x'))
    expect(getDeleteImpact).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), { filter: '', limit: 100, after: null })
    expect(() => button(root, 'filter x')).toThrow()
    expect(content(root)).toContain('a/x.txt')
    // The retry was not filtered, so the page must not claim to be.
    expect(content(root)).not.toContain('on this page match')
  })

  it('keeps the filter and shows the error when the fallback fails too', async () => {
    const page = { ...IMPACT, items: [{ key: 'a/x.txt', version_id: 'v1', bytes: 1 }] }
    getDeleteImpact.mockResolvedValueOnce(IMPACT).mockResolvedValueOnce(page)
    const { root } = await open({ kind: 'folder', bucket: 'reef', nodeId: null, key: 'a/', option: 'delete-permanently' })
    await click(button(root, 'Show files'))
    getDeleteImpact
      .mockRejectedValueOnce(Object.assign(new Error('gone'), { status: 404 }))
      .mockRejectedValueOnce(Object.assign(new Error('bucket gone'), { status: 404 }))
    await click(button(root, 'filter x'))
    expect(content(root)).toContain('bucket gone')
    expect(button(root, 'filter x')).toBeTruthy()
  })

  it('words kept storage files carefully while the page is not complete', async () => {
    getDeleteImpact.mockResolvedValueOnce({
      files: 10,
      versions: 10,
      bytes: 1,
      storage_files: 10,
      storage_bytes: 1,
      kept_files: 2,
      complete: false,
      items: [],
    })
    const { root } = await open({ kind: 'folder', bucket: 'reef', nodeId: null, key: 'a/', option: 'delete-permanently' })
    const text = content(root)
    expect(text).toContain('at least 10 files')
    expect(text).toContain('Your storage holds at least 10 files')
    expect(text).toContain('Some storage files stay because other links or files still use them.')
  })

  it('also deletes the storage files and names the bucket on a permanent delete', async () => {
    purgeRun.mockClear()
    getDeleteImpact.mockResolvedValueOnce(IMPACT)
    const { root } = await open({ kind: 'bucket', bucket: 'reef', nodeId: null, option: 'delete-permanently' })
    await typeValue(element(root, (node) => node.tag === 'input' && node.props.type !== 'radio'), 'reef')
    await click(confirmButton(root))
    expect(purgeRun).toHaveBeenCalledWith(
      expect.objectContaining({ scope: { kind: 'bucket', bucket: 'reef' }, deleteStorageFiles: true, confirm: 'reef' }),
      expect.anything(),
    )
  })

  it('shows a delete the node says is paused, even while its state is running', async () => {
    purgeStatus.value = { state: 'running', paused: true }
    purgePaused.value = true
    try {
      const { root } = await open({ kind: 'folder', bucket: 'reef', nodeId: null, key: 'a/', option: 'delete-permanently' })
      expect(content(root)).toContain('job paused')
    } finally {
      purgePaused.value = false
      purgeStatus.value = null
    }
  })

  it('shows a running delete with pause and abort', async () => {
    purgeStatus.value = { state: 'running' }
    purgePaused.value = true
    try {
      const { root } = await open({ kind: 'folder', bucket: 'reef', nodeId: null, key: 'a/', option: 'delete-permanently' })
      expect(content(root)).toContain('job paused 3 of 10')
      await click(button(root, 'job paused'))
      expect(purgeControl).toHaveBeenCalledWith('abort', expect.anything())
    } finally {
      purgePaused.value = false
      purgeStatus.value = null
    }
  })

  it('marks the job controls busy while a control is on its way and sends one at a time', async () => {
    let refuse: (err: unknown) => void = () => {}
    purgeControl.mockReturnValueOnce(new Promise<undefined>((_, reject) => (refuse = reject)))
    const sent = purgeControl.mock.calls.length
    purgeStatus.value = { state: 'running' }
    try {
      const { root } = await open({ kind: 'folder', bucket: 'reef', nodeId: null, key: 'a/', option: 'delete-permanently' })
      expect(button(root, 'job running').props['data-busy']).toBe(false)
      void (button(root, 'job running').props.onClick as () => void)()
      await flush()
      expect(button(root, 'job running').props['data-busy']).toBe(true)
      ;(button(root, 'job running').props.onClick as () => void)()
      expect(purgeControl.mock.calls.length).toBe(sent + 1)
      refuse(new Error('the node did not answer'))
      await flush()
      expect(button(root, 'job running').props['data-busy']).toBe(false)
      expect(content(root)).toContain('the node did not answer')
    } finally {
      purgeStatus.value = null
    }
  })

  it('waits for the storage check and blocks while it is pending', async () => {
    let answer: (value: unknown) => void = () => {}
    getDeleteImpact.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)))
    const { root } = await open({ kind: 'folder', bucket: 'reef', nodeId: null, key: 'raw/', option: 'delete-permanently' })
    await typeValue(element(root, (node) => node.tag === 'input' && node.props.type !== 'radio'), 'raw')
    expect(content(root)).toContain('Checking what is deleted in your storage…')
    expect(confirmButton(root).props.disabled).toBe(true)
    answer(IMPACT)
    await flush()
    expect(confirmButton(root).props.disabled).toBe(false)
  })

  it('says a failed storage check failed and blocks the delete', async () => {
    getDeleteImpact.mockRejectedValueOnce(Object.assign(new Error('boom'), { status: 500 }))
    const { root } = await open({ kind: 'folder', bucket: 'reef', nodeId: null, key: 'raw/', option: 'delete-permanently' })
    await typeValue(element(root, (node) => node.tag === 'input' && node.props.type !== 'radio'), 'raw')
    expect(content(root)).toContain('Could not check what is deleted in your storage. Nothing is deleted yet.')
    expect(confirmButton(root).props.disabled).toBe(true)
    getDeleteImpact.mockResolvedValueOnce(IMPACT)
    await click(button(root, 'Try again'))
    expect(content(root)).toContain('This cannot be undone.')
    expect(confirmButton(root).props.disabled).toBe(false)
  })

  it('drops the storage warning when another outcome is chosen and ignores its late answer', async () => {
    let answer: (value: unknown) => void = () => {}
    getDeleteImpact.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)))
    const { root } = await open({ kind: 'folder', bucket: 'reef', nodeId: null, key: 'raw/' })
    await choose(root, 'delete-permanently')
    await choose(root, 'delete')
    answer(IMPACT)
    await flush()
    expect(content(root)).not.toContain('This cannot be undone.')
    expect(content(root)).not.toContain('Checking what is deleted')
  })

  it('does not delete or control a delete while offline', async () => {
    getDeleteImpact.mockResolvedValueOnce(IMPACT)
    offline.value = true
    try {
      const { root } = await open({ kind: 'folder', bucket: 'reef', nodeId: null, key: 'raw/', option: 'delete-permanently' })
      await typeValue(element(root, (node) => node.tag === 'input' && node.props.type !== 'radio'), 'raw')
      expect(confirmButton(root).props.disabled).toBe(true)
    } finally {
      offline.value = false
    }
  })

  it('sends the storage flag to a remote bucket when the node can size it', async () => {
    getDeleteImpact.mockResolvedValueOnce(IMPACT)
    removeBucket.mockClear()
    const { root } = await open({ kind: 'bucket', bucket: 'reef', nodeId: 'node-far', option: 'delete-permanently' })
    await typeValue(element(root, (node) => node.tag === 'input' && node.props.type !== 'radio'), 'reef')
    await click(confirmButton(root))
    expect(removeBucket).toHaveBeenCalledWith('node-far', 'reef', expect.anything(), true)
  })

  it('does not say nothing is in storage while the check is incomplete', async () => {
    getDeleteImpact.mockResolvedValueOnce({ ...IMPACT, storage_files: 0, storage_bytes: 0, complete: false })
    const { root } = await open({ kind: 'folder', bucket: 'reef', nodeId: null, key: 'a/', option: 'delete-permanently' })
    expect(content(root)).toContain('The check is not complete.')
    expect(content(root)).not.toContain('No files in your storage belong to them.')
  })

  it('leaves the box out when the node cannot size the delete', async () => {
    const { root } = await open({
      kind: 'folder',
      bucket: 'reef',
      nodeId: null,
      key: 'raw/',
      option: 'delete-permanently',
    })

    expect(content(root)).not.toContain('This cannot be undone.')
    expect(confirmButton(root).props.disabled).toBe(true)
  })

  it('keeps a marker delete one click away', async () => {
    const { root } = await open({ kind: 'folder', bucket: 'reef', nodeId: null, key: 'raw/' })

    // The default outcome for a folder is the recoverable one, so no typing.
    expect(content(root)).not.toContain('to confirm')
    expect(confirmButton(root).props.disabled).toBe(false)
  })

  it('confirms a bucket delete that many datasets reference', async () => {
    purgeRun.mockClear()
    backlinkPreflight.value = referencedContent(40)
    const { root, completed } = await open(
      { kind: 'bucket', bucket: 'reef', nodeId: null },
      impactDialog,
    )

    const text = content(root)
    expect(text).toContain('40 dataset references')
    expect(text).toContain('Index current on 1 of 1 node')
    expect(text).not.toContain('Reef survey 01')

    const field = element(root, (node) => node.props.id === 'deletion-typed-name')
    await typeValue(field, 'reef')
    await click(button(root, 'Delete permanently'))

    expect(purgeRun).toHaveBeenCalledTimes(1)
    expect(completed).toHaveLength(1)
    backlinkPreflight.value = null
  })
})

describe('delete dialog for a bucket on another node', () => {
  const request = { kind: 'bucket' as const, bucket: 'reef', nodeId: 'node-far' }

  it('checks and purges the bucket on its own node', async () => {
    removeBucket.mockClear()
    purgeRun.mockClear()
    const { root, completed } = await open(request)

    expect(preflightResponse).toHaveBeenLastCalledWith(
      { kind: 'bucket', bucket: 'reef' },
      { baseUrl: 'https://node-far.test/api/v1', token: 'token' },
    )
    expect(content(root)).not.toContain('Open the bucket on that node')
    const field = element(root, (node) => node.props.id === 'deletion-typed-name')
    await typeValue(field, 'reef')
    await click(button(root, 'Delete permanently'))

    expect(removeBucket).toHaveBeenCalledWith('node-far', 'reef', expect.anything(), false)
    expect(purgeRun).not.toHaveBeenCalled()
    expect(completed).toEqual([expect.objectContaining({ committed: ['reef'] })])
  })

  it('shows the error when the node refuses', async () => {
    removeBucket.mockRejectedValueOnce(new Error('You may not delete this bucket.'))
    const { root, completed } = await open(request)

    const field = element(root, (node) => node.props.id === 'deletion-typed-name')
    await typeValue(field, 'reef')
    await click(button(root, 'Delete permanently'))

    expect(content(root)).toContain('You may not delete this bucket.')
    expect(completed).toEqual([expect.objectContaining({ committed: [] })])
  })

  it('offers only the full purge for an empty bucket and names the node', async () => {
    // The first mount installs the default answer; the second sees it empty.
    await open(request)
    const empty = { current_heads: 0, noncurrent_versions: 0, delete_markers: 0, open_multipart_uploads: 0, complete: true }
    preflightResponse.mockResolvedValueOnce({ ...(await preflightResponse()), counts: empty })
    const { root } = await open(request)

    expect(labels(root)).toEqual(['delete-permanently'])
    expect(content(root)).toContain('this bucket on node node-far')
  })

  it('drops a running delete when the session changes', async () => {
    let finish = () => {}
    removeBucket.mockImplementationOnce(() => new Promise<undefined>((resolve) => (finish = () => resolve(undefined))))
    const { root, completed, closes } = await open(request)

    const field = element(root, (node) => node.props.id === 'deletion-typed-name')
    await typeValue(field, 'reef')
    void click(button(root, 'Delete permanently'))
    await flush()
    expect(removeBucket).toHaveBeenCalled()
    sessionEpoch.value++
    await flush()
    const checks = preflightResponse.mock.calls.length
    finish()
    await flush()

    expect(closes).toHaveLength(1)
    expect(completed).toHaveLength(0)
    // The old client asks nothing more once the dialog was reset.
    expect(preflightResponse.mock.calls.length).toBe(checks)
  })
})

describe('delete dialog selection with folders', () => {
  const request = {
    kind: 'selection' as const,
    bucket: 'reef',
    nodeId: null,
    keys: ['a.txt'],
    prefixes: ['raw/', 'cooked/'],
  }

  it('names the files and the folders it will delete', async () => {
    const { root } = await open(request, selectionDialog)

    expect(content(root)).toContain('Delete 1 file and 2 folders')
    expect(content(root)).toContain('raw/')
    expect(content(root)).toContain('cooked/')
  })

  it('does not start the folders after the session changed during the files', async () => {
    selectionS3.deleteObject.mockClear()
    selectionS3.deletePrefix.mockClear()
    let finish: (value: undefined) => void = () => {}
    selectionS3.deleteObject.mockReturnValueOnce(new Promise<undefined>((resolve) => (finish = resolve)))
    const { root } = await open(request, selectionDialog)
    const pending = click(confirmButton(root))
    await flush()
    sessionEpoch.value++
    await flush()
    finish(undefined)
    await pending
    expect(selectionS3.deletePrefix).not.toHaveBeenCalled()
  })

  it('deletes every selected folder through the prefix walk', async () => {
    selectionS3.deleteObject.mockClear()
    selectionS3.deletePrefix.mockClear()
    const { root, completed } = await open(request, selectionDialog)

    await click(confirmButton(root))

    expect(selectionS3.deleteObject).toHaveBeenCalledWith('reef', 'a.txt', null)
    expect(selectionS3.deletePrefix.mock.calls).toEqual([
      ['reef', 'raw/', null],
      ['reef', 'cooked/', null],
    ])
    expect(content(root)).toContain('Committed: 3. Failed: 0. Unknown: 0.')
    expect(completed).toHaveLength(1)
  })

  it('keeps a failing folder in the outcome and the dialog open', async () => {
    selectionS3.deletePrefix.mockClear()
    selectionS3.deletePrefix.mockResolvedValueOnce({
      deleted: 1,
      errors: [{ key: 'raw/locked.bam', message: 'AccessDenied' }],
    })
    const { root, closes } = await open(request, selectionDialog)

    await click(confirmButton(root))

    expect(closes).toHaveLength(0)
    expect(content(root)).toContain('Committed: 2. Failed: 1. Unknown: 0.')
    expect(content(root)).toContain('raw/locked.bam: AccessDenied')
    expect(content(button(root, 'Try again')).trim()).toBe('Try again')
  })

  it('retries only what is still unresolved', async () => {
    selectionS3.deleteObject.mockClear()
    selectionS3.deletePrefix.mockClear()
    selectionS3.deletePrefix.mockResolvedValueOnce({
      deleted: 0,
      errors: [{ key: 'raw/locked.bam', message: 'AccessDenied' }],
    })
    const { root } = await open(request, selectionDialog)

    await click(confirmButton(root))
    await click(button(root, 'Try again'))

    expect(selectionS3.deleteObject).toHaveBeenCalledTimes(1)
    expect(selectionS3.deletePrefix.mock.calls).toEqual([
      ['reef', 'raw/', null],
      ['reef', 'cooked/', null],
      ['reef', 'raw/', null],
    ])
    expect(content(root)).toContain('Committed: 3. Failed: 0. Unknown: 0.')
  })
})
