import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as Api from '@/lib/api'
import * as Utils from '@/lib/utils'
import { button, click, compileClientComponent, content, element, flush, moduleDefault, mountApp } from '@/test/clientRender'

const getBucketCheck = vi.fn()
const startBucketCheck = vi.fn()
const cleanBucketCheck = vi.fn()

const Slot = defineComponent((_, { attrs, slots }) => () => h('div', attrs, slots.default?.()))
const Empty = defineComponent(() => () => null)
const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})
const DialogStub = defineComponent({
  props: { open: Boolean },
  setup: (props, { slots }) => () => (props.open ? h('div', { role: 'dialog' }, slots.default?.()) : null),
})

const Section = compileClientComponent(new URL('./BucketCheckSection.vue', import.meta.url), {
  vue: VueRuntime,
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Dialog.vue': moduleDefault(DialogStub),
  '@/components/ui/DialogClose.vue': moduleDefault(Slot),
  '@/components/ui/DialogContent.vue': moduleDefault(Slot),
  '@/components/ui/DialogDescription.vue': moduleDefault(Slot),
  '@/components/ui/DialogFooter.vue': moduleDefault(Slot),
  '@/components/ui/DialogHeader.vue': moduleDefault(Slot),
  '@/components/ui/DialogTitle.vue': moduleDefault(Slot),
  '@/components/ui/Progress.vue': moduleDefault(Empty),
  '@/composables/useAruna': { isUnsupportedEndpoint: (err: unknown) => err instanceof Api.ApiError && err.status === 404 },
  '@/composables/aruna/state': { apiBaseUrl: ref('https://a.test/api/v1'), authToken: ref('token') },
  '@/composables/s3/endpoints': { localNodeId: () => 'n1', nodeApiBase: () => 'https://a.test/api/v1' },
  '@/lib/api': { ...Api, getBucketCheck, startBucketCheck, cleanBucketCheck },
  '@/lib/connectivity': { OFFLINE_WRITE_HINT: 'offline', useConnectivity: () => ({ writesDisabled: ref(false) }) },
  '@/lib/utils': Utils,
})

const done = (broken: number) => ({
  bucket: 'reef',
  broken: [],
  progress: { checked: 1200, broken, failed: 0, started_at_ms: 1, finished_at_ms: 2 },
})

async function mount() {
  const mounted = await mountApp(defineComponent(() => () => h(Section, { bucket: 'reef', nodeId: null })))
  await flush()
  if (mounted.errors.length) throw mounted.errors[0]
  return mounted
}

beforeEach(() => {
  vi.clearAllMocks()
  startBucketCheck.mockResolvedValue({})
  cleanBucketCheck.mockResolvedValue({ bucket: 'reef', deleted: 3, kept: 0, more: false })
})

describe('BucketCheckSection', () => {
  it('starts a check', async () => {
    getBucketCheck.mockResolvedValue({ bucket: 'reef', broken: [] })
    const mounted = await mount()
    await click(button(mounted.root, 'Check files'))
    expect(startBucketCheck).toHaveBeenCalledWith('reef', expect.anything())
    mounted.app.unmount()
  })

  it('shows the broken count and cleans up after a confirmation', async () => {
    getBucketCheck.mockResolvedValue(done(3))
    const mounted = await mount()
    expect(content(mounted.root)).toContain('3 broken.')
    await click(button(mounted.root, 'Clean up'))
    expect(cleanBucketCheck).not.toHaveBeenCalled()
    await click(button(element(mounted.root, (node) => node.props.role === 'dialog'), 'Clean up'))
    expect(cleanBucketCheck).toHaveBeenCalledWith('reef', expect.anything())
    expect(content(mounted.root)).toContain('Removed 3 files.')
    mounted.app.unmount()
  })

  it('offers no clean up when nothing is broken', async () => {
    getBucketCheck.mockResolvedValue(done(0))
    const mounted = await mount()
    expect(content(mounted.root)).toContain('None broken.')
    expect(() => button(mounted.root, 'Clean up')).toThrow()
    mounted.app.unmount()
  })

  it('hides itself on a node without the check', async () => {
    getBucketCheck.mockRejectedValue(new Api.ApiError(404, 'not found'))
    const mounted = await mount()
    expect(content(mounted.root)).not.toContain('Check files')
    mounted.app.unmount()
  })
})
