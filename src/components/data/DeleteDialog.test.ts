import { computed, defineComponent, h, ref } from 'vue'
import * as VueRuntime from 'vue'
import { describe, expect, it, vi } from 'vitest'
import * as Utils from '@/lib/utils'
import * as DeletionOptions from '@/lib/deletion/options'
import * as DeletionRequest from '@/lib/deletion/request'
import {
  click,
  compileClientComponent,
  content,
  element,
  mountApp,
  moduleDefault,
  nodes,
  typeValue,
  type HostNode,
} from '@/test/clientRender'

const deleteObject = vi.fn(async () => undefined)
const deletePrefix = vi.fn(async () => ({ deleted: 1, errors: [] as { key: string; message: string }[] }))
const deleteObjectVersion = vi.fn(async () => undefined)
const copyObjectVersion = vi.fn(async () => ({ versionId: 'new' }))
const deleteBucket = vi.fn(async () => undefined)
const purgeRun = vi.fn(async () => ({ state: 'succeeded' }))
const preflightResponse = vi.fn()

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

const dialog = compileClientComponent(new URL('./DeleteDialog.vue', import.meta.url), {
  vue: VueRuntime,
  '@/lib/utils': Utils,
  '@/lib/deletion/options': DeletionOptions,
  '@/lib/deletion/request': DeletionRequest,
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
  '@/components/ui/Notice.vue': moduleDefault(slotted('aside')),
  '@/components/data/deletion/DeletionImpact.vue': moduleDefault(ImpactStub),
  '@/components/data/deletion/DeletionOutcome.vue': moduleDefault(PanelStub('outcome')),
  '@/components/data/deletion/PurgeProgress.vue': moduleDefault(PanelStub('progress')),
  '@/components/data/deletion/useDeletionPreflight': {
    useDeletionPreflight: () => ({
      backlinkPreflight: ref(null),
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
    s3ErrorMessage: (error: unknown) => String(error),
    useS3: () => ({
      canWrite: () => true,
      canDeletePrefix: () => true,
      deleteObject,
      deletePrefix,
      deleteObjectVersion,
      copyObjectVersion,
      deleteBucket,
    }),
  },
})

async function open(request: DeletionRequest.DeleteRequest) {
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
  const host = defineComponent({
    setup: () => () => h(dialog, { request, onCompleted: (result: unknown) => completed.push(result) }),
  })
  const { root } = await mountApp(host)
  return { root, completed }
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
    expect(labels(object.root)).toEqual(['delete', 'delete-permanently'])

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
})
