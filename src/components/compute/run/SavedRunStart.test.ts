import { defineComponent, h, ref } from 'vue'
import * as VueRuntime from 'vue'
import { describe, expect, it } from 'vitest'
import * as Tes from '@/lib/tes'
import { compileClientComponent, content, mountApp, moduleDefault, nodes } from '@/test/clientRender'

const Slotted = (tag: string) =>
  defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h(tag, attrs, slots.default?.()) })
const Empty = defineComponent(() => () => null)
const IMAGE = 'harbor.computational.bio.uni-giessen.de/aruna/bakta-rs@sha256:2bf286e66203f8cd5dac0e5b08a7f75156f986330d437d6eef937a3b900f32cc'

function custom() {
  return {
    savedStart: ref({
      run: {
        name: 'Bakta annotation',
        task: { executors: [{ image: IMAGE }], inputs: [{ path: '/work/in/genome.fasta' }] },
        ask: { inputs: ['/work/in/genome.fasta'], results: false },
      },
      notes: [],
    }),
    inputs: ref([{ kind: 'folder', bucket: 'bakta-database', prefix: 'db/', name: 'db', basePath: '/work/in/db/', files: [], directory: true }]),
    outputRows: ref([]),
    openInputs: ref([]),
    resultsChosen: ref(false),
    bucketOptions: ref([]),
    envRows: ref([]),
    answerInput: () => {},
    chooseResults: () => {},
    editSaved: () => {},
  }
}

const component = compileClientComponent(new URL('./SavedRunStart.vue', import.meta.url), {
  vue: VueRuntime,
  '@/components/ui/Button.vue': moduleDefault(Slotted('button')),
  '@/components/ui/Input.vue': moduleDefault(Empty),
  '@/components/ui/Select.vue': moduleDefault(Empty),
  '@/components/compute/run/ResultsHome.vue': moduleDefault(Empty),
  '@/components/compute/TesDataRefDialog.vue': moduleDefault(Empty),
  '@/composables/useCustomRun': { injectCustomRun: custom, outputDestination: () => '' },
  '@/lib/tes': Tes,
  '@/lib/savedRuns': { isSecretName: () => false },
  '@lucide/vue': { Star: Empty },
})

describe('saved run start', () => {
  it('names the tool by its image name and keeps the full reference for hover', async () => {
    const { root } = await mountApp(component)
    const subtitle = nodes(root).find((node) => node.tag === 'p' && content(node).startsWith('Saved on this computer'))!

    expect(content(subtitle)).toBe('Saved on this computer, bakta-rs')
    expect(subtitle.props.title).toBe(IMAGE)
  })

  it('labels each input by its file name with the container path in small print', async () => {
    const { root } = await mountApp(component)
    const labels = nodes(root).filter((node) => node.tag === 'p' && String(node.props.class).includes('font-medium')).map(content)
    const paths = nodes(root).filter((node) => node.tag === 'p' && String(node.props.class).includes('text-[11px]')).map(content)

    expect(labels).toEqual(['genome.fasta', 'db'])
    expect(paths).toEqual(['/work/in/genome.fasta', '/work/in/db'])
  })
})

