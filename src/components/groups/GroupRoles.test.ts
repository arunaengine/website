import { defineComponent, h, ref } from 'vue'
import * as VueRuntime from 'vue'
import { describe, expect, it } from 'vitest'
import * as PermissionPaths from './permission-paths'
import * as Utils from '@/lib/utils'
import { button, click, compileClientComponent, content, element, mountApp, moduleDefault, nodes } from '@/test/clientRender'

const IconStub = defineComponent((_, { attrs }) => () => h('i', attrs))
const Slotted = (tag: string) =>
  defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h(tag, attrs, slots.default?.()) })
const BuilderStub = defineComponent({
  props: { role: Object, initialPublic: Boolean },
  setup: (props) => () => h('section', { 'data-builder': props.initialPublic ? 'public' : 'members' }, 'builder'),
})

const DialogStub = defineComponent({
  props: { open: Boolean },
  setup: (props, { slots }) => () => (props.open ? h('div', { role: 'dialog' }, slots.default?.()) : null),
})

const roles = compileClientComponent(new URL('./GroupRoles.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => IconStub }),
  '@/components/ui/Button.vue': moduleDefault(Slotted('button')),
  '@/components/ui/Badge.vue': moduleDefault(Slotted('span')),
  '@/components/ui/Dialog.vue': moduleDefault(DialogStub),
  '@/components/ui/DialogContent.vue': moduleDefault(Slotted('div')),
  '@/components/ui/DialogDescription.vue': moduleDefault(Slotted('p')),
  '@/components/ui/DialogHeader.vue': moduleDefault(Slotted('div')),
  '@/components/ui/DialogTitle.vue': moduleDefault(Slotted('h2')),
  './RoleBuilder.vue': moduleDefault(BuilderStub),
  './permission-paths': PermissionPaths,
  '@/composables/useAruna': { useAruna: () => ({ deleteGroupRole: () => Promise.resolve(), saving: ref(false) }) },
  '@/lib/utils': Utils,
})

const PREFIX = '/realm-1/g/g-1/'
const group = {
  display_name: 'Reef lab',
  group_id: 'g-1',
  realm_id: 'realm-1',
  roles: [
    { role_id: 'r-admin', name: 'admin', permissions: { [`${PREFIX}**`]: 'WRITE' }, assigned_users: ['u-1'] },
    {
      role_id: 'r-study',
      name: 'study',
      permissions: { [`${PREFIX}data/**`]: 'READ', [`${PREFIX}data/node-1/study/**`]: 'WRITE', [`${PREFIX}meta/reports/x`]: 'READ' },
      assigned_users: ['u-1', 'u-2'],
    },
    { role_id: 'r-public', name: 'public', permissions: { [`${PREFIX}data/node-1/open/**`]: 'READ' }, public: true },
  ],
}

async function render() {
  const host = defineComponent({ setup: () => () => h(roles, { group, canManage: true }) })
  const { root, errors } = await mountApp(host)
  expect(errors).toEqual([])
  return root
}

function headers(root: ReturnType<typeof nodes>[number]): string[] {
  return nodes(root).filter((node) => node.tag === 'th').map((node) => content(node).trim())
}

describe('group roles table', () => {
  it('keeps one column per broad scope and counts narrower paths as custom', async () => {
    const root = await render()

    expect(headers(root)).toEqual(['Role', 'everything', 'data', 'Custom', 'Assigned', 'Actions'])
    const study = element(root, (node) => node.tag === 'tr' && content(node).includes('study'))
    expect(content(study)).toContain('write')
    expect(content(study)).toContain('2 rules')
    expect(content(study)).not.toContain('files in "study/"')
    const open = element(root, (node) => node.tag === 'tr' && content(node).includes('public'))
    expect(content(open)).toContain('everyone')
    expect(content(open)).toContain('read')
    expect(content(open)).toContain('1 rule')
  })

  it('names every custom rule in a modal', async () => {
    const root = await render()
    expect(nodes(root).some((node) => node.props.role === 'dialog')).toBe(false)

    await click(element(root, (node) => node.props['aria-label'] === 'Show the custom rules of study'))

    const modal = element(root, (node) => node.props.role === 'dialog')
    expect(content(modal)).toContain('Custom rules of "study"')
    expect(content(modal)).toContain('files in "study/" on node node-1')
    expect(content(modal)).toContain('the dataset "reports/x"')
    expect(content(modal)).toContain(`${PREFIX}data/node-1/study/**`)
    expect(content(modal)).not.toContain('data/**\n')
  })

  it('opens the builder as a public role from its own button', async () => {
    const root = await render()

    await click(button(root, 'New public role'))

    expect(element(root, (node) => node.props['data-builder'] !== undefined).props['data-builder']).toBe('public')
  })
})
