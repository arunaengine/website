import { defineComponent, h, ref } from 'vue'
import * as VueRuntime from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BucketHolderEntry, BucketHoldersResponse } from '@/lib/api'
import * as Wording from '@/lib/bucketEncryption'
import * as StateBadge from '@/lib/stateBadge'
import * as Utils from '@/lib/utils'
import { listedRecovery, recoveryAfter, type HoldersState } from '@/composables/useBucketHolders'
import { button, click, compileClientComponent, content, element, mountApp, moduleDefault } from '@/test/clientRender'

const holders = ref<BucketHoldersResponse | null>(null)
const state = ref<HoldersState>('ready')
const remove = vi.fn()

const Slotted = (tag: string) =>
  defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h(tag, attrs, slots.default?.()) })
const DialogStub = defineComponent({
  props: { open: Boolean },
  setup: (props, { slots }) => () => (props.open ? h('div', { 'data-dialog': true }, slots.default?.()) : null),
})

const section = compileClientComponent(new URL('./BucketHoldersSection.vue', import.meta.url), {
  vue: VueRuntime,
  '@vueuse/core': { useDebounceFn: (run: (...args: unknown[]) => unknown) => run },
  '@/components/ui/Badge.vue': moduleDefault(Slotted('span')),
  '@/components/ui/Button.vue': moduleDefault(Slotted('button')),
  '@/components/ui/Dialog.vue': moduleDefault(DialogStub),
  '@/components/ui/DialogContent.vue': moduleDefault(Slotted('div')),
  '@/components/ui/DialogDescription.vue': moduleDefault(Slotted('p')),
  '@/components/ui/DialogFooter.vue': moduleDefault(Slotted('footer')),
  '@/components/ui/DialogHeader.vue': moduleDefault(Slotted('header')),
  '@/components/ui/DialogTitle.vue': moduleDefault(Slotted('h2')),
  '@/components/ui/Input.vue': moduleDefault(Slotted('input')),
  '@/components/ui/Notice.vue': moduleDefault(Slotted('aside')),
  '@/components/ui/Spinner.vue': moduleDefault(defineComponent(() => () => h('span', 'loading'))),
  '@/composables/useAruna': { useAruna: () => ({ searchUsers: async () => ({ users: [] }) }) },
  '@/composables/useBucketHolders': {
    listedRecovery,
    recoveryAfter,
    useBucketHolders: () => ({ holders, state, error: ref('The directory did not answer.'), load: vi.fn(), grant: vi.fn(), remove }),
  },
  '@/lib/bucketEncryption': Wording,
  '@/lib/stateBadge': StateBadge,
  '@/lib/utils': Utils,
})

function holder(userId: string, overrides: Partial<BucketHolderEntry> = {}): BucketHolderEntry {
  return { user_id: userId, name: userId, origin: 'explicit', state: 'ready', has_recovery: false, granted_by: null, granted_at_ms: null, ...overrides }
}

async function render(entries: BucketHolderEntry[], canManage = true, complete = true) {
  const recovery = { state: complete ? ('met' as const) : ('degraded' as const), ready_holders: 2, ready_with_recovery: 0 }
  holders.value = { holders: entries, complete, unresolved: complete ? 0 : 2, recovery, revision: 'rev-1' }
  const source = { client: () => ({}), binder: () => () => true, load: async () => undefined }
  const { root } = await mountApp(section, { props: { bucket: 'reef', canManage, source } })
  return root
}

function rowButton(root: Awaited<ReturnType<typeof render>>, name: string) {
  const row = element(root, (node) => node.tag === 'li' && content(node).startsWith(name))
  return button(row, 'Remove')
}

beforeEach(() => {
  state.value = 'ready'
  remove.mockReset().mockResolvedValue('removed')
})

describe('bucket key holder list', () => {
  it('shows each holder with origin, readiness and recovery code, and removes only grants', async () => {
    const root = await render([
      holder('Ada', { origin: 'creator', has_recovery: true }),
      holder('Bo', { state: 'missing_key', has_recovery: null }),
      holder('Cy', { state: 'pending' }),
    ])
    const text = content(root)

    expect(text).toContain('Creator')
    expect(text).toContain('No usable key')
    expect(text).toContain('Recovery code: unknown')
    expect(text).toContain('Recovery: Met')
    expect(text).toContain('does not erase copies')
    expect(() => rowButton(root, 'Ada')).toThrow()
    await click(rowButton(root, 'Cy'))
    expect(remove).toHaveBeenCalledWith('Cy', false)
  })

  it('asks before a removal that breaks recovery and sends the confirmation', async () => {
    const root = await render([holder('Ada'), holder('Bo')])

    await click(rowButton(root, 'Bo'))
    expect(remove).not.toHaveBeenCalled()
    expect(content(root)).toContain('the recovery rule is not met')
    expect(content(root)).toContain('If the remaining usable key is then lost too')
    expect(button(root, 'Remove anyway').props.disabled).toBe(true)
    await click(element(root, (node) => node.tag === 'input' && node.props.type === 'checkbox'))
    await click(button(root, 'Remove anyway'))

    expect(remove).toHaveBeenCalledWith('Bo', true)
  })

  it('marks a partial list and asks before a removal whose effect cannot be verified', async () => {
    const root = await render([holder('Ada'), holder('Bo')], true, false)

    expect(content(root)).toContain('2 key holders could not be looked up, so this list is partial.')
    expect(content(root)).toContain('Recovery: Unknown')
    await click(rowButton(root, 'Bo'))

    expect(remove).not.toHaveBeenCalled()
    expect(content(root)).toContain('the recovery rule cannot be verified')
    expect(content(root)).toContain('I accept that recovery cannot be verified.')
  })

  it('asks when the node says the removal breaks recovery', async () => {
    remove.mockResolvedValueOnce('confirm')
    const root = await render([holder('Ada'), holder('Bo'), holder('Cy')])

    await click(rowButton(root, 'Cy'))

    expect(remove).toHaveBeenCalledWith('Cy', false)
    expect(content(root)).toContain('Remove Cy?')
  })

  it('offers no changes to a key holder who is not a group admin', async () => {
    const root = await render([holder('Ada'), holder('Bo')], false)

    expect(content(root)).not.toContain('Grant a key holder')
    expect(() => rowButton(root, 'Bo')).toThrow()
  })

  it('never shows a holder list it could not read as empty', async () => {
    state.value = 'failed'
    holders.value = null
    const source = { client: () => ({}), binder: () => () => true, load: async () => undefined }
    const { root } = await mountApp(section, { props: { bucket: 'reef', canManage: true, source } })

    expect(content(root)).toContain('The key holders are unknown.')
    expect(content(root)).not.toContain('no key holders')
  })
})
