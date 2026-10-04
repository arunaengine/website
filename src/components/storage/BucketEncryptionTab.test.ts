import { defineComponent, h, ref } from 'vue'
import * as VueRuntime from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as Api from '@/lib/api'
import type { BucketCompressionResponse, BucketEncryptionResponse } from '@/lib/api'
import * as Wording from '@/lib/bucketEncryption'
import * as StateBadge from '@/lib/stateBadge'
import type { EncryptionLoadState } from '@/composables/useBucketEncryption'
import { button, click, compileClientComponent, content, mountApp, moduleDefault } from '@/test/clientRender'

const status = ref<BucketEncryptionResponse | null>(null)
const compression = ref<BucketCompressionResponse | null>(null)
const state = ref<EncryptionLoadState>('loading')
const outcomeUnknown = ref(false)
const lock = vi.fn()
const extend = vi.fn()
const unlock = vi.fn()

const Slotted = (tag: string) =>
  defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h(tag, attrs, slots.default?.()) })
const NoticeStub = defineComponent({
  props: { title: String, lines: Array },
  setup: (props, { slots }) => () =>
    h('aside', [props.title, slots.default?.(), ...((props.lines as string[] | undefined) ?? []).map((line) => h('p', line))]),
})
const DetailStub = defineComponent({
  props: { items: Array },
  setup: (props) => () =>
    h('dl', (props.items as { label: string; value: string }[]).map((item) => h('p', `${item.label}: ${item.value}`))),
})

const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})
const DialogStub = defineComponent({
  props: { open: Boolean },
  setup: (props) => () => h('div', props.open ? 'unlock dialog open' : ''),
})

const tab = compileClientComponent(new URL('./BucketEncryptionTab.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => Slotted('i') }),
  '@/components/storage/BucketHoldersSection.vue': moduleDefault(defineComponent(() => () => h('section', 'holder list'))),
  '@/components/storage/BucketUnlockDialog.vue': moduleDefault(DialogStub),
  '@/components/ui/Badge.vue': moduleDefault(Slotted('span')),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/DetailList.vue': moduleDefault(DetailStub),
  '@/components/ui/NodeLabel.vue': moduleDefault(Slotted('span')),
  '@/components/ui/Notice.vue': moduleDefault(NoticeStub),
  '@/components/ui/RefreshButton.vue': moduleDefault(Slotted('button')),
  '@/components/ui/Select.vue': moduleDefault(Slotted('select')),
  '@/components/ui/SectionSkeleton.vue': moduleDefault(defineComponent(() => () => h('section', 'loading placeholder'))),
  '@/composables/useBucketEncryption': {
    useBucketEncryption: () => ({
      status,
      compression,
      state,
      error: ref('The node did not answer.'),
      refreshing: ref(false),
      busy: ref(null),
      outcomeUnknown,
      nodeId: ref('node-b'),
      load: () => undefined,
      lock,
      extend,
      unlock,
    }),
  },
  '@/lib/bucketEncryption': Wording,
  '@/lib/stateBadge': StateBadge,
})

function encrypted(overrides: Partial<BucketEncryptionResponse> = {}): BucketEncryptionResponse {
  return {
    bucket: 'reef',
    mode: 'vault_locked',
    bucket_id: 'B1',
    storage_generation: 1,
    key_generation: 2,
    public_key: 'PK',
    fingerprint: 'abcdef0123',
    cipher: 'chacha20_poly1305',
    block_keys: 'content_derived',
    max_unlock_ms: null,
    unlock: {
      state: 'locked',
      lock_reason: 'restart',
      locked_at_ms: 1,
      session_id: null,
      unlocked_at_ms: null,
      deadline_ms: null,
      max_deadline_ms: null,
    },
    holders: { ready: 1, pending: null, missing_key: 0 },
    recovery: { state: 'degraded', ready_holders: 1, ready_with_recovery: 0 },
    transition: null,
    caller: { holder: true, ready_copy: true, admin: false },
    ...overrides,
  }
}

async function mount(next: EncryptionLoadState, value: BucketEncryptionResponse | null = null) {
  state.value = next
  status.value = value
  compression.value = { bucket: 'reef', mode: 'zstd', level: 3, effective_level: 4 }
  const { root } = await mountApp(tab, { props: { bucket: 'reef', nodeId: 'node-b', groupId: 'g-1' } })
  return root
}

