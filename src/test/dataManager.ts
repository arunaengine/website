// The Data view's object browser under the in-memory client renderer: the
// compiled component plus a manager double, shared by the browser test and the
// deletion flow test so both drive the same surface.
import { computed, defineComponent, h, ref, type Component, type Ref } from 'vue'
import * as VueRuntime from 'vue'
import { vi } from 'vitest'
import * as DeletionRequest from '@/lib/deletion/request'
import * as StateBadge from '@/lib/stateBadge'
import * as DropEntries from '@/lib/upload/dropEntries'
import * as NotebookDocument from '@/lib/notebook/document'
import * as ObjectListing from '@/lib/objectListing'
import * as Utils from '@/lib/utils'
import { compileClientComponent, moduleDefault } from '@/test/clientRender'

export const IconStub = defineComponent((_, { attrs }) => () => h('i', attrs))

/** Lets a test hold the filter debounce and fire it later. */
export const debounceHold = { on: false, queue: [] as Array<() => unknown> }

export const Slotted = (tag: string) =>
  defineComponent({
    inheritAttrs: false,
    setup: (_, { attrs, slots }) => () => h(tag, attrs, slots.default?.()),
  })

export const ButtonStub = defineComponent({
  inheritAttrs: false,
  props: { variant: String, size: String, disabled: Boolean, title: String, asChild: Boolean },
  setup: (props, { attrs, slots }) => () =>
    h('button', { ...attrs, disabled: props.disabled, title: props.title }, slots.default?.()),
})

export const IconButtonStub = defineComponent({
  inheritAttrs: false,
  props: { label: String, disabledReason: String, variant: String, size: String, class: String },
  setup: (props, { attrs, slots }) => () =>
    h(
      'button',
      { ...attrs, 'aria-label': props.label, disabled: Boolean(props.disabledReason) },
      slots.default?.(),
    ),
})

export const SelectStub = defineComponent({
  inheritAttrs: false,
  props: { modelValue: String, options: Array },
  emits: ['update:modelValue'],
  setup: (props, { attrs, emit }) => () =>
    h('select', {
      ...attrs,
      value: props.modelValue,
      onChange: (event: { target: { value: string } }) => emit('update:modelValue', event.target.value),
    }),
})

export const MenuItemStub = defineComponent({
  inheritAttrs: false,
  props: { disabled: Boolean },
  setup: (props, { attrs, slots }) => () =>
    h('button', { ...attrs, role: attrs.role ?? 'menuitem', disabled: props.disabled }, slots.default?.()),
})

/** The write answers the compiled browser sees; a test may narrow them. */
export const s3Access = {
  canWrite: (_bucket: string, _key: string) => true,
  canDeletePrefix: (_bucket: string, _prefix: string) => true,
}

export function resetS3Access() {
  s3Access.canWrite = () => true
  s3Access.canDeletePrefix = () => true
}

/** The broken-file reasons by key that the compiled browser shows in red. */
export const brokenFiles = { reasons: {} as Record<string, string> }

/** The locked-bucket state the compiled browser sees: a plain bucket unless a test changes it. */
export const lockedState = { locked: false, available: false, pending: new Set<string>() }
export const lockedDownload = vi.fn()
export const lockedCancel = vi.fn()

function lockedBucket(...args: unknown[]) {
  const plain = args[3] as (object: unknown) => unknown
  return {
    lockedOnNode: ref(lockedState.locked),
    availableToYou: ref(lockedState.available),
    wait: ref(null),
    cancel: lockedCancel,
    keyPending: (key: string) => lockedState.pending.has(key),
    download: (object: unknown) => (lockedState.locked ? lockedDownload(object) : plain(object)),
  }
}

let compiled: Component | null = null
let compiledBar: Component | null = null
let compiledMenu: Component | null = null

/** The row menu with its items rendered inline, so a test can pick one. */
export function rowMenu(): Component {
  compiledMenu ??= compileClientComponent(
    new URL('../components/data/manager/RowMenu.vue', import.meta.url),
    {
      vue: VueRuntime,
      '@lucide/vue': new Proxy({}, { get: () => IconStub }),
      '@/components/ui/Button.vue': moduleDefault(ButtonStub),
      '@/components/ui/DropdownMenu.vue': moduleDefault(Slotted('div')),
      '@/components/ui/DropdownMenuContent.vue': moduleDefault(Slotted('div')),
      '@/components/ui/DropdownMenuItem.vue': moduleDefault(MenuItemStub),
      '@/components/ui/DropdownMenuLabel.vue': moduleDefault(Slotted('p')),
      '@/components/ui/DropdownMenuSeparator.vue': moduleDefault(Slotted('hr')),
      '@/components/ui/DropdownMenuTrigger.vue': moduleDefault(Slotted('span')),
    },
  )
  return compiledMenu
}

