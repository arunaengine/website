import * as VueRuntime from 'vue'
import { defineComponent, h, reactive, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { button, click, compileClientComponent, content, element, flush, moduleDefault, mountApp } from '@/test/clientRender'
import * as Api from '@/lib/api'
import * as LinkedFolders from '@/lib/linkedFolders'
import * as StateBadge from '@/lib/stateBadge'
import * as Utils from '@/lib/utils'

const listBackendImports = vi.fn()
const runBackendImport = vi.fn()
const deleteBackendImport = vi.fn()

const Empty = defineComponent(() => () => null)
const Slot = defineComponent((_, { slots }) => () => h('div', slots.default?.()))
const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})

const LinkedFoldersSection = compileClientComponent(new URL('./LinkedFoldersSection.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => Empty }),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Badge.vue': moduleDefault(Slot),
  '@/components/ui/EmptyState.vue': moduleDefault(Slot),
  '@/components/ui/ErrorPanel.vue': moduleDefault(Empty),
  '@/components/ui/Skeleton.vue': moduleDefault(Empty),
  '@/components/groups/LinkedFolderDialog.vue': moduleDefault(Empty),
  '@/composables/useAruna': {
    isUnsupportedEndpoint: (err: unknown) => err instanceof Api.ApiError && err.status === 404,
    useAruna: () => ({ apiBaseUrl: ref('https://api.test'), authToken: ref('bearer'), sessionEpoch: ref(0) }),
  },
  '@/lib/connectivity': { OFFLINE_WRITE_HINT: 'offline', useConnectivity: () => ({ writesDisabled: ref(false) }) },
  '@/lib/stateBadge': StateBadge,
  '@/lib/linkedFolders': LinkedFolders,
  '@/lib/api': { ...Api, listBackendImports, runBackendImport, deleteBackendImport },
  '@/lib/utils': Utils,
})

const BACKENDS = [
  { backend_id: 'b1', group_id: 'g1', kind: 's3', name: 'lab-store', public_config: {} },
  { backend_id: 'b2', group_id: 'g1', kind: 's3', name: 'archive', public_config: {} },
]

function link(id: string, overrides: Record<string, unknown> = {}) {
  return {
    import_id: id, backend_id: 'b1', backend_prefix: 'raw/2024/', bucket: 'sequencing', key_prefix: '',
    schedule: '0 3 * * *', created_at: '2026-10-01T00:00:00Z', last_run: null, ...overrides,
  }
}

async function render(groupId = 'g1') {
  const state = reactive({ groupId, backends: BACKENDS, canAdmin: true })
  const mounted = await mountApp(defineComponent(() => () => h(LinkedFoldersSection, state)))
  return { ...mounted, state }
}

function iconButton(root: Parameters<typeof content>[0], label: string) {
  return element(root, (node) => node.tag === 'button' && node.props['aria-label'] === label)
}

beforeEach(() => {
  listBackendImports.mockReset()
  runBackendImport.mockReset()
  deleteBackendImport.mockReset()
})

describe('LinkedFoldersSection', () => {
  it('shows both sides, the schedule and the last run', async () => {
    listBackendImports.mockResolvedValue([
      link('i1', {
        write_backend_id: 'b2',
        write_prefix: 'uploads/',
        last_run: {
          job_id: 'j1', state: 'failed', started_at: new Date().toISOString(), imported: 1284, skipped: 0, failed: 3,
          errors: [{ key: 'raw/2024/x.bin', message: 'checksum mismatch' }],
        },
      }),
    ])
    const mounted = await render()
    const text = content(mounted.root)

    expect(text).toContain('lab-store / raw/2024')
    expect(text).toContain('sequencing / whole bucket')
    expect(text).toContain('Every day at 03:00 UTC')
    expect(text).toContain('1,284 added, 3 failed')
    expect(text).toContain('archive / uploads')
    expect(text).not.toContain('checksum mismatch')
    await click(button(mounted.root, 'Show failures'))
    expect(content(mounted.root)).toContain('raw/2024/x.bin: checksum mismatch')
    mounted.app.unmount()
  })

  it('keeps the list of the current group when an older load answers late', async () => {
    let answerOld: (value: unknown) => void = () => {}
    listBackendImports.mockReturnValueOnce(new Promise((resolve) => (answerOld = resolve)))
    listBackendImports.mockResolvedValueOnce([link('i2', { bucket: 'current' })])
    const mounted = await render('g1')
    mounted.state.groupId = 'g2'
    await flush()
    answerOld([link('i1', { bucket: 'stale' })])
    await flush()

    expect(content(mounted.root)).toContain('current / whole bucket')
    expect(content(mounted.root)).not.toContain('stale')
    mounted.app.unmount()
  })

  it('says so when a run is already going', async () => {
    listBackendImports.mockResolvedValue([link('i1')])
    runBackendImport.mockRejectedValue(new Api.ApiError(409, 'conflict'))
    const mounted = await render()
    await click(button(mounted.root, 'Run now'))

    expect(runBackendImport).toHaveBeenCalledWith('g1', 'i1', expect.anything())
    expect(content(mounted.root)).toContain('This link is already running.')
    mounted.app.unmount()
  })

  it('deletes a link only after the inline confirm', async () => {
    listBackendImports.mockResolvedValue([link('i1')])
    deleteBackendImport.mockResolvedValue(undefined)
    const mounted = await render()
    await click(iconButton(mounted.root, 'Delete sequencing / whole bucket'))

    expect(deleteBackendImport).not.toHaveBeenCalled()
    expect(content(mounted.root)).toContain('Aruna never deletes files from your storage.')
    listBackendImports.mockResolvedValue([])
    await click(button(mounted.root, 'Delete'))
    expect(deleteBackendImport).toHaveBeenCalledWith('g1', 'i1', expect.anything())
    expect(content(mounted.root)).not.toContain('sequencing')
    mounted.app.unmount()
  })

  it('hides itself on a node without the routes', async () => {
    listBackendImports.mockRejectedValue(new Api.ApiError(404, 'not found'))
    const mounted = await render()

    expect(content(mounted.root)).toBe('')
    mounted.app.unmount()
  })
})
