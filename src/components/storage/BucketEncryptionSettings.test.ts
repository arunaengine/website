import { defineComponent, h } from 'vue'
import * as VueRuntime from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as Api from '@/lib/api'
import type { BucketEncryptionResponse } from '@/lib/api'
import * as Wording from '@/lib/bucketEncryption'
import { button, click, compileClientComponent, content, element, flush, mountApp, moduleDefault } from '@/test/clientRender'

const save = vi.fn()
const rotate = vi.fn()

const Slotted = (tag: string) =>
  defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h(tag, attrs, slots.default?.()) })
const NoticeStub = defineComponent({
  props: { lines: Array },
  setup: (props, { slots }) => () =>
    h('aside', [slots.default?.(), ...((props.lines as string[] | undefined) ?? []).map((line) => h('p', line))]),
})
const DialogStub = defineComponent({
  props: { open: Boolean },
  setup: (props, { slots }) => () => (props.open ? h('div', { 'data-dialog': true }, slots.default?.()) : null),
})

const settings = compileClientComponent(new URL('./BucketEncryptionSettings.vue', import.meta.url), {
  vue: VueRuntime,
  '@/components/ui/Button.vue': moduleDefault(Slotted('button')),
  '@/components/ui/Dialog.vue': moduleDefault(DialogStub),
  '@/components/ui/DialogContent.vue': moduleDefault(Slotted('div')),
  '@/components/ui/DialogDescription.vue': moduleDefault(Slotted('p')),
  '@/components/ui/DialogFooter.vue': moduleDefault(Slotted('footer')),
  '@/components/ui/DialogHeader.vue': moduleDefault(Slotted('header')),
  '@/components/ui/DialogTitle.vue': moduleDefault(Slotted('h2')),
  '@/components/ui/Notice.vue': moduleDefault(NoticeStub),
  '@/components/ui/Select.vue': moduleDefault(Slotted('select')),
  '@/lib/bucketEncryption': Wording,
})

function status(overrides: Partial<BucketEncryptionResponse> = {}): BucketEncryptionResponse {
  return {
    bucket: 'reef',
    mode: 'node_managed',
    bucket_id: 'B1',
    storage_generation: 1,
    key_generation: 5,
    public_key: 'PK',
    fingerprint: 'ff',
    cipher: 'chacha20_poly1305',
    block_keys: 'content_derived',
    max_unlock_ms: null,
    unlock: { state: 'locked', lock_reason: 'manual', locked_at_ms: 1, session_id: null, unlocked_at_ms: null, deadline_ms: null, max_deadline_ms: null },
    holders: null,
    recovery: null,
    transition: null,
    caller: { holder: true, ready_copy: true, admin: true },
    ...overrides,
  }
}

const UNLOCKED = { state: 'unlocked' as const, lock_reason: null, locked_at_ms: null, session_id: 'S', unlocked_at_ms: 1, deadline_ms: null, max_deadline_ms: null }

async function render(value: BucketEncryptionResponse) {
  const { root } = await mountApp(settings, { props: { status: value, busy: false, save, rotate } })
  return root
}

function dialog(root: Awaited<ReturnType<typeof render>>) {
  return element(root, (node) => node.props['data-dialog'] === true)
}

async function choose(root: Awaited<ReturnType<typeof render>>, label: string, value: string) {
  const select = element(root, (node) => node.tag === 'select' && node.props['aria-label'] === label)
  ;(select.props['onUpdate:modelValue'] as (next: string) => void)(value)
  await flush()
}

beforeEach(() => {
  save.mockReset().mockResolvedValue(undefined)
  rotate.mockReset().mockResolvedValue(undefined)
})

describe('bucket encryption settings', () => {
  it('holds back a change that needs the key while the bucket is locked', async () => {
    const root = await render(status())

    await choose(root, 'Encryption mode', 'vault_locked')

    expect(content(root)).toContain('Unlock the bucket first')
    expect(content(root)).toContain('the node copy is removed')
    expect(button(root, 'Save changes').props.disabled).toBe(true)
    expect(button(root, 'Rotate key').props.disabled).toBe(true)
  })

  it('confirms a change with its notes and sends the key generation it saw', async () => {
    const root = await render(status({ mode: 'off', unlock: null }))

    await choose(root, 'Encryption mode', 'vault_locked')
    await click(button(root, 'Save changes'))
    expect(content(root)).toContain('no unlock is needed')
    expect(content(root)).toContain('A node restart locks the bucket.')
    await click(button(dialog(root), 'Save'))

    expect(save).toHaveBeenCalledWith({
      mode: 'vault_locked',
      cipher: 'chacha20_poly1305',
      block_keys: 'content_derived',
      max_unlock_ms: null,
      expected_generation: 5,
    })
  })

  it('rotates an unlocked bucket after the backup warning and words a refusal', async () => {
    rotate.mockRejectedValueOnce(new Api.ApiError(409, 'busy', 'open_uploads'))
    const root = await render(status({ unlock: UNLOCKED }))

    await click(button(root, 'Rotate key'))
    expect(content(root)).toContain('does not invalidate an old backup')
    await click(button(dialog(root), 'Rotate'))

    expect(rotate).toHaveBeenCalledOnce()
    expect(content(root)).toContain('Uploads to this bucket are still open')
  })
})