/** The list bar above the object table, compiled so the browser tests can tick and act. */
export function objectListBar(): Component {
  compiledBar ??= compileClientComponent(
    new URL('../components/data/manager/ObjectListBar.vue', import.meta.url),
    {
      vue: VueRuntime,
      '@lucide/vue': new Proxy({}, { get: () => IconStub }),
      '@vueuse/core': {
        useDebounceFn: (fn: (...args: unknown[]) => unknown) => (...args: unknown[]) => {
          if (!debounceHold.on) return fn(...args)
          debounceHold.queue.push(() => fn(...args))
        },
      },
      '@/lib/objectListing': ObjectListing,
      '@/components/ui/Button.vue': moduleDefault(ButtonStub),
      '@/components/ui/DropdownMenu.vue': moduleDefault(Slotted('div')),
      '@/components/ui/DropdownMenuContent.vue': moduleDefault(Slotted('div')),
      '@/components/ui/DropdownMenuItem.vue': moduleDefault(MenuItemStub),
      '@/components/ui/DropdownMenuLabel.vue': moduleDefault(Slotted('p')),
      '@/components/ui/DropdownMenuSeparator.vue': moduleDefault(Slotted('hr')),
      '@/components/ui/DropdownMenuTrigger.vue': moduleDefault(Slotted('span')),
      '@/components/ui/IconButton.vue': moduleDefault(IconButtonStub),
      '@/components/ui/Input.vue': moduleDefault(Slotted('input')),
    },
  )
  return compiledBar
}

export function objectBrowser(): Component {
  compiled ??= compileClientComponent(
    new URL('../components/data/manager/ObjectBrowser.vue', import.meta.url),
    {
      vue: VueRuntime,
      'vue-router': { RouterLink: Slotted('a') },
      '@lucide/vue': new Proxy({}, { get: () => IconStub }),
      '@/lib/config': { featureEnabled: () => false },
      '@/lib/deletion/request': DeletionRequest,
      '@/lib/stateBadge': StateBadge,
      '@/lib/upload/dropEntries': DropEntries,
      '@/lib/notebook/document': NotebookDocument,
      '@/lib/objectListing': ObjectListing,
      '@/lib/utils': Utils,
      '@/components/ui/Badge.vue': moduleDefault(Slotted('span')),
      '@/components/ui/Button.vue': moduleDefault(ButtonStub),
      '@/components/ui/EmptyState.vue': moduleDefault(
        defineComponent({ props: { title: String }, setup: (props) => () => h('p', props.title) }),
      ),
      '@/components/ui/IconButton.vue': moduleDefault(IconButtonStub),
      '@/components/ui/Notice.vue': moduleDefault(Slotted('aside')),
      '@/components/ui/Popover.vue': moduleDefault(Slotted('div')),
      '@/components/ui/RefreshButton.vue': moduleDefault(Slotted('button')),
      '@/components/ui/Select.vue': moduleDefault(SelectStub),
      '@/components/ui/Spinner.vue': moduleDefault(Slotted('i')),
      '@/components/ui/Switch.vue': moduleDefault(Slotted('span')),
      '@/components/ui/Tooltip.vue': moduleDefault(Slotted('span')),
      '@/components/data/Breadcrumbs.vue': moduleDefault(Slotted('nav')),
      '@/components/data/ObjectIcon.vue': moduleDefault(Slotted('i')),
      '@/components/data/manager/ObjectListBar.vue': moduleDefault(objectListBar()),
      '@/components/data/manager/RowMenu.vue': moduleDefault(rowMenu()),
      '@/components/data/manager/TransferDialog.vue': moduleDefault(Slotted('aside')),
      '@/components/watches/WatchButton.vue': moduleDefault(Slotted('button')),
      '@/components/storage/KeyedReadNotice.vue': moduleDefault(Slotted('aside')),
      '@/composables/usePortalFeatures': { usePortalFeatures: () => ({ shown: () => true }) },
      '@/composables/useAruna': { useAruna: () => ({ isRealmAdmin: ref(false) }) },
      '@/composables/useBrokenFiles': {
        useBrokenFiles: () => ({ reasonOf: (key: string) => brokenFiles.reasons[key] ?? null }),
      },
      '@/composables/useLockedBucket': { useLockedBucket: (...args: unknown[]) => lockedBucket(...args) },
      '@/composables/useProviderBucket': { useProviderBucket: () => VueRuntime.ref(null) },
      '@/composables/useListPages': { PAGE_SIZES: [10, 25, 50, 100, 200, 500] },
      '@/composables/usePlacementPolicies': {
        usePlacementPolicies: () => ({ getBucketPlacement: vi.fn(async () => null) }),
      },
      '@/composables/useS3': {
        useS3: () => ({
          canWrite: (bucket: string, key: string) => s3Access.canWrite(bucket, key),
          canDeletePrefix: (bucket: string, prefix: string) =>
            s3Access.canDeletePrefix(bucket, prefix),
          clearSessions: vi.fn(),
        }),
      },
    },
  )
  return compiled
}

