import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { describe, expect, it } from 'vitest'
import * as FileGroups from '@/lib/fileGroups'
import * as Tes from '@/lib/tes'
import { button, click, compileClientComponent, content, moduleDefault, mountApp, nodes } from '@/test/clientRender'
import type { TesDataRefEntry } from '@/lib/tes'

const Stub = defineComponent((_, { attrs, slots }) => () => h('div', attrs, slots.default?.()))
const ButtonStub = defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()) })
const InputStub = defineComponent((_, { attrs }) => () => h('input', attrs))

const Editor = compileClientComponent(new URL('./TesInputsEditor.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => Stub }),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Input.vue': moduleDefault(InputStub),
  '@/components/ui/Badge.vue': moduleDefault(Stub),
  '@/components/compute/InputLocalityHint.vue': moduleDefault(Stub),
  '@/composables/useRealmNodes': { useRealmNodes: () => ({ displayName: (id: string) => id, isLocalNode: () => false }) },
  '@/lib/fileGroups': FileGroups,
  '@/lib/tes': Tes,
})

const pin = (key: string) => `arn:aruna:realm-1:node-2:s3/bakta-database/db/${key}@01M69M40GW80DTHHG98J4653CV`
const GENOME: TesDataRefEntry = { kind: 'file', url: 's3://genomes/genome.fna', path: '/work/in/genome.fna', name: 'genome.fna' }
const DATABASE: TesDataRefEntry[] = Array.from({ length: 66 }, (_, index) => ({
  kind: 'file',
  url: pin(`part-${index}.bin`),
  path: `/work/in/db/part-${index}.bin`,
  name: `db/part-${index}.bin`,
}))

async function mount() {
  const entries = ref<TesDataRefEntry[]>([GENOME, ...DATABASE])
  const Harness = defineComponent(() => () =>
    h(Editor, { modelValue: entries.value, 'onUpdate:modelValue': (next: TesDataRefEntry[]) => (entries.value = next) }),
  )
  return { ...(await mountApp(Harness)), entries }
}
const pathFields = (root: Parameters<typeof nodes>[0]) => nodes(root).filter((node) => node.tag === 'input' && node.props['aria-label'] === 'Container path')

describe('run input editor', () => {
  it('folds the many files of one bucket folder into one row that opens to them', async () => {
    const mounted = await mount()

    expect(content(mounted.root)).toContain('bakta-database/db/66 files')
    expect(content(mounted.root)).toContain('on node-2')
    expect(pathFields(mounted.root).map((node) => node.props['model-value'])).toEqual(['/work/in/genome.fna'])

    await click(button(mounted.root, 'bakta-database/db/'))
    expect(pathFields(mounted.root)).toHaveLength(67)
    mounted.app.unmount()
  })

  it('removes every file of a folded row at once and keeps the single file', async () => {
    const mounted = await mount()

    const remove = nodes(mounted.root).find((node) => node.tag === 'button' && node.props['aria-label'] === 'Remove these inputs')!
    await click(remove)
    expect(mounted.entries.value).toEqual([GENOME])
    mounted.app.unmount()
  })
})
