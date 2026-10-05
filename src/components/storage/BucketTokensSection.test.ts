import { defineComponent, h, ref } from 'vue'
import * as VueRuntime from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as Api from '@/lib/api'
import type { BucketTokenEntry } from '@/lib/api'
import * as Wording from '@/lib/bucketEncryption'
import * as StateBadge from '@/lib/stateBadge'
import * as Utils from '@/lib/utils'
import { compileClientComponent, content, flush, mountApp, moduleDefault, type Mounted } from '@/test/clientRender'

const listBucketTokens = vi.fn()

const Slotted = (tag: string) =>
  defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h(tag, attrs, slots.default?.()) })

const section = compileClientComponent(new URL('./BucketTokensSection.vue', import.meta.url), {
  vue: VueRuntime,
  '@/components/ui/Badge.vue': moduleDefault(Slotted('span')),
  '@/components/ui/Notice.vue': moduleDefault(Slotted('aside')),
  '@/components/ui/Spinner.vue': moduleDefault(
    defineComponent({ props: { label: String }, setup: (props) => () => h('span', props.label) }),
  ),
  '@/lib/api': { ...Api, listBucketTokens: (...args: unknown[]) => listBucketTokens(...args) },
  '@/lib/bucketEncryption': Wording,
  '@/lib/stateBadge': StateBadge,
  '@/lib/utils': Utils,
})

const NODE = { baseUrl: 'https://b.test/api/v1', token: 't' }
let current = true
const revision = ref(0)
const source = {
  client: () => NODE,
  binder: () => {
    current = true
    return () => current
  },
  load: async () => undefined,
  status: ref(null),
  revision,
}

function token(accessKey: string, overrides: Partial<BucketTokenEntry> = {}): BucketTokenEntry {
  return {
    access_key_id: accessKey,
    user_id: '01JUSERAAAAAAAAAAAAAAAAAAA@realm',
    created_at: '2026-10-05T10:00:00Z',
    generation: 3,
    stale: false,
    ...overrides,
  }
}

const mounted: Mounted[] = []

async function mount() {
  const app = await mountApp(section, { props: { bucket: 'reef', source } })
  mounted.push(app)
  return app.root
}

async function render() {
  const root = await mount()
  await flush()
  return content(root)
}

beforeEach(() => {
  listBucketTokens.mockReset()
  revision.value = 0
})

afterEach(() => {
  for (const app of mounted.splice(0)) app.app.unmount()
})

describe('bucket session tokens', () => {
  it('lists the key, user, generation and a stale badge, never a token', async () => {
    listBucketTokens.mockResolvedValue({ tokens: [token('AKFRESH'), token('AKOLD', { generation: 2, stale: true })] })

    const text = await render()

    expect(listBucketTokens).toHaveBeenCalledWith('reef', NODE)
    expect(text).toContain('AKFRESH')
    expect(text).toContain('AKOLD')
    expect(text).toContain('01JU…AAAA')
    expect(text).toContain('Key generation 2')
    expect(text).toContain('1 stale')
    expect(text.match(/Stale/g)).toHaveLength(1)
  })

  it('says why the list is missing instead of showing it empty', async () => {
    listBucketTokens.mockRejectedValue(new Api.ApiError(403, 'forbidden'))
    expect(await render()).toContain('Only key holders and group admins see the session tokens.')

    listBucketTokens.mockRejectedValue(new Api.ApiError(404, 'not found'))
    expect(await render()).toContain('does not list session tokens')

    listBucketTokens.mockRejectedValue(new Error('offline'))
    const failed = await render()
    expect(failed).toContain('The session tokens are unknown.')
    expect(failed).not.toContain('No S3 key has a session token')
  })

  it('drops an answer that arrives after the bucket context changed', async () => {
    let answer: (value: unknown) => void = () => undefined
    listBucketTokens.mockReturnValue(new Promise((resolve) => (answer = resolve)))

    const root = await mount()
    current = false
    answer({ tokens: [token('AKLATE')] })
    await flush()

    expect(content(root)).not.toContain('AKLATE')
    expect(content(root)).toContain('Loading the session tokens')
  })

  it('reads the list again after a new status read', async () => {
    listBucketTokens.mockResolvedValue({ tokens: [] })
    const text = await render()
    expect(text).toContain('No S3 key has a session token for this bucket.')

    revision.value += 1
    await flush()

    expect(listBucketTokens).toHaveBeenCalledTimes(2)
  })
})
