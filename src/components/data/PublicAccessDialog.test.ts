import { computed, defineComponent, h, ref } from 'vue'
import * as VueRuntime from 'vue'
import { describe, expect, it, vi } from 'vitest'
import * as PublicAccessLib from '@/lib/publicAccess'
import * as Utils from '@/lib/utils'
import { button, click, compileClientComponent, content, element, mountApp, moduleDefault, nodes } from '@/test/clientRender'

const Slotted = (tag: string) =>
  defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h(tag, attrs, slots.default?.()) })
const DialogStub = defineComponent({
  props: { open: Boolean },
  setup: (props, { slots }) => () => (props.open ? h('div', slots.default?.()) : null),
})
const IconStub = defineComponent((_, { attrs }) => () => h('i', attrs))
const ButtonStub = defineComponent({
  inheritAttrs: false,
  props: { variant: String, size: String, disabled: Boolean },
  setup: (props, { attrs, slots }) => () => h('button', { ...attrs, disabled: props.disabled }, slots.default?.()),
})

const dialog = compileClientComponent(new URL('./PublicAccessDialog.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { RouterLink: defineComponent({ props: { to: Object }, setup: (props, { slots }) => () => h('a', { 'data-to': JSON.stringify(props.to) }, slots.default?.()) }) },
  '@lucide/vue': new Proxy({}, { get: () => IconStub }),
  '@/components/ui/CopyButton.vue': moduleDefault(defineComponent({ props: { value: String, label: String }, setup: (props) => () => h('button', { 'data-copy': props.value }, props.label) })),
  '@/components/ui/Badge.vue': moduleDefault(Slotted('span')),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Dialog.vue': moduleDefault(DialogStub),
  '@/components/ui/DialogClose.vue': moduleDefault(Slotted('span')),
  '@/components/ui/DialogContent.vue': moduleDefault(Slotted('div')),
  '@/components/ui/DialogDescription.vue': moduleDefault(Slotted('p')),
  '@/components/ui/DialogFooter.vue': moduleDefault(Slotted('div')),
  '@/components/ui/DialogHeader.vue': moduleDefault(Slotted('div')),
  '@/components/ui/DialogTitle.vue': moduleDefault(Slotted('h2')),
  '@/components/ui/DocsLink.vue': moduleDefault(Slotted('a')),
  '@/components/ui/Notice.vue': moduleDefault(Slotted('div')),
  '@/components/ui/Spinner.vue': moduleDefault(Slotted('i')),
  '@/composables/s3/endpoints': { endpointForNode: () => 'https://s3.node-1.example/' },
  '@/lib/publicAccess': PublicAccessLib,
  '@/lib/utils': Utils,
})

const ROOT = '/realm-1/g/g-1/data/node-1'

function fakeAccess(rules: string[], canManage = true) {
  const roles = ref(rules.length ? [{ role_id: 'r', name: 'public', permissions: Object.fromEntries(rules.map((rule) => [rule, 'read'])), public: true }] : [])
  return {
    detail: ref({ group_id: 'g-1' }),
    loading: ref(false),
    error: ref<string | null>(null),
    canManage: ref(canManage),
    groupName: ref('Reef lab'),
    role: computed(() => roles.value[0] ?? null),
    root: () => ROOT,
    pathOf: (_node: string | null, target: PublicAccessLib.PublicTarget) => PublicAccessLib.targetPath(ROOT, target),
    rulesFor: (_node: string | null, target: PublicAccessLib.PublicTarget) =>
      PublicAccessLib.coveringRules(roles.value, PublicAccessLib.targetPath(ROOT, target)),
    grant: vi.fn().mockResolvedValue(undefined),
    revoke: vi.fn().mockResolvedValue(undefined),
  }
}

async function render(access: ReturnType<typeof fakeAccess>, targets: PublicAccessLib.PublicTarget[]) {
  const closed: boolean[] = []
  const changed = vi.fn()
  const host = defineComponent({
    setup: () => () =>
      h(dialog, {
        open: true,
        access,
        nodeId: null,
        targets,
        'onUpdate:open': (value: boolean) => closed.push(value),
        onChanged: changed,
      }),
  })
  const { root, errors } = await mountApp(host)
  expect(errors).toEqual([])
  return { root, closed, changed }
}

const FILE: PublicAccessLib.PublicTarget = { kind: 'file', bucket: 'reef', key: 'raw/reads.fastq' }
const FOLDER: PublicAccessLib.PublicTarget = { kind: 'folder', bucket: 'reef', key: 'raw/' }

describe('public access dialog', () => {
  it('grants read to private targets through the group role', async () => {
    const access = fakeAccess([])
    const { root, closed, changed } = await render(access, [FILE, FOLDER])

    expect(content(root)).toContain('the file raw/reads.fastq')
    expect(content(root)).toContain('private')
    expect(content(root)).toContain('created when needed')
    expect(nodes(root).some((node) => node.props['data-copy'])).toBe(false)
    expect(button(root, 'Remove public access').props.disabled).toBe(true)

    await click(button(root, 'Make public'))

    expect(access.grant).toHaveBeenCalledWith(null, [FILE, FOLDER])
    expect(changed).toHaveBeenCalledTimes(1)
    expect(closed).toEqual([false])
  })

  it('explains a file that is public through its folder', async () => {
    const access = fakeAccess([`${ROOT}/reef/raw/**`])
    const { root } = await render(access, [FILE])

    expect(content(root)).toContain('public')
    expect(content(root)).toContain('Through the rule on reef/raw/')
    expect(button(root, 'Make public').props.disabled).toBe(true)
    const copy = element(root, (node) => Boolean(node.props['data-copy']))
    expect(copy.props['data-copy']).toBe('https://s3.node-1.example/reef/raw/reads.fastq')
    const link = element(root, (node) => node.tag === 'a' && content(node) === 'public')
    expect(JSON.parse(String(link.props['data-to']))).toEqual({ name: 'group', params: { id: 'g-1' }, query: { tab: 'roles' } })

    await click(button(root, 'Remove public access'))

    expect(access.revoke).toHaveBeenCalledWith(null, [FILE])
  })

  it('keeps a non-admin from changing anything', async () => {
    const access = fakeAccess([], false)
    const { root } = await render(access, [FILE])

    expect(content(root)).toContain('Only group admins can change public access.')
    expect(button(root, 'Make public').props.disabled).toBe(true)
    expect(button(root, 'Remove public access').props.disabled).toBe(true)
  })

  it('shows the failure and stays open', async () => {
    const access = fakeAccess([])
    access.grant.mockRejectedValueOnce(new Error('role limit reached'))
    const { root, closed } = await render(access, [FILE])

    await click(button(root, 'Make public'))

    expect(content(root)).toContain('role limit reached')
    expect(closed).toEqual([])
  })
})
