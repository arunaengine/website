import { defineComponent, h } from 'vue'
import * as VueRuntime from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as Api from '@/lib/api'
import type { BucketEncryptionResponse, BucketKeyGeneration, BucketUnlockStatus } from '@/lib/api'
import * as Wording from '@/lib/bucketEncryption'
import * as StateBadge from '@/lib/stateBadge'
import { button, click, compileClientComponent, content, element, mountApp, moduleDefault } from '@/test/clientRender'

const unlock = vi.fn()
const extend = vi.fn()
const lock = vi.fn()

const Slotted = (tag: string) =>
  defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h(tag, attrs, slots.default?.()) })
const NoticeStub = defineComponent({
  props: { title: String },
  setup: (props, { slots }) => () => h('aside', [props.title, slots.default?.()]),
})
const DialogStub = defineComponent({
  props: { open: Boolean, generation: Number, role: String },
  setup: (props) => () => h('div', props.open ? `unlock dialog for ${props.role} ${props.generation}` : ''),
})

const access = compileClientComponent(new URL('./BucketKeyAccess.vue', import.meta.url), {
  vue: VueRuntime,
  '@/components/storage/BucketUnlockDialog.vue': moduleDefault(DialogStub),
  '@/components/ui/Badge.vue': moduleDefault(Slotted('span')),
  '@/components/ui/Button.vue': moduleDefault(Slotted('button')),
  '@/components/ui/Notice.vue': moduleDefault(NoticeStub),
  '@/components/ui/Select.vue': moduleDefault(Slotted('select')),
  '@/lib/bucketEncryption': Wording,
  '@/lib/stateBadge': StateBadge,
})

const LOCKED: BucketUnlockStatus = {
  state: 'locked',
  lock_reason: 'restart',
  locked_at_ms: 1,
  session_id: null,
  unlocked_at_ms: null,
  deadline_ms: null,
  max_deadline_ms: null,
}
const OPEN: BucketUnlockStatus = { ...LOCKED, state: 'unlocked', lock_reason: null, session_id: 'S1', deadline_ms: 9_000 }

function key(generation: number, role: BucketKeyGeneration['role'], unlockState = LOCKED): BucketKeyGeneration {
  return { generation, role, public_key: `PK${generation}`, fingerprint: `fingerprint-${generation}`, unlock: unlockState }
}

function status(overrides: Partial<BucketEncryptionResponse> = {}): BucketEncryptionResponse {
  return {
    bucket: 'reef',
    mode: 'vault_locked',
    bucket_id: 'B1',
    storage_generation: 1,
    key_generation: 2,
    public_key: 'PK2',
    fingerprint: 'fingerprint-2',
    cipher: 'chacha20_poly1305',
    block_keys: 'content_derived',
    max_unlock_ms: null,
    unlock: LOCKED,
    generations: [key(2, 'active')],
    holders: null,
    recovery: null,
    transition: null,
    caller: { holder: true, ready_copy: true, admin: false },
    ...overrides,
  }
}

async function render(value: BucketEncryptionResponse, outcomeUnknown = false) {
  const { root } = await mountApp(access, {
    props: { bucket: 'reef', status: value, busy: false, outcomeUnknown, unlock, extend, lock },
  })
  return root
}

function row(root: Awaited<ReturnType<typeof render>>, generation: number) {
  return element(root, (node) => node.tag === 'li' && node.props['data-generation'] === generation)
}

beforeEach(() => {
  unlock.mockReset()
  extend.mockReset().mockResolvedValue(null)
  lock.mockReset().mockResolvedValue(null)
})

describe('bucket key access', () => {
  it('lists each key the node still needs with its role, fingerprint and lock state', async () => {
    const root = await render(status({ generations: [key(3, 'active', OPEN), key(2, 'source')] }))

    expect(content(row(root, 3))).toContain('Active key')
    expect(content(row(root, 3))).toContain('fingerprint-3')
    expect(content(row(root, 3))).toContain('Timed unlock')
    expect(content(row(root, 2))).toContain('Previous key')
    expect(content(row(root, 2))).toContain('Locked since restart')
    expect(content(row(root, 2))).toContain('needed until the stored versions are rewritten')
  })

  it('lets a key holder unlock the previous key of a bucket whose new writes are not encrypted', async () => {
    const off = status({ mode: 'off', public_key: null, fingerprint: null, unlock: null, generations: [key(1, 'source')] })
    const root = await render({ ...off, caller: { holder: true, ready_copy: false, admin: false } })

    await click(button(row(root, 1), 'Unlock'))

    expect(content(root)).toContain('unlock dialog for source 1')
  })

  it('says an extension the node did not answer may or may not have applied', async () => {
    extend.mockRejectedValueOnce(new Api.ApiError(503, 'unavailable'))
    const root = await render(status({ generations: [key(2, 'active', OPEN)] }))

    await click(button(root, 'Extend'))

    expect(content(root)).toContain('did not confirm this change')
  })

  it('extends the session of the chosen key and words a refused lock', async () => {
    lock.mockRejectedValueOnce(new Api.ApiError(409, 'conflict', 'session_mismatch'))
    const root = await render(status({ generations: [key(3, 'active'), key(2, 'source', OPEN)] }))

    await click(button(row(root, 2), 'Extend'))
    expect(content(root)).toContain('Locks every key of this bucket at once, previous keys included.')
    await click(button(root, 'Lock all keys'))

    expect(extend).toHaveBeenCalledWith(2, undefined)
    expect(lock).toHaveBeenCalledOnce()
    expect(content(root)).toContain('locked or unlocked again meanwhile')
  })

  it('holds back a second unlock while the last one is unconfirmed', async () => {
    const root = await render(status(), true)

    expect(button(root, 'Unlock').props.disabled).toBe(true)
  })

  it('offers a reader no key action and names a node that listed no generations', async () => {
    const reader = { holder: false, ready_copy: false, admin: false }
    const older = status({ caller: reader, generations: undefined, unlock: OPEN })
    const root = await render(older)

    expect(content(root)).toContain('No key action is open to you right now.')
    expect(content(root)).toContain('did not list its key generations')
    expect(content(row(root, 2))).toContain('Timed unlock')
  })
})
