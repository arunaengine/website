import { defineComponent, h, ref } from 'vue'
import * as VueRuntime from 'vue'
import { describe, expect, it, vi } from 'vitest'
import * as Sync from '@/lib/sync'
import * as Tes from '@/lib/tes'
import { outputFolder } from '@/composables/useCustomRun'
import { compileClientComponent, content, mountApp, moduleDefault, nodes } from '@/test/clientRender'

const Slotted = (tag: string) =>
  defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h(tag, attrs, slots.default?.()) })
const Empty = defineComponent(() => () => null)
const databaseRows = ref<unknown[]>([])
let extraInputs: unknown[] = []
let askResults = false
const chooseResults = vi.fn()
const SelectStub = defineComponent({
  emits: ['update:modelValue'],
  setup: (_, { emit }) => () => h('select', { onChange: (value: string) => emit('update:modelValue', value) }),
})
const HomeStub = defineComponent({
  emits: ['choose'],
  setup: (_, { emit }) => () => h('button', { onClick: () => emit('choose', 'linked', 'runs/') }, 'Linked folder'),
})
const IMAGE = 'harbor.computational.bio.uni-giessen.de/aruna/bakta-rs@sha256:2bf286e66203f8cd5dac0e5b08a7f75156f986330d437d6eef937a3b900f32cc'

function custom() {
  return {
    savedStart: ref({
      run: {
        name: 'Bakta annotation',
        task: { executors: [{ image: IMAGE }], inputs: [{ path: '/work/in/genome.fasta' }] },
        ask: { inputs: ['/work/in/genome.fasta'], results: askResults },
      },
      notes: [],
    }),
    inputs: ref([{ kind: 'folder', bucket: 'bakta-database', prefix: 'db/', name: 'db', basePath: '/work/in/db/', files: [], directory: true }, ...extraInputs]),
    outputRows: ref(askResults ? [{ path: '/work/out/', bucket: 'linked', key: 'runs/results/bakta-annotation/out/' }] : []),
    openInputs: ref([]),
    resultsChosen: ref(false),
    bucketOptions: ref(askResults ? [{ value: 'laptop', label: 'laptop' }] : []),
    envRows: ref([]),
    answerInput: () => {},
    chooseResults,
    editSaved: () => {},
  }
}

const component = compileClientComponent(new URL('./SavedRunStart.vue', import.meta.url), {
  vue: VueRuntime,
  '@/components/ui/Button.vue': moduleDefault(Slotted('button')),
  '@/components/ui/Input.vue': moduleDefault(Empty),
  '@/components/ui/IconTile.vue': moduleDefault(Empty),
  '@/components/ui/SectionHeading.vue': moduleDefault(Empty),
  '@/components/ui/Select.vue': moduleDefault(SelectStub),
  '@/components/compute/run/ResultsHome.vue': moduleDefault(HomeStub),
  '@/components/compute/TesDataRefDialog.vue': moduleDefault(Empty),
  '@/composables/useCustomRun': { injectCustomRun: custom, outputDestination: () => '', outputFolder },
  '@/lib/tes': Tes,
  '@/lib/sync': Sync,
  '@/composables/useDatabases': { useDatabases: () => ({ rows: databaseRows, ensure: () => {} }) },
  '@/composables/useRealmNodes': { useRealmNodes: () => ({ localNodeId: ref('node-1'), displayName: (id: string) => `Node ${id}` }) },
  '@/lib/savedRuns': { isSecretName: () => false },
  '@lucide/vue': new Proxy({}, { get: () => Empty }),
})

