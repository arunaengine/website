import { defineComponent, h, ref } from 'vue'
import * as VueRuntime from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BucketCompressionResponse, BucketEncryptionResponse } from '@/lib/api'
import * as Wording from '@/lib/bucketEncryption'
import * as StateBadge from '@/lib/stateBadge'
import type { EncryptionLoadState } from '@/composables/useBucketEncryption'
import { click, compileClientComponent, content, element, mountApp, moduleDefault } from '@/test/clientRender'

const status = ref<BucketEncryptionResponse | null>(null)
const compression = ref<BucketCompressionResponse | null>(null)
const state = ref<EncryptionLoadState>('loading')
const outcomeUnknown = ref(false)

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

const KeyAccessStub = defineComponent({
  props: { status: Object },
  setup: (props) => () => h('section', `key access for ${(props.status as BucketEncryptionResponse).bucket}`),
})

const load = vi.fn()

const tab = compileClientComponent(new URL('./BucketEncryptionTab.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => Slotted('i') }),
  '@/components/storage/BucketEncryptionSettings.vue': moduleDefault(
    defineComponent({ props: { busy: Boolean }, setup: (props) => () => h('section', `mode settings, busy ${props.busy}`) }),
  ),
  '@/components/storage/BucketHoldersSection.vue': moduleDefault(defineComponent(() => () => h('section', 'holder list'))),
  '@/components/storage/BucketKeyAccess.vue': moduleDefault(KeyAccessStub),
  '@/components/storage/BucketTokensSection.vue': moduleDefault(defineComponent(() => () => h('section', 'token list'))),
  '@/components/ui/Badge.vue': moduleDefault(Slotted('span')),
  '@/components/ui/DetailList.vue': moduleDefault(DetailStub),
  '@/components/ui/DocsLink.vue': moduleDefault(Slotted('a')),
  '@/components/ui/NodeLabel.vue': moduleDefault(Slotted('span')),
  '@/components/ui/Notice.vue': moduleDefault(NoticeStub),
  '@/components/ui/RefreshButton.vue': moduleDefault(Slotted('button')),
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
      load,
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

beforeEach(() => {
  outcomeUnknown.value = false
  load.mockReset()
})

describe('bucket encryption tab', () => {
  it('never shows an unreported state as encryption off', async () => {
    expect(await render('loading')).toContain('loading placeholder')
    const missing = await render('missing')
    expect(missing).toContain('does not report its encryption')
    expect(missing).not.toContain('Off')
    expect(await render('failed')).toContain('unknown until the node answers')
  })

  it('keeps the unconfirmed unlock and a way to read again when the state read fails', async () => {
    outcomeUnknown.value = true
    const root = await mount('failed')

    expect(content(root)).toContain('The last unlock was not confirmed')
    expect(content(root)).toContain('Unlocking stays blocked')
    await click(element(root, (node) => node.props.label === 'Read the state again'))
    expect(load).toHaveBeenCalledOnce()
  })

  it('keeps the settings draft owner mounted and holds back changes while the state is out of date', async () => {
    const admin = { holder: true, ready_copy: true, admin: true }
    const text = await render('stale', encrypted({ caller: admin }))

    expect(text).toContain('This state may be out of date')
    expect(text).toContain('The node did not answer.')
    expect(text).toContain('Unknown')
    expect(text).not.toContain('Locked since restart')
    expect(text).toContain('mode settings, busy true')
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
    const plain = { mode: 'off' as const, unlock: null, public_key: null, fingerprint: null, generations: [] }
    const text = await render('ready', encrypted(plain))

    expect(text).toContain('Mode: Off')
    expect(text).toContain('Not encrypted')
    expect(text).not.toContain('key access')
    expect(text).not.toContain('Key fingerprint')
    expect(text).toContain('Compression: zstd level 3')
    expect(text).not.toContain('applied as level')
  })

  it('keeps the previous key of a decrypting bucket within reach', async () => {
    const source = { generation: 1, role: 'source' as const, public_key: 'PK1', fingerprint: 'f1', unlock: encrypted().unlock! }
    const off = { mode: 'off' as const, unlock: null, public_key: null, fingerprint: null, generations: [source] }
    const text = await render('ready', encrypted(off))

    expect(text).toContain('Decrypting')
    expect(text).toContain('reading them needs an unlock')
    expect(text).not.toContain('readable without a key')
    expect(text).toContain('key access for reef')
    expect(text).toContain('holder list')
  })

  it('offers a reader neither holders nor settings', async () => {
    const reader = { holder: false, ready_copy: false, admin: false }
    const text = await render('ready', encrypted({ caller: reader }))

    expect(text).not.toContain('holder list')
    expect(text).not.toContain('token list')
    expect(text).not.toContain('mode settings')
    expect(await render('ready', encrypted())).toContain('holder list')
    expect(await render('ready', encrypted())).toContain('token list')
    const groupAdmin = { holder: false, ready_copy: false, admin: true }
    expect(await render('ready', encrypted({ caller: groupAdmin }))).toContain('token list')
    const admin = { holder: false, ready_copy: false, admin: true }
    expect(await render('ready', encrypted({ mode: 'off', caller: admin }))).toContain('mode settings')
  })
})
