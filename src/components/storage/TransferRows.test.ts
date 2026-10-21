import { defineComponent, h, ref } from 'vue'
import * as VueRuntime from 'vue'
import { describe, expect, it, vi } from 'vitest'
import * as Api from '@/lib/api'
import * as StateBadge from '@/lib/stateBadge'
import * as Utils from '@/lib/utils'
import { compileClientComponent, content, element, flush, mountApp, moduleDefault } from '@/test/clientRender'

const IconStub = defineComponent((_, { attrs }) => () => h('i', attrs))
const Slotted = (tag: string) =>
  defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h(tag, attrs, slots.default?.()) })
const TitledStub = (tag: string) =>
  defineComponent({
    inheritAttrs: false,
    props: { title: { type: String, default: '' }, message: { type: String, default: '' } },
    setup: (props, { attrs }) => () => h(tag, attrs, `${props.title}${props.message}`),
  })

const sessionEpoch = ref(0)
const listStagingJobs = vi.fn()

const common = {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => IconStub }),
  '@/components/ui/Badge.vue': moduleDefault(Slotted('span')),
  '@/components/ui/EmptyState.vue': moduleDefault(TitledStub('p')),
  '@/components/ui/ErrorPanel.vue': moduleDefault(TitledStub('aside')),
  '@/components/ui/IconButton.vue': moduleDefault(
    defineComponent({
      inheritAttrs: false,
      props: { label: String, disabled: Boolean, disabledReason: { type: String, default: null } },
      setup: (props, { attrs, slots }) => () =>
        h('button', { ...attrs, 'aria-label': props.label, disabled: props.disabled || Boolean(props.disabledReason) }, slots.default?.()),
    }),
  ),
  '@/components/ui/ListSkeleton.vue': moduleDefault(Slotted('div')),
  '@/components/ui/Progress.vue': moduleDefault(Slotted('div')),
  '@/components/ui/StatusDot.vue': moduleDefault(Slotted('i')),
  '@/lib/stateBadge': StateBadge,
  '@/lib/utils': Utils,
}

const stagingRows = compileClientComponent(new URL('./StagingJobRows.vue', import.meta.url), {
  ...common,
  '@/composables/useAruna': {
    useAruna: () => ({
      sessionEpoch,
      listStagingJobs,
      getStagingJob: vi.fn(),
      listGroupConnectors: vi.fn(async () => ({ connectors: [] })),
    }),
  },
  '@/composables/useStaging': await import('@/composables/useStaging'),
  '@/lib/api': Api,
  '@/lib/config': { featureEnabled: () => true },
})

function link(prefix: string) {
  return { import_id: prefix, backend_id: 'b', backend_prefix: prefix, bucket: 'reef', key_prefix: '', created_at: '' }
}

describe('unknown transfer counts', () => {
  it('reports a failed staging list as unknown and shows the error', async () => {
    listStagingJobs.mockRejectedValueOnce(new Api.ApiError(500, 'staging list failed'))
    const counts: Array<number | null> = []
    const { root } = await mountApp(stagingRows, {
      props: { bucket: 'reef', onCount: (count: number | null) => counts.push(count) },
    })
    await flush()

    expect(counts.at(-1)).toBeNull()
    expect(content(root)).toContain('staging list failed')
  })
})

describe('staging job rows', () => {
  it('reloads the jobs when the session changes', async () => {
    listStagingJobs.mockResolvedValue({ jobs: [] })
    await mountApp(stagingRows, { props: { bucket: 'reef' } })
    await flush()
    const calls = listStagingJobs.mock.calls.length

    sessionEpoch.value += 1
    await flush()

    expect(listStagingJobs.mock.calls.length).toBeGreaterThan(calls)
  })

  it('says the scan stopped early instead of claiming none', async () => {
    listStagingJobs.mockResolvedValue({ jobs: [], next_cursor: 'more' })
    const counts: Array<number | null> = []
    const { root } = await mountApp(stagingRows, {
      props: { bucket: 'reef', onCount: (count: number | null) => counts.push(count) },
    })
    await flush()

    expect(content(root)).toContain('Older ones were not checked.')
    expect(content(root)).not.toContain('No staging job writes into this bucket.')
    expect(counts.at(-1)).toBeNull()
  })
})
