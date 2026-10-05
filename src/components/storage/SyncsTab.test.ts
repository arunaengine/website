import { computed, defineComponent, h, ref } from 'vue'
import * as VueRuntime from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { useRefresh } from '@/composables/useRefresh'
import * as Api from '@/lib/api'
import * as StateBadge from '@/lib/stateBadge'
import * as Sync from '@/lib/sync'
import * as Utils from '@/lib/utils'
import type { SyncRelationship } from '@/lib/api'
import {
  click,
  compileClientComponent,
  content,
  element,
  flush,
  mountApp,
  moduleDefault,
} from '@/test/clientRender'

function relationship(state: string, extra: Partial<SyncRelationship> = {}): SyncRelationship {
  return {
    id: 's-1',
    source: 'arn:aruna:r-1:node-a:s3/reef-survey',
    target: 'arn:aruna:r-1:node-b:s3/reef-mirror',
    mode: 'continuous',
    reference_handling: 'materialize',
    replicate_deletes: false,
    created_by: 'u-1',
    created_at: '2026-01-01T00:00:00Z',
    state,
    status: { counters: { versions_synced: 2, bytes_synced: 10, failures: 0, consecutive_failures: 0 } },
    ...extra,
  }
}

const rows = ref([{ relationship: relationship('enabled'), direction: 'outgoing' as const }])
const updateSyncRelationship = vi.fn()
const getSyncRelationship = vi.fn()

const IconStub = defineComponent((_, { attrs }) => () => h('i', attrs))
const Slotted = (tag: string) =>
  defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h(tag, attrs, slots.default?.()) })
const ListShellStub = defineComponent({
  props: { state: String, emptyTitle: String },
  setup: (props, { slots }) => () =>
    h('div', props.state === 'ready' ? slots.default?.() : [props.emptyTitle ?? '']),
})
const SelectStub = defineComponent({
  props: { modelValue: String, options: { type: Array, default: () => [] } },
  setup: (props) => () => h('select', { value: props.modelValue }),
})
const StatusDotStub = defineComponent({ props: { label: String }, setup: (props) => () => h('span', props.label) })

const tab = compileClientComponent(new URL('./SyncsTab.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => IconStub }),
  '@/components/ui/Badge.vue': moduleDefault(Slotted('span')),
  '@/components/ui/Button.vue': moduleDefault(Slotted('button')),
  '@/components/ui/DocsLink.vue': moduleDefault(Slotted('a')),
  '@/components/ui/ListShell.vue': moduleDefault(ListShellStub),
  '@/components/ui/Notice.vue': moduleDefault(Slotted('aside')),
  '@/components/ui/RefreshButton.vue': moduleDefault(Slotted('button')),
  '@/components/ui/Select.vue': moduleDefault(SelectStub),
  '@/components/ui/Spinner.vue': moduleDefault(Slotted('span')),
  '@/components/ui/StatusDot.vue': moduleDefault(StatusDotStub),
  '@/composables/useAruna': {
    useAruna: () => ({
      getSyncRelationship,
      runSyncRelationship: vi.fn(),
      updateSyncRelationship,
      deleteSyncRelationship: vi.fn(),
    }),
  },
  '@/composables/useBucketSyncs': {
    useBucketSyncs: () => ({
      rows,
      hostedOn: ref({}),
      loading: ref(false),
      error: ref(null),
      remoteError: ref(null),
      hostOpts: () => ({}),
      load: () => Promise.resolve(0),
      cancel: () => undefined,
    }),
  },
  '@/composables/useRealmNodes': { useRealmNodes: () => ({ displayName: () => 'Node B' }) },
  '@/composables/useRefresh': { useRefresh },
  '@/lib/api': Api,
  '@/lib/stateBadge': StateBadge,
  '@/lib/sync': Sync,
  '@/lib/utils': Utils,
})

async function render(state = 'enabled', extra: Partial<SyncRelationship> = {}) {
  rows.value = [{ relationship: relationship(state, extra), direction: 'outgoing' as const }]
  updateSyncRelationship.mockReset()
  updateSyncRelationship.mockResolvedValue(relationship(state))
  getSyncRelationship.mockResolvedValue({ relationship: relationship(state), pending_jobs: 0 })
  const { root } = await mountApp(tab, { props: { bucket: 'reef-survey', nodeId: null } })
  await flush()
  return root
}

function pauseButton(root: Awaited<ReturnType<typeof render>>, label: string) {
  return element(root, (node) => node.tag === 'button' && node.props['aria-label'] === label)
}

describe('bucket syncs tab', () => {
  it('states that the list is creator scoped', async () => {
    const text = content(await render())

    expect(text).toContain('Only syncs you created are listed.')
    expect(text).toContain('Keep in sync')
    expect(text).toContain('reef-mirror')
  })

  it('pauses and resumes through the state patch', async () => {
    const running = await render('enabled')
    await click(pauseButton(running, 'Pause this sync'))
    expect(updateSyncRelationship).toHaveBeenCalledWith('s-1', { state: 'paused' }, {})

    const paused = await render('paused')
    await click(pauseButton(paused, 'Resume this sync'))
    expect(updateSyncRelationship).toHaveBeenCalledWith('s-1', { state: 'enabled' }, {})
  })

  it('hides pausing when the node refuses the state patch', async () => {
    const root = await render('enabled')
    updateSyncRelationship.mockRejectedValueOnce(new Api.ApiError(400, 'unknown field state'))

    await click(pauseButton(root, 'Pause this sync'))
    await flush()

    expect(content(root)).toContain('does not serve pausing a sync')
    expect(() => pauseButton(root, 'Pause this sync')).toThrow()
  })

  it('shows copies that wait for the source bucket key and an unencrypted target', async () => {
    const counters = { versions_synced: 0, bytes_synced: 0, failures: 0, consecutive_failures: 0 }
    const waiting = content(await render('enabled', { plaintext: true, status: { counters, awaiting_key: 3 } }))
    expect(waiting).toContain('3 copies are waiting for the source bucket to be unlocked.')
    expect(waiting).toContain('stores copies unencrypted')

    const one = content(await render('enabled', { status: { counters, awaiting_key: 1 } }))
    expect(one).toContain('1 copy is waiting for the source bucket to be unlocked.')

    for (const status of [{ counters, awaiting_key: 0 }, { counters }]) {
      const quiet = content(await render('enabled', { status }))
      expect(quiet).not.toContain('waiting for the source bucket')
      expect(quiet).not.toContain('stores copies unencrypted')
    }
  })
})
