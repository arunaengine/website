import { computed, defineComponent, h, ref, type Component } from 'vue'
import * as VueRuntime from 'vue'
import { describe, expect, it, vi } from 'vitest'
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
const purgeRun = vi.fn(async () => ({ state: 'succeeded' }))
const preflightResponse = vi.fn()
const backlinkPreflight = ref<BacklinkPreflightResponse | null>(null)

function slotted(tag: string) {
  return defineComponent({
    inheritAttrs: false,
    setup: (_, { attrs, slots }) => () => h(tag, attrs, slots.default?.()),
  })
}

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
  '@/lib/storageDeletion': {
    createStoragePurgeOperation: (scope: unknown) => ({ scope, idempotencyKey: 'key' }),
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
      status: ref(null),
      progress: ref(null),
      reset: () => {},
      run: purgeRun,
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
    }),
  },
  '@/composables/useAruna': { useAruna: () => ({ authToken: ref('token') }) },
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

function confirmButton(root: HostNode): HostNode {
  return element(root, (node) => node.tag === 'button' && content(node).trim() !== 'Cancel')
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
    expect(text).not.toContain('Reef survey 01')

    const field = element(root, (node) => node.props.id === 'deletion-typed-name')
    await typeValue(field, 'reef')
    await click(button(root, 'Delete permanently'))

    expect(purgeRun).toHaveBeenCalledTimes(1)
    expect(completed).toHaveLength(1)
    backlinkPreflight.value = null
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
