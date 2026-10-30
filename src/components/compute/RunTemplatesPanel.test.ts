import { defineComponent, h, ref } from 'vue'
import * as VueRuntime from 'vue'
import { describe, expect, it, vi } from 'vitest'
import * as SavedRuns from '@/lib/savedRuns'
import { RUN_TEMPLATES } from '@/lib/runTemplates'
import { button, click, compileClientComponent, content, element, mountApp, moduleDefault, nodes } from '@/test/clientRender'

const Slotted = (tag: string) =>
  defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h(tag, attrs, [slots.default?.(), slots.actions?.()]) })
const run = (id: string, name: string) => ({
  id, name, savedAt: '', task: { executors: [{ image: 'quay.io/biocontainers/bakta:1.12', command: ['bakta'] }] }, ask: { inputs: [], results: true },
})
const runs = ref([run('r1', 'Bakta annotation')])
const store = {
  runs,
  failure: ref<string | null>(null),
  remove: vi.fn((id: string) => (runs.value = runs.value.filter((entry) => entry.id !== id))),
  exportFile: vi.fn(),
  importFile: vi.fn(),
}
const push = vi.fn()

const component = compileClientComponent(new URL('./RunTemplatesPanel.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => defineComponent(() => () => h('i')) }),
  'vue-router': { useRouter: () => ({ push }) },
  '@/components/ui/Button.vue': moduleDefault(Slotted('button')),
  '@/components/ui/IconButton.vue': moduleDefault(defineComponent({ props: ['label'], setup: (props, { attrs }) => () => h('button', { ...attrs, 'aria-label': props.label }) })),
  '@/components/ui/Notice.vue': moduleDefault(Slotted('aside')),
  '@/components/ui/SectionHeading.vue': moduleDefault(Slotted('header')),
  '@/components/compute/KindTile.vue': moduleDefault(Slotted('span')),
  '@/composables/useSavedRuns': { useSavedRuns: () => store },
  '@/lib/savedRuns': SavedRuns,
  '@/lib/runTemplates': { RUN_TEMPLATES },
  '@/lib/utils': { errorMessage: (cause: unknown) => String(cause) },
})

describe('run templates panel', () => {
  it('lists own and built-in templates with their source and starts each one', async () => {
    const { root } = await mountApp(component)
    const rows = nodes(root).filter((node) => node.tag === 'tr').slice(1).map(content)

    expect(rows).toHaveLength(1 + RUN_TEMPLATES.length)
    expect(rows[0]).toContain('Bakta annotation')
    expect(rows[0]).toContain('Me')
    expect(rows[0]).toContain('bakta:1.12')
    expect(rows[0]).toContain('results folder')
    expect(rows.slice(1).every((row) => row.includes('Built in'))).toBe(true)
    expect(content(root)).toContain(`${1 + RUN_TEMPLATES.length} run templates, 1 by me`)

    await click(button(root, 'Start'))
    expect(push).toHaveBeenCalledWith({ name: 'compute-new', query: { saved: 'r1' } })

    await click(element(root, (node) => node.tag === 'button' && node.props['aria-label'] === 'Remove Bakta annotation'))
    expect(store.remove).toHaveBeenCalledWith('r1')
    expect(content(root)).toContain('Removed Bakta annotation.')
  })
})
