import * as VueRuntime from 'vue'
import { computed, defineComponent, h, ref } from 'vue'
import * as RouterRuntime from 'vue-router'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as Utils from '@/lib/utils'
import {
  button,
  click,
  compileClientComponent,
  content,
  element,
  flush,
  moduleDefault,
  mountApp,
  nodes,
  type HostNode,
} from '@/test/clientRender'
import type { DeviceState, DeviceSyncStatus, SyncDataset, SyncDocument } from '@/lib/deviceApi'

function doc(overrides: Partial<SyncDocument> = {}): SyncDocument {
  return {
    documentId: 'd1',
    path: 'lab/run.json',
    groupId: 'g1',
    state: 'pending',
    pendingEdits: 1,
    localOnly: false,
    validationFindings: 0,
    lastError: null,
    lastSyncedMs: null,
    ...overrides,
  }
}

function dataset(overrides: Partial<SyncDataset> = {}): SyncDataset {
  return {
    folderId: 'f1',
    label: 'data-2026',
    state: 'pending',
    pendingUploads: 2,
    unsyncedFiles: 5,
    conflicts: 0,
    ...overrides,
  }
}

const documents: SyncDocument[] = [
  doc({ documentId: 'd1', path: 'lab/run.json', state: 'pending', pendingEdits: 2 }),
  doc({ documentId: 'd2', path: 'lab/plan.json', state: 'synced', pendingEdits: 0 }),
  doc({ documentId: 'd3', path: 'lab/bad.json', state: 'invalid', validationFindings: 3 }),
  doc({ documentId: 'd4', path: 'lab/lost.json', state: 'failed', lastError: 'The realm refused the push.' }),
  doc({ documentId: 'd5', path: 'lab/notes.json', state: 'local_only' }),
]

const status = ref<DeviceSyncStatus>({
  realmReachable: true,
  lastSyncMs: null,
  pendingTotal: 0,
  documents: [],
  datasets: [],
})
const state = ref<DeviceState>('ready')
const running = ref(false)
const runError = ref<string | null>(null)
const runSync = vi.fn(async () => undefined)
const loadSync = vi.fn(async () => undefined)

const needsOwner = computed(
  () =>
    status.value.documents.filter((entry) => entry.state === 'invalid' || entry.state === 'failed').length +
    status.value.datasets.reduce((sum, entry) => sum + entry.conflicts, 0),
)

const Blank = defineComponent(() => () => h('div'))
const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})
const BadgeStub = defineComponent({
  inheritAttrs: false,
  props: { variant: String },
  setup: (props, { slots }) => () => h('span', { 'data-variant': props.variant }, slots.default?.()),
})
const EmptyStateStub = defineComponent({
  props: { title: String, description: String },
  setup: (props) => () => h('div', [props.title, ' ', props.description]),
})
const PageHeaderStub = defineComponent({
  props: { title: String, description: String, eyebrow: String },
  setup: (props, { slots }) => () => h('div', [props.title, slots.breadcrumbs?.(), slots.actions?.()]),
})
// Renders one button per chip so a filter can be picked the way a person does.
const FilterChipsStub = defineComponent({
  props: { options: { type: Array, default: () => [] }, modelValue: String },
  emits: ['update:modelValue'],
  setup: (props, { emit }) => () =>
    h(
      'div',
      (props.options as Array<{ value: string; label: string; count?: number }>).map((option) =>
        h('button', { onClick: () => emit('update:modelValue', option.value) }, `${option.label} ${option.count}`),
      ),
    ),
})
const icons = new Proxy({}, { get: () => defineComponent(() => () => h('i')) })

const SyncView = compileClientComponent(new URL('./SyncView.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': RouterRuntime,
  '@lucide/vue': icons,
  '@/components/ui/Badge.vue': moduleDefault(BadgeStub),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/EmptyState.vue': moduleDefault(EmptyStateStub),
  '@/components/ui/FilterChips.vue': moduleDefault(FilterChipsStub),
  '@/components/ui/Skeleton.vue': moduleDefault(Blank),
  '@/components/dashboard/PageHeader.vue': moduleDefault(PageHeaderStub),
  '@/components/desktop/DeviceSurfaceState.vue': moduleDefault(Blank),
  '@/composables/useDeviceSync': {
    useDeviceSync: () => ({
      status,
      state,
      loading: computed(() => state.value === 'idle' || state.value === 'loading'),
      error: ref(null),
      runError,
      running,
      needsOwner,
      runSync,
      load: loadSync,
    }),
  },
  '@/lib/utils': Utils,
})

async function mount() {
  const Stub = defineComponent(() => () => h('div'))
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/app/sync', name: 'sync', component: Stub },
      { path: '/app/metadata/:id', name: 'metadata-detail', component: Stub },
      { path: '/app/folders/:folderId', name: 'folder', component: Stub },
      { path: '/app/device', name: 'device', component: Stub },
    ],
  })
  await router.push('/app/sync')
  await router.isReady()
  return mountApp(SyncView, { router })
}

