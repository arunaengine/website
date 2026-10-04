import { defineComponent, h, ref } from 'vue'
import * as VueRuntime from 'vue'
import { describe, expect, it } from 'vitest'
import type { BucketCompressionResponse, BucketEncryptionResponse } from '@/lib/api'
import * as Wording from '@/lib/bucketEncryption'
import * as StateBadge from '@/lib/stateBadge'
import type { EncryptionLoadState } from '@/composables/useBucketEncryption'
import { compileClientComponent, content, mountApp, moduleDefault } from '@/test/clientRender'

const status = ref<BucketEncryptionResponse | null>(null)
const compression = ref<BucketCompressionResponse | null>(null)
const state = ref<EncryptionLoadState>('loading')

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

const tab = compileClientComponent(new URL('./BucketEncryptionTab.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => Slotted('i') }),
  '@/components/ui/Badge.vue': moduleDefault(Slotted('span')),
  '@/components/ui/DetailList.vue': moduleDefault(DetailStub),
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
      nodeId: ref('node-b'),
      load: () => undefined,
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

async function render(next: EncryptionLoadState, value: BucketEncryptionResponse | null = null) {
  state.value = next
  status.value = value
  compression.value = { bucket: 'reef', mode: 'zstd', level: 3, effective_level: 4 }
  const { root } = await mountApp(tab, { props: { bucket: 'reef', nodeId: 'node-b', groupId: 'g-1' } })
  return content(root)
}

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
})
