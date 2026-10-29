import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { button, click, compileClientComponent, content, element, flush, moduleDefault, mountApp, type HostNode } from '@/test/clientRender'

const myGroups = ref([{ id: 'g1', name: 'Lab group' }])
const credentials = ref<Array<{ access_key_id: string; status: string }>>([])
const searchBuckets = vi.fn(async (): Promise<{ hits: Array<{ bucket: string }>; next_cursor?: string }> => ({ hits: [] }))
const dismissed = ref(false)
const dismissOnboarding = vi.fn(async () => {
  dismissed.value = true
})
const keysShown = ref(true)

vi.mock('@/composables/useAruna', () => ({ useAruna: () => ({ myGroups, credentials, searchBuckets, sessionEpoch: ref(1) }) }))
const HasBucket = await import('@/composables/useHasBucket')

const LinkStub = defineComponent({
  props: { to: { type: [Object, String], required: true } },
  setup: (props, { slots }) => () => h('a', { 'data-to': JSON.stringify(props.to) }, slots.default?.()),
})
const ButtonStub = defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()) })
const StartLine = compileClientComponent(new URL('./StartLine.vue', import.meta.url), { vue: VueRuntime })
const WebStart = compileClientComponent(new URL('./WebStart.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { RouterLink: LinkStub },
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/dashboard/StartLine.vue': moduleDefault(StartLine),
  '@/composables/useAruna': { useAruna: () => ({ myGroups, credentials }) },
  '@/composables/useHasBucket': HasBucket,
  '@/composables/useOnboarding': { useOnboarding: () => ({ hasDone: () => dismissed.value, dismissOnboarding }) },
  '@/composables/usePortalFeatures': { usePortalFeatures: () => ({ shown: (feature: string) => feature !== 's3-keys' || keysShown.value }) },
})

const link = (root: HostNode, label: string) =>
  JSON.parse(String(element(root, (node) => node.tag === 'a' && content(node).trim() === label).props['data-to']))

beforeEach(() => {
  myGroups.value = [{ id: 'g1', name: 'Lab group' }]
  credentials.value = []
  searchBuckets.mockReset().mockResolvedValue({ hits: [] })
  dismissed.value = false
  dismissOnboarding.mockClear()
  keysShown.value = true
})

describe('web first steps', () => {
  it('names the next step in one line with its button, and the tours stay in Docs', async () => {
    const mounted = await mountApp(WebStart)
    await flush()

    expect(content(mounted.root)).toContain('Getting started 0 of 2 done. Next: create a bucket.')
    expect(link(mounted.root, 'Create a bucket')).toBe('/app/buckets')
    expect(content(mounted.root)).not.toMatch(/tour|tutorial/i)
    mounted.app.unmount()
  })

  it('moves on to a key, and leaves once both are done', async () => {
    searchBuckets.mockResolvedValue({ hits: [{ bucket: 'lab' }] })
    let mounted = await mountApp(WebStart)
    await flush()
    expect(content(mounted.root)).toContain('1 of 2 done. Next: connect your tools (aws, rclone, Python, Nextflow).')
    expect(link(mounted.root, 'Create a key')).toEqual({ name: 'settings', query: { tab: 'access', create: 'key' } })
    mounted.app.unmount()

    credentials.value = [{ access_key_id: 'AK1', status: 'active' }]
    mounted = await mountApp(WebStart)
    await flush()
    expect(content(mounted.root)).not.toContain('Getting started')
    mounted.app.unmount()
  })

  it('shows nothing before the buckets were read, and no key step where keys are not offered', async () => {
    searchBuckets.mockReturnValue(new Promise(() => undefined))
    let mounted = await mountApp(WebStart)
    expect(content(mounted.root)).not.toContain('Getting started')
    mounted.app.unmount()

    searchBuckets.mockResolvedValue({ hits: [] })
    keysShown.value = false
    myGroups.value = []
    mounted = await mountApp(WebStart)
    await flush()
    expect(content(mounted.root)).toContain('0 of 1 done')
    expect(link(mounted.root, 'Create a group first')).toEqual({ name: 'groups' })
    mounted.app.unmount()
  })

  it('stays hidden after Hide, which the account keeps', async () => {
    const mounted = await mountApp(WebStart)
    await flush()
    await click(button(mounted.root, 'Hide'))

    expect(dismissOnboarding).toHaveBeenCalledOnce()
    expect(content(mounted.root)).not.toContain('Getting started')
    mounted.app.unmount()
  })
})
