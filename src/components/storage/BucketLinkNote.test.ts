import * as VueRuntime from 'vue'
import { defineComponent, h, reactive, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { compileClientComponent, content, element, flush, mountApp, moduleDefault } from '@/test/clientRender'
import * as BucketNaming from '@/lib/bucketNaming'
import * as StorageRules from '@/lib/storageRules'

const listBackendImports = vi.fn()
const listGroupBackends = vi.fn()
const sessionEpoch = ref(0)

const LinkStub = defineComponent({
  props: { to: Object },
  setup: (props, { slots }) => () => h('a', { 'data-to': JSON.stringify(props.to) }, slots.default?.()),
})

const Note = compileClientComponent(new URL('./BucketLinkNote.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { RouterLink: LinkStub },
  '@/composables/useAruna': {
    useAruna: () => ({ apiBaseUrl: ref('https://api.test'), authToken: ref('t'), sessionEpoch, listGroupBackends }),
  },
  '@/lib/api': { listBackendImports },
  '@/components/ui/Button.vue': moduleDefault(defineComponent((_, { slots }) => () => h('span', slots.default?.()))),
  '@/lib/bucketNaming': BucketNaming,
  '@/lib/storageRules': StorageRules,
})

const BACKEND = { backend_id: 's1', name: 'spire', kind: 's3', public_config: {} }
const LINK = { import_id: 'i1', backend_id: 's1', backend_prefix: 'aruna-spire-reef/', bucket: 'reef', key_prefix: '', created_at: '' }

beforeEach(() => {
  listGroupBackends.mockReset().mockResolvedValue({ backends: [BACKEND] })
  listBackendImports.mockReset().mockResolvedValue([LINK, { ...LINK, import_id: 'i2', bucket: 'other' }])
})

describe('bucket link note', () => {
  it('says where the files are and opens the bucket edit in the group', async () => {
    const { root } = await mountApp(Note, { props: { bucket: 'reef', groupId: 'g1' } })
    await flush()
    const text = content(root).replace(/\s+/g, ' ')
    expect(text).toContain('Where the files are')
    expect(text).toContain('spire / aruna-spire-reef. New uploads are named {name}.')
    expect(text).toContain('Change')
    const to = JSON.parse(String(element(root, (node) => node.tag === 'a').props['data-to']))
    expect(to).toEqual({ name: 'group', params: { id: 'g1' }, query: { tab: 'storage', link: 'i1' } })
  })

  it('says nothing for an unlinked bucket, a refused list or a group-less bucket', async () => {
    const other = await mountApp(Note, { props: { bucket: 'none', groupId: 'g1' } })
    await flush()
    expect(content(other.root)).toBe('')
    listBackendImports.mockRejectedValue({ status: 403 })
    const refused = await mountApp(Note, { props: { bucket: 'reef', groupId: 'g1' } })
    await flush()
    expect(content(refused.root)).toBe('')
    const none = await mountApp(Note, { props: { bucket: 'reef', groupId: null } })
    expect(content(none.root)).toBe('')
  })

  it('ignores an answer for the bucket that was left', async () => {
    let late: (value: unknown) => void = () => {}
    listBackendImports.mockReset().mockReturnValueOnce(new Promise((resolve) => (late = resolve)))
    const props = reactive({ bucket: 'reef', groupId: 'g1' })
    const mounted = await mountApp(defineComponent(() => () => h(Note, props)))
    listBackendImports.mockResolvedValue([])
    props.bucket = 'archive'
    await flush()
    late([LINK])
    await flush()
    expect(content(mounted.root)).toBe('')
  })
})