describe('saved run start', () => {
  it('names the tool by its image name and keeps the full reference for hover', async () => {
    const { root } = await mountApp(component)
    const subtitle = nodes(root).find((node) => node.tag === 'p' && content(node).includes('Saved on this computer'))!

    expect(content(subtitle)).toBe('bakta-rsSaved on this computer')
    expect(subtitle.props.title).toBe(IMAGE)
  })

  it('labels each input by its file name with the container path in small print', async () => {
    const { root } = await mountApp(component)
    const labels = nodes(root).filter((node) => node.tag === 'p' && String(node.props.class).includes('font-medium')).map(content)
    const paths = nodes(root).filter((node) => node.tag === 'p' && String(node.props.class).includes('font-mono')).map(content)

    expect(labels).toEqual(['genome.fasta', 'db'])
    expect(paths).toEqual(['/work/in/genome.fasta', '/work/in/db', 'bakta-database/db/'])
  })

  it('names a fixed database input by its title and release with the bucket path in small print', async () => {
    databaseRows.value = [{
      bucket: 'bakta-database',
      places: [{ bucket: 'bakta-database', nodeId: 'node-1' }],
      title: 'Bakta database (light)',
      description: { title: 'Bakta database (light)', version: '6.0 light', identifiers: [] },
      metadata: { database: true, dataset: 'd1' },
    }]
    const { root } = await mountApp(component)
    const text = content(root)

    expect(text).toContain('Bakta database (light), release 6.0 light')
    expect(text).toContain('bakta-database/db/')
    databaseRows.value = []
  })

  it('gives a local folder no title of a database with that name on another node', async () => {
    databaseRows.value = [{
      bucket: 'bakta-database',
      places: [{ bucket: 'bakta-database', nodeId: 'node-2' }],
      title: 'Bakta database (light)',
      description: { title: 'Bakta database (light)', version: '6.0 light', identifiers: [] },
      metadata: { database: true, dataset: 'd1' },
    }]
    const { root } = await mountApp(component)

    expect(content(root)).not.toContain('Bakta database (light)')
    databaseRows.value = []
  })

  it('keeps the saved name of a fixed input and falls back to its file name', async () => {
    extraInputs = [
      { kind: 'file', url: 's3://refs/genome.fa', path: '/work/in/ref/genome.fa', name: 'Reference genome' },
      { kind: 'file', url: 's3://refs/notes.txt', path: '/work/in/notes.txt', name: '' },
    ]
    const { root } = await mountApp(component)
    const labels = nodes(root).filter((node) => node.tag === 'p' && String(node.props.class).includes('font-medium')).map(content)

    expect(labels).toEqual(['genome.fasta', 'db', 'Reference genome', 'notes.txt'])
    extraInputs = []
  })

  it('shows a pinned input by bucket and path with its node, not by its identifier', async () => {
    extraInputs = [{ kind: 'file', url: 'arn:aruna:realm:node-2:s3/refs/k12.fna.gz@01M63XSAS2Z5M6YM4ZV9B55R08', path: '/work/in/ref/k12.fna.gz', name: 'k12.fna.gz' }]
    const { root } = await mountApp(component)
    const text = content(root)

    expect(text).toContain('refs/k12.fna.gz on Node node-2')
    expect(text).not.toContain('arn:aruna')
    extraInputs = []
  })

  it('answers the results question once a bucket is chosen', async () => {
    askResults = true
    const { root } = await mountApp(component)
    const select = nodes(root).find((node) => node.tag === 'select')!
    ;(select.props.onChange as (value: string) => void)('laptop')
    await VueRuntime.nextTick()

    expect(chooseResults).toHaveBeenLastCalledWith('laptop', '')
    askResults = false
  })

  it('shows a chosen linked folder in the bucket and folder fields', async () => {
    askResults = true
    const { root } = await mountApp(component)
    const home = nodes(root).find((node) => node.tag === 'button' && content(node) === 'Linked folder')!
    ;(home.props.onClick as () => void)()
    await VueRuntime.nextTick()

    expect(chooseResults).toHaveBeenLastCalledWith('linked', 'runs/')
    expect(nodes(root).find((node) => node.tag === 'select')!.props.modelValue).toBe('linked')
    askResults = false
  })

  it('shows the exact folder the results land in before Run', async () => {
    askResults = true
    const { root } = await mountApp(component)
    const home = nodes(root).find((node) => node.tag === 'button' && content(node) === 'Linked folder')!
    ;(home.props.onClick as () => void)()
    await VueRuntime.nextTick()

    expect(content(root)).toContain('Results go to linked/runs/results/bakta-annotation/out/')
    askResults = false
  })
})