function rows(root: HostNode): string[] {
  return nodes(root)
    .filter((node) => node.tag === 'li')
    .map((node) => content(node))
}

function badge(root: HostNode, label: string): HostNode {
  return element(root, (node) => node.tag === 'span' && content(node).trim() === label)
}

beforeEach(() => {
  status.value = {
    realmReachable: true,
    lastSyncMs: Date.now() - 60_000,
    pendingTotal: 3,
    documents,
    datasets: [dataset(), dataset({ folderId: 'f2', label: 'archive', state: 'error', conflicts: 2 })],
  }
  state.value = 'ready'
  running.value = false
  runError.value = null
  runSync.mockClear()
  loadSync.mockClear()
})

describe('sync overview', () => {
  it('leads with whether the realm can be reached at all', async () => {
    const mounted = await mount()

    expect(badge(mounted.root, 'online').props['data-variant']).toBe('success')
    expect(content(mounted.root)).toContain('3 changes pending')
    expect(button(mounted.root, 'Sync now').props.disabled).toBe(false)
    mounted.app.unmount()
  })

  it('offers no run while the realm is out of reach', async () => {
    status.value = { ...status.value, realmReachable: false }
    const mounted = await mount()

    expect(badge(mounted.root, 'offline').props['data-variant']).toBe('secondary')
    expect(button(mounted.root, 'Sync now').props.disabled).toBe(true)
    expect(content(mounted.root)).toContain('kept here and go out on their own')
    mounted.app.unmount()
  })

  it('asks the node for a run and says it is going', async () => {
    const mounted = await mount()

    await click(button(mounted.root, 'Sync now'))
    expect(runSync).toHaveBeenCalledTimes(1)

    running.value = true
    await flush()
    expect(button(mounted.root, 'Syncing').props.disabled).toBe(true)
    mounted.app.unmount()
  })
})

describe('document rows', () => {
  it('names the state of every document it keeps', async () => {
    const mounted = await mount()

    expect(rows(mounted.root).length).toBe(7)
    expect(badge(mounted.root, 'synced').props['data-variant']).toBe('success')
    expect(badge(mounted.root, 'pending').props['data-variant']).toBe('sky')
    expect(badge(mounted.root, 'invalid').props['data-variant']).toBe('warn')
    expect(badge(mounted.root, 'failed').props['data-variant']).toBe('destructive')
    expect(badge(mounted.root, 'local only').props['data-variant']).toBe('outline')
    expect(content(mounted.root)).toContain('2 edits waiting')
    mounted.app.unmount()
  })

  it('says why a document will not publish', async () => {
    // A node that named no error still owes the owner a reason to act on.
    const mounted = await mount()
    const text = content(mounted.root)

    expect(text).toContain('The realm refused the push.')
    expect(text).toContain('3 validation findings; the last valid version is shown until this is fixed')
    mounted.app.unmount()
  })

  it('narrows to the documents the sync cannot fix alone', async () => {
    const mounted = await mount()

    await click(button(mounted.root, 'Needs attention'))
    const shown = rows(mounted.root)

    expect(shown.some((row) => row.includes('lab/bad.json'))).toBe(true)
    expect(shown.some((row) => row.includes('lab/lost.json'))).toBe(true)
    expect(shown.some((row) => row.includes('lab/plan.json'))).toBe(false)
    expect(shown.some((row) => row.includes('lab/run.json'))).toBe(false)
    mounted.app.unmount()
  })

  it('counts the documents behind each filter', async () => {
    const mounted = await mount()
    const text = content(mounted.root)

    expect(text).toContain('All 5')
    expect(text).toContain('Needs attention 2')
    expect(text).toContain('Pending 1')
    expect(text).toContain('Synced 1')
    mounted.app.unmount()
  })
})

describe('dataset rows', () => {
  it('counts what each synced folder still owes', async () => {
    const mounted = await mount()
    const text = content(mounted.root)

    expect(text).toContain('data-2026')
    expect(text).toContain('2 uploading')
    expect(text).toContain('5 not synced')
    expect(text).toContain('2 need your decision')
    expect(badge(mounted.root, 'error').props['data-variant']).toBe('destructive')
    mounted.app.unmount()
  })
})

describe('nothing kept offline', () => {
  it('tells the owner how a document becomes available here', async () => {
    status.value = { ...status.value, pendingTotal: 0, documents: [], datasets: [] }
    const mounted = await mount()
    const text = content(mounted.root)

    expect(text).toContain('Nothing is kept on this computer yet')
    expect(text).toContain('create it here, edit it here, or select it for offline use')
    expect(rows(mounted.root).length).toBe(0)
    mounted.app.unmount()
  })
})