export const listedObject = {
  key: 'raw/reads.fastq',
  name: 'reads.fastq',
  size: 2048,
  lastModified: new Date('2026-02-01T00:00:00Z'),
}

export const listedFolder = { prefix: 'raw/genomes/', name: 'genomes' }

/**
 * Everything the browser destructures, inert unless a test overrides it. The
 * selection is a working double so a test can tick rows and read the count.
 */
export function fakeManager(overrides: Record<string, unknown> = {}) {
  const folders = (overrides.folders as Ref<typeof listedFolder[]>) ?? ref([])
  const objects = (overrides.objects as Ref<typeof listedObject[]>) ?? ref([listedObject])
  const selectedObjectKeys = ref(new Set<string>())
  const selectedPrefixes = ref(new Set<string>())
  const toggle = (set: Ref<Set<string>>, id: string, selected: boolean) => {
    const next = new Set(set.value)
    if (selected) next.add(id)
    else next.delete(id)
    set.value = next
  }
  return {
    router: { push: vi.fn() },
    bucket: ref('reef'),
    prefix: ref('raw'),
    s3Prefix: ref('raw/'),
    remoteNodeId: ref(null),
    realmNodes: { displayName: (id: string) => `node ${id}` },
    references: { prefixHasReferences: () => false, keyIsReferenced: () => false },
    referenceStats: computed(() => ({ count: 0, bytes: 0, groups: [] })),
    showReferenceStats: computed(() => false),
    referenceGroupLabel: () => '',
    referencedFrom: () => '',
    prefixReferenceSummary: () => '',
    activeGroupId: ref('g-1'),
    contextFingerprint: ref('n-1|g-1|k'),
    selectedGroupId: ref('g-1'),
    folders,
    objects,
    visibleFolders: folders,
    visibleObjects: objects,
    nameFilter: ref(''),
    listShow: ref('all'),
    resetFilters: vi.fn(),
    nextToken: ref(undefined),
    page: ref(1),
    pageSize: ref(25),
    nextPage: vi.fn(),
    previousPage: vi.fn(),
    setPageSize: vi.fn(),
    listLoading: ref(false),
    listError: ref(null),
    listAuthError: ref(false),
    isEmpty: computed(() => false),
    loadObjects: vi.fn(),
    navigateTo: vi.fn(),
    openFolder: vi.fn(),
    openDetails: vi.fn(),
    download: vi.fn(),
    keyIsSynced: () => false,
    bucketSyncCount: computed(() => 2),
    showSyncButton: computed(() => false),
    selectedObjectKeys,
    selectedPrefixes,
    selectedCount: computed(() => selectedObjectKeys.value.size + selectedPrefixes.value.size),
    selectableListedCount: computed(() => folders.value.length + objects.value.length),
    allListedSelected: computed(() => false),
    someListedSelected: computed(() => false),
    setObjectSelected: (key: string, selected: boolean) =>
      toggle(selectedObjectKeys, key, selected),
    setFolderSelected: (prefix: string, selected: boolean) =>
      toggle(selectedPrefixes, prefix, selected),
    setAllListedSelected: vi.fn(),
    clearSelection: () => {
      selectedObjectKeys.value = new Set()
      selectedPrefixes.value = new Set()
    },
    canWriteCurrentPrefix: computed(() => true),
    writeRestrictionMessage: computed(() => null),
    watchPathPrefix: computed(() => 'reef/raw/'),
    remoteBlocked: computed(() => false),
    remoteEndpointMissing: computed(() => false),
    retrySpinning: ref(false),
    onRetryObjects: vi.fn(),
    requestUpload: vi.fn(),
    showDeleted: ref(false),
    setShowDeleted: vi.fn(),
    deletedObjects: ref([]),
    deletedRows: ref([]),
    loadDeleted: vi.fn(),
    deletedLoading: ref(false),
    deletedTruncated: ref(false),
    deletedError: ref(null),
    restoringKey: ref(null),
    restoreObject: vi.fn(),
    requestDelete: vi.fn(),
    publicAccess: {
      isPublic: () => false,
      canManage: computed(() => false),
    },
    ...overrides,
  }
}
