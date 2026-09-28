import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it } from 'vitest'
import { click, compileClientComponent, content, element, flush, moduleDefault, mountApp, type HostNode } from '@/test/clientRender'

const kinds = ref<Array<{ kind: string; capabilities: Record<string, boolean> }> | null>(null)
const Empty = defineComponent(() => () => null)
const Slot = defineComponent((_, { attrs, slots }) => () => h('div', attrs, slots.default?.()))
// A panel names itself and whether it is the one on screen.
function panel(name: string) {
  return defineComponent({
    props: { active: Boolean },
    emits: ['close'],
    setup: (props, { attrs, emit }) => () =>
      h('section', attrs, [`${name} ${props.active ? 'active' : 'waiting'}`, h('button', { onClick: () => emit('close') }, `Close ${name}`)]),
  })
}

const ImportDatasetDialog = compileClientComponent(new URL('./ImportDatasetDialog.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => Empty }),
  '@/components/ui/Dialog.vue': moduleDefault(Slot),
  '@/components/ui/DialogContent.vue': moduleDefault(Slot),
  '@/components/ui/DialogDescription.vue': moduleDefault(Slot),
  '@/components/ui/DialogHeader.vue': moduleDefault(Slot),
  '@/components/ui/DialogTitle.vue': moduleDefault(Slot),
  '@/components/metadata/CrateImportPanel.vue': moduleDefault(panel('Archive')),
  '@/components/metadata/RepositoryImportPanel.vue': moduleDefault(panel('Repository')),
  '@/composables/useRepository': { useRepositoryKinds: () => ({ kinds }) },
})

function card(root: HostNode, title: string): HostNode {
  return element(root, (node) => node.props.role === 'radio' && content(node).startsWith(title))
}

beforeEach(() => {
  kinds.value = null
})

describe('ImportDatasetDialog', () => {
  it('starts with the archive and switches to a repository record', async () => {
    const mounted = await mountApp(ImportDatasetDialog, { props: { open: true } })
    await flush()

    expect(card(mounted.root, 'RO-Crate archive').props['aria-checked']).toBe(true)
    expect(content(mounted.root)).toContain('Archive active')
    expect(content(mounted.root)).toContain('Repository waiting')
    await click(card(mounted.root, 'From a repository'))

    expect(card(mounted.root, 'From a repository').props['aria-checked']).toBe(true)
    expect(content(mounted.root)).toContain('Archive waiting')
    expect(content(mounted.root)).toContain('Repository active')
    mounted.app.unmount()
  })

  it('hides the repository card once the node offers no importing kind', async () => {
    kinds.value = [{ kind: 'invenio', capabilities: { import: false } }]
    const mounted = await mountApp(ImportDatasetDialog, { props: { open: true } })
    await flush()

    expect(content(mounted.root)).toContain('RO-Crate archive')
    expect(content(mounted.root)).not.toContain('From a repository')
    expect(content(mounted.root)).not.toContain('Repository')
    mounted.app.unmount()
  })

  it('closes when a panel is done', async () => {
    const updates: boolean[] = []
    const mounted = await mountApp(ImportDatasetDialog, {
      props: { open: true, 'onUpdate:open': (value: boolean) => updates.push(value) },
    })
    await flush()
    await click(element(mounted.root, (node) => node.tag === 'button' && content(node) === 'Close Archive'))

    expect(updates).toEqual([false])
    mounted.app.unmount()
  })
})
