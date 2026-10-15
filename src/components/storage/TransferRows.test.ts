import { defineComponent, h, ref } from 'vue'
import * as VueRuntime from 'vue'
import { describe, expect, it, vi } from 'vitest'
import * as Api from '@/lib/api'
import * as LinkedFolders from '@/lib/linkedFolders'
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
const writesDisabled = ref(false)
const listBackendImports = vi.fn()
const listGroupBackends = vi.fn()
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

const linkedRows = compileClientComponent(new URL('./LinkedFolderRows.vue', import.meta.url), {
  ...common,
  '@/components/groups/LinkedFolderDialog.vue': moduleDefault(Slotted('div')),
  '@/composables/useAruna': {
    isUnsupportedEndpoint: () => false,
    useAruna: () => ({ apiBaseUrl: ref('https://a'), authToken: ref('t'), sessionEpoch, listGroupBackends }),
  },
  '@/lib/api': { ...Api, listBackendImports, runBackendImport: vi.fn() },
  '@/lib/linkedFolders': LinkedFolders,
  '@/lib/connectivity': { OFFLINE_WRITE_HINT: 'offline', useConnectivity: () => ({ writesDisabled }) },
})

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

describe('linked folder rows', () => {
  it('drops the rows of the old session and lists the new one', async () => {
    listGroupBackends.mockResolvedValue({ backends: [] })
    listBackendImports.mockResolvedValueOnce([link('old-share/')])
    const { root } = await mountApp(linkedRows, { props: { bucket: 'reef', groupId: 'g-1' } })
    await flush()
    expect(content(root)).toContain('old-share/')

    let answer: (value: unknown) => void = () => undefined
    listBackendImports.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)))
    sessionEpoch.value += 1
    await flush()
    expect(content(root)).not.toContain('old-share/')

    answer([link('new-share/')])
    await flush()
    expect(content(root)).toContain('new-share/')
  })

  it('blocks a run while offline', async () => {
    listGroupBackends.mockResolvedValue({ backends: [] })
    listBackendImports.mockResolvedValue([link('share/')])
    writesDisabled.value = true
    try {
      const { root } = await mountApp(linkedRows, { props: { bucket: 'reef', groupId: 'g-1' } })
      await flush()
      expect(element(root, (node) => node.props['aria-label'] === 'Run now').props.disabled).toBe(true)
    } finally {
      writesDisabled.value = false
    }
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
})
