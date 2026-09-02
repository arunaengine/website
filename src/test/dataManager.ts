// The Data view's object browser under the in-memory client renderer: the
// compiled component plus a manager double, shared by the browser test and the
// deletion flow test so both drive the same surface.
import { computed, defineComponent, h, ref, type Component, type Ref } from 'vue'
import * as VueRuntime from 'vue'
import { vi } from 'vitest'
import * as DeletionRequest from '@/lib/deletion/request'
import * as StateBadge from '@/lib/stateBadge'
import * as DropEntries from '@/lib/upload/dropEntries'
import * as Utils from '@/lib/utils'
import { compileClientComponent, moduleDefault } from '@/test/clientRender'

export const IconStub = defineComponent((_, { attrs }) => () => h('i', attrs))

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

/** The write answers the compiled browser sees; a test may narrow them. */
export const s3Access = {
  canWrite: (_bucket: string, _key: string) => true,
  canDeletePrefix: (_bucket: string, _prefix: string) => true,
}

export function resetS3Access() {
  s3Access.canWrite = () => true
  s3Access.canDeletePrefix = () => true
}

let compiled: Component | null = null

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
      '@/components/ui/Spinner.vue': moduleDefault(Slotted('i')),
      '@/components/ui/Switch.vue': moduleDefault(Slotted('span')),
      '@/components/ui/Tooltip.vue': moduleDefault(Slotted('span')),
      '@/components/data/Breadcrumbs.vue': moduleDefault(Slotted('nav')),
      '@/components/data/ObjectIcon.vue': moduleDefault(Slotted('i')),
      '@/components/watches/WatchButton.vue': moduleDefault(Slotted('button')),
      '@/composables/useAruna': { useAruna: () => ({ isRealmAdmin: ref(false) }) },
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
    folders,
    objects,
    nextToken: ref(undefined),
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
    deletedLoading: ref(false),
    deletedTruncated: ref(false),
    deletedError: ref(null),
    restoringKey: ref(null),
    restoreObject: vi.fn(),
    requestDelete: vi.fn(),
    ...overrides,
  }
}
