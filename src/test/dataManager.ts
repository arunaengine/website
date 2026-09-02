// The Data view's object browser under the in-memory client renderer: the
// compiled component plus a manager double, shared by the browser test and the
// deletion flow test so both drive the same surface.
import { computed, defineComponent, h, ref, type Component } from 'vue'
import * as VueRuntime from 'vue'
import { vi } from 'vitest'
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

let compiled: Component | null = null

export function objectBrowser(): Component {
  compiled ??= compileClientComponent(
    new URL('../components/data/manager/ObjectBrowser.vue', import.meta.url),
    {
      vue: VueRuntime,
      'vue-router': { RouterLink: Slotted('a') },
      '@lucide/vue': new Proxy({}, { get: () => IconStub }),
      '@/lib/config': { featureEnabled: () => false },
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
        useS3: () => ({ canWrite: () => true, canDeletePrefix: () => true, clearSessions: vi.fn() }),
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

/** Everything the browser destructures, inert unless a test overrides it. */
export function fakeManager(overrides: Record<string, unknown> = {}) {
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
    folders: ref([]),
    objects: ref([listedObject]),
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
    selectedObjectKeys: ref(new Set<string>()),
    selectedObjectCount: computed(() => 0),
    selectableListedObjects: computed(() => [listedObject]),
    allListedObjectsSelected: computed(() => false),
    someListedObjectsSelected: computed(() => false),
    setObjectSelected: vi.fn(),
    setAllListedObjectsSelected: vi.fn(),
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
