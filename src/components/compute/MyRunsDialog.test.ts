import { defineComponent, h, ref } from 'vue'
import * as VueRuntime from 'vue'
import { describe, expect, it, vi } from 'vitest'
import * as SavedRuns from '@/lib/savedRuns'
import { button, click, compileClientComponent, content, element, flush, mountApp, moduleDefault } from '@/test/clientRender'

const Slotted = (tag: string) =>
  defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h(tag, attrs, slots.default?.()) })
const run = (id: string, name: string) => ({ id, name, savedAt: '', task: { executors: [{ image: 'a', command: ['sh'] }] }, ask: { inputs: [], results: false } })
const runs = ref([run('r1', 'Align'), run('r2', 'Count')])
const store = {
  runs,
  failure: ref<string | null>(null),
  remove: vi.fn((id: string) => (runs.value = runs.value.filter((entry) => entry.id !== id))),
  exportFile: vi.fn(),
  importFile: vi.fn(async () => (runs.value = [...runs.value, run('r3', 'Trim'), run('r4', 'Sort')])),
}

const component = compileClientComponent(new URL('./MyRunsDialog.vue', import.meta.url), {
  vue: VueRuntime,
  '@/components/ui/Button.vue': moduleDefault(Slotted('button')),
  '@/components/ui/Dialog.vue': moduleDefault(Slotted('div')),
  '@/components/ui/DialogContent.vue': moduleDefault(Slotted('div')),
  '@/components/ui/DialogDescription.vue': moduleDefault(Slotted('p')),
  '@/components/ui/DialogHeader.vue': moduleDefault(Slotted('header')),
  '@/components/ui/DialogTitle.vue': moduleDefault(Slotted('h2')),
  '@/components/ui/Notice.vue': moduleDefault(Slotted('aside')),
  '@/composables/useSavedRuns': { useSavedRuns: () => store },
  '@/lib/savedRuns': SavedRuns,
  '@/lib/utils': { errorMessage: (cause: unknown) => String(cause) },
})

describe('my runs dialog', () => {
  it('says what remove, export and import did', async () => {
    const { root } = await mountApp(component, { props: { open: true } })

    await click(element(root, (node) => node.tag === 'button' && content(node) === 'Remove'))
    expect(content(root)).toContain('Removed Align.')

    await click(button(root, 'Export as file'))
    expect(content(root)).toContain('Exported 1 run to my-runs.json.')

    const picker = element(root, (node) => node.tag === 'input')
    await (picker.props.onChange as (event: unknown) => Promise<void>)({ target: { files: [new File(['{}'], 'my-runs.json')], value: 'x' } })
    await flush()
    expect(content(root)).toContain('Imported 2 runs.')
  })
})
