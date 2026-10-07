import { defineComponent, h, ref } from 'vue'
import * as VueRuntime from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as Api from '@/lib/api'
import { ApiError, type BucketAbeStatus, type BucketEncryptionResponse, type RekeyPage } from '@/lib/api'
import * as Wording from '@/lib/bucketEncryption'
import * as StateBadge from '@/lib/stateBadge'
import { button, click, compileClientComponent, content, element, flush, mountApp, moduleDefault } from '@/test/clientRender'

const raiseBucketEpoch = vi.fn()
const rekeyBucketPrefix = vi.fn()

const Slotted = (tag: string) =>
  defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h(tag, attrs, slots.default?.()) })

const section = compileClientComponent(new URL('./BucketRekeySection.vue', import.meta.url), {
  vue: VueRuntime,
  '@/components/ui/Badge.vue': moduleDefault(Slotted('span')),
  '@/components/ui/Button.vue': moduleDefault(Slotted('button')),
  '@/components/ui/Input.vue': moduleDefault(Slotted('input')),
  '@/components/ui/Notice.vue': moduleDefault(Slotted('aside')),
  '@/lib/api': {
    ...Api,
    raiseBucketEpoch: (...args: unknown[]) => raiseBucketEpoch(...args),
    rekeyBucketPrefix: (...args: unknown[]) => rekeyBucketPrefix(...args),
  },
  '@/lib/bucketEncryption': Wording,
  '@/lib/stateBadge': StateBadge,
})

const NODE = { baseUrl: 'https://b.test/api/v1', token: 't' }
const status = ref<BucketEncryptionResponse | null>(null)
const load = vi.fn()
const source = { client: () => NODE, binder: () => () => true, load, status, revision: ref(0) }

function bucket(abe: Partial<BucketAbeStatus>, unlocked = true): BucketEncryptionResponse {
  const unlock = { state: unlocked ? 'unlocked' : 'locked' } as BucketEncryptionResponse['unlock']
  const value = { bucket: 'reef', mode: 'vault_locked', unlock, abe: { epoch: 2, raise_due: false, rekey: null, ...abe } }
  return value as BucketEncryptionResponse
}

function page(rekeyed: number, done: boolean, prefix = 'results/2026/'): RekeyPage {
  return { prefix, epoch: 3, rekeyed, done }
}

async function render(value: BucketEncryptionResponse) {
  status.value = value
  const { root } = await mountApp(section, { props: { bucket: 'reef', source } })
  return root
}

async function typeFolder(root: Awaited<ReturnType<typeof render>>, value: string) {
  const folder = element(root, (node) => node.tag === 'input')
  ;(folder.props['onUpdate:modelValue'] as (next: string) => void)(value)
  await flush()
}

beforeEach(() => {
  raiseBucketEpoch.mockReset().mockResolvedValue({ epoch: 3 })
  rekeyBucketPrefix.mockReset()
  load.mockReset().mockImplementation(async () => {
    if (status.value?.abe) status.value = { ...status.value, abe: { ...status.value.abe, raise_due: false, rekey: null } }
  })
})

describe('removed access card', () => {
  it('appears only while a raise is due', async () => {
    expect(content(await render(bucket({})))).not.toContain('Removed access')
    const text = content(await render(bucket({ raise_due: true })))

    expect(text).toContain('Waiting')
    expect(text).toContain('Removed people are blocked now.')
  })

  it('protects new uploads, reloads the state and shows the result', async () => {
    const root = await render(bucket({ raise_due: true }))

    await click(button(root, 'Protect new uploads now'))

    expect(raiseBucketEpoch).toHaveBeenCalledWith('reef', NODE)
    expect(load).toHaveBeenCalled()
    expect(content(root)).toContain('Protected')
    expect(content(root)).toContain('New uploads use new keys. Older files keep their keys')
    expect(() => button(root, 'Protect new uploads now')).toThrow()
  })

  it('says in plain words when a non holder tries it', async () => {
    raiseBucketEpoch.mockRejectedValueOnce(new ApiError(403, 'forbidden'))
    const root = await render(bucket({ raise_due: true }))

    await click(button(root, 'Protect new uploads now'))

    expect(content(root)).toContain('Only key holders can do this.')
    expect(content(root)).toContain('Waiting')
    expect(load).not.toHaveBeenCalled()
  })
})

describe('replace keys card', () => {
  it('needs the bucket unlocked on the node', async () => {
    const root = await render(bucket({}, false))

    expect(content(root)).toContain('Unlock the bucket first.')
    expect(button(root, 'Replace keys').props.disabled).toBe(true)
  })

  it('calls page by page until done and shows the count', async () => {
    rekeyBucketPrefix.mockResolvedValueOnce(page(64, false)).mockResolvedValueOnce(page(100, true))
    const root = await render(bucket({}))

    await typeFolder(root, 'results/2026')
    await click(button(root, 'Replace keys'))

    expect(rekeyBucketPrefix).toHaveBeenCalledTimes(2)
    expect(rekeyBucketPrefix).toHaveBeenCalledWith('reef', 'results/2026/', NODE)
    expect(content(root)).toContain('100 files done.')
    expect(content(root)).not.toContain('Running')
    expect(load).toHaveBeenCalled()
  })

  it('shows the running state while pages are replaced', async () => {
    let finish!: (value: RekeyPage) => void
    rekeyBucketPrefix.mockResolvedValueOnce(page(64, false, '')).mockReturnValueOnce(new Promise((done) => (finish = done)))
    const root = await render(bucket({}))

    const run = click(button(root, 'Replace keys'))
    await flush()

    expect(rekeyBucketPrefix).toHaveBeenLastCalledWith('reef', '', NODE)
    expect(content(root)).toContain('Running')
    expect(content(root)).toContain('64 files done.')
    expect(content(root)).toContain('You can leave this page.')
    expect(button(root, 'Replace keys').props.disabled).toBe(true)
    finish(page(70, true, ''))
    await run
    expect(content(root)).toContain('70 files done.')
  })

  it('resumes the running folder the node reports', async () => {
    rekeyBucketPrefix.mockResolvedValueOnce(page(90, true, 'old/'))
    const root = await render(bucket({ rekey: { prefix: 'old/', rekeyed: 40 } }))

    expect(element(root, (node) => node.tag === 'input').props.modelValue).toBe('old/')
    expect(content(root)).toContain('Running')
    expect(content(root)).toContain('40 files done.')
    await click(button(root, 'Replace keys'))

    expect(rekeyBucketPrefix).toHaveBeenCalledWith('reef', 'old/', NODE)
    expect(content(root)).toContain('90 files done.')
  })

  it('shows the node message when another folder runs', async () => {
    const busy = new ApiError(409, 'Another prefix is being re-keyed.', 'conflict')
    rekeyBucketPrefix.mockRejectedValueOnce(busy)
    const root = await render(bucket({}))

    await click(button(root, 'Replace keys'))

    expect(content(root)).toContain('Another prefix is being re-keyed.')
    expect(content(root)).not.toContain('Running')
    expect(content(root)).not.toContain('files done')
  })
})
