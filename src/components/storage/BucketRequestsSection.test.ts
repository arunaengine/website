import { defineComponent, h, ref } from 'vue'
import * as VueRuntime from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as Api from '@/lib/api'
import * as Wording from '@/lib/bucketEncryption'
import * as Utils from '@/lib/utils'
import { compileClientComponent, content, flush, mountApp, moduleDefault, type Mounted } from '@/test/clientRender'

const listKeyRequests = vi.fn()
const issueWaiting = vi.fn()
const targetOf = vi.fn()
const vaultState = ref('locked')

const Slotted = (tag: string) =>
  defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h(tag, attrs, slots.default?.()) })

const section = compileClientComponent(new URL('./BucketRequestsSection.vue', import.meta.url), {
  vue: VueRuntime,
  '@/components/ui/Notice.vue': moduleDefault(Slotted('aside')),
  '@/components/ui/Spinner.vue': moduleDefault(
    defineComponent({ props: { label: String }, setup: (props) => () => h('span', props.label) }),
  ),
  '@/composables/useKeyIssue': { useKeyIssue: () => ({ issueWaiting, targetOf }) },
  '@/composables/useUserVault': { useUserVault: () => ({ state: vaultState }) },
  '@/lib/api': { ...Api, listKeyRequests: (...args: unknown[]) => listKeyRequests(...args) },
  '@/lib/bucketEncryption': Wording,
  '@/lib/utils': Utils,
})

const NODE = { baseUrl: 'https://b.test/api/v1', token: 't' }
const TARGET = { bucket: 'reef', nodeId: 'node-b', client: NODE }
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

// A person of another realm: the same ULID text as a local user, a different home realm.
const FOREIGN = '01JUSERAAAAAAAAAAAAAAAAAAA@realm-a'

function request(user: string) {
  return { fields: { recipient_user: user }, record: `R-${user}`, aad: null }
}

const mounted: Mounted[] = []

async function render() {
  const app = await mountApp(section, { props: { bucket: 'reef', nodeId: 'node-b', source } })
  mounted.push(app)
  await flush()
  return content(app.root)
}

beforeEach(() => {
  listKeyRequests.mockReset()
  issueWaiting.mockReset()
  targetOf.mockReset().mockReturnValue(TARGET)
  vaultState.value = 'locked'
  revision.value = 0
})

afterEach(() => {
  for (const app of mounted.splice(0)) app.app.unmount()
})

describe('bucket key requests', () => {
  it('shows a waiting foreign person and asks for the vault without issuing', async () => {
    listKeyRequests.mockResolvedValue({ records: [request(FOREIGN), request(FOREIGN)], next_cursor: null })

    const text = await render()

    expect(listKeyRequests).toHaveBeenCalledWith('reef', null, NODE)
    expect(text).toContain('1 person waits for a key')
    expect(text).toContain('Your vault must be unlocked')
    expect(issueWaiting).not.toHaveBeenCalled()
  })

  it('issues this bucket once the vault is unlocked and reads the list again', async () => {
    listKeyRequests
      .mockResolvedValueOnce({ records: [request(FOREIGN)], next_cursor: null })
      .mockResolvedValue({ records: [], next_cursor: null })
    issueWaiting.mockResolvedValue(undefined)
    await render()

    vaultState.value = 'unlocked'
    await flush()
    await flush()

    expect(issueWaiting).toHaveBeenCalledWith([TARGET])
    expect(content(mounted[0].root)).toContain('No key request waits on this bucket.')
  })

  it('reads every page of requests', async () => {
    listKeyRequests
      .mockResolvedValueOnce({ records: [request(FOREIGN)], next_cursor: 'c1' })
      .mockResolvedValueOnce({ records: [request('01JUSERBBBBBBBBBBBBBBBBBBB')], next_cursor: null })

    expect(await render()).toContain('2 people wait for a key')
    expect(listKeyRequests).toHaveBeenLastCalledWith('reef', 'c1', NODE)
  })

  it('shows nothing to a caller the node refuses, and an error for other failures', async () => {
    listKeyRequests.mockRejectedValue(new Api.ApiError(403, 'forbidden'))
    expect(await render()).not.toContain('Key requests')

    listKeyRequests.mockRejectedValue(new Error('offline'))
    const failed = await render()
    expect(failed).toContain('The key requests are unknown.')
    expect(failed).not.toContain('No key request waits')
  })

  it('drops an answer that arrives after the bucket context changed', async () => {
    let answer: (value: unknown) => void = () => undefined
    listKeyRequests.mockReturnValue(new Promise((resolve) => (answer = resolve)))
    const app = await mountApp(section, { props: { bucket: 'reef', nodeId: 'node-b', source } })
    mounted.push(app)

    current = false
    answer({ records: [request(FOREIGN)], next_cursor: null })
    await flush()

    expect(content(app.root)).not.toContain('person waits')
    expect(content(app.root)).toContain('Loading the key requests')
  })
})