async function render(next: EncryptionLoadState, value: BucketEncryptionResponse | null = null) {
  return content(await mount(next, value))
}

const OPEN = {
  state: 'unlocked' as const,
  lock_reason: null,
  locked_at_ms: null,
  session_id: 'S1',
  unlocked_at_ms: 1,
  deadline_ms: 9_000,
  max_deadline_ms: null,
}

beforeEach(() => {
  outcomeUnknown.value = false
  lock.mockReset().mockResolvedValue(null)
})

describe('bucket encryption tab', () => {
  it('never shows an unreported state as encryption off', async () => {
    expect(await render('loading')).toContain('loading placeholder')
    const missing = await render('missing')
    expect(missing).toContain('does not report its encryption')
    expect(missing).not.toContain('Off')
    expect(await render('failed')).toContain('unknown until the node answers')
  })

  it('shows the lock state, key, format and recovery of a vault-locked bucket', async () => {
    const text = await render('ready', encrypted())

    expect(text).toContain('Locked since restart')
    expect(text).toContain('Key fingerprint: abcdef0123')
    expect(text).toContain('Cipher: ChaCha20-Poly1305')
    expect(text).toContain('Compression: zstd level 3, applied as level 4 in Pithos')
    expect(text).toContain('Key holders: 1 ready, 0 without a key, others unknown')
    expect(text).toContain('Not met')
    expect(text).toContain('you may unlock, extend and lock')
    expect(text).toContain('A node restart locks vault-locked buckets.')
  })

  it('keeps a rewrite open until its old copies are removed', async () => {
    const transition = {
      kind: 'encrypt' as const,
      state: 'finished' as const,
      source_generation: null,
      target_generation: 2,
      done: 12,
      remaining: 0,
      failed: 0,
      cleanup_remaining: 3,
      started_at_ms: 1,
      finished_at_ms: 2,
      blocked_reason: null,
    }
    const text = await render('ready', encrypted({ transition }))

    expect(text).toContain('Encrypting stored versions')
    expect(text).toContain('Cleanup open')
    expect(text).toContain('3 old copies to remove')
  })

  it('shows a plain bucket without key details', async () => {
    const text = await render('ready', encrypted({ mode: 'off', unlock: null, public_key: null, fingerprint: null }))

    expect(text).toContain('Mode: Off')
    expect(text).toContain('Not encrypted')
    expect(text).not.toContain('Key fingerprint')
    expect(text).toContain('Compression: zstd level 3')
    expect(text).not.toContain('applied as level')
  })

  it('offers a ready key holder the unlock dialog for a locked bucket', async () => {
    const root = await mount('ready', encrypted())

    expect(content(root)).not.toContain('Lock now')
    await click(button(root, 'Unlock'))
    expect(content(root)).toContain('unlock dialog open')
  })

  it('offers extend and lock while unlocked and words a refusal', async () => {
    lock.mockRejectedValueOnce(new Api.ApiError(409, 'conflict', 'session_mismatch'))
    const root = await mount('ready', encrypted({ unlock: OPEN }))

    expect(content(root)).toContain('Timed unlock')
    expect(content(root)).toContain('Extend')
    await click(button(root, 'Lock now'))

    expect(lock).toHaveBeenCalledOnce()
    expect(content(root)).toContain('locked or unlocked again meanwhile')
  })

  it('holds back a second unlock while the last one is unconfirmed', async () => {
    outcomeUnknown.value = true
    const root = await mount('ready', encrypted())

    expect(content(root)).toContain('The last unlock was not confirmed')
    expect(button(root, 'Unlock').props.disabled).toBe(true)
  })

  it('offers a reader no key action', async () => {
    const reader = { holder: false, ready_copy: false, admin: false }
    const text = await render('ready', encrypted({ unlock: OPEN, caller: reader }))

    expect(text).toContain('No key action is open to you right now.')
    expect(text).not.toContain('Lock now')
    expect(text).not.toContain('holder list')
    expect(await render('ready', encrypted())).toContain('holder list')
  })
})
