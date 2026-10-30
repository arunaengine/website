import { defineComponent, h, ref } from 'vue'
import * as VueRuntime from 'vue'
import { describe, expect, it } from 'vitest'
import * as Tes from '@/lib/tes'
import { outputFolder } from '@/composables/useCustomRun'
import { compileClientComponent, content, mountApp, moduleDefault } from '@/test/clientRender'

const Empty = defineComponent(() => () => null)
const inputs = ref<unknown[]>([])
const asked = ref<string[] | null>(null)

const component = compileClientComponent(new URL('./RunFooter.vue', import.meta.url), {
  vue: VueRuntime,
  '@/components/ui/Button.vue': moduleDefault(defineComponent((_, { slots }) => () => h('button', slots.default?.()))),
  '@/composables/useCustomRun': {
    outputFolder,
    injectCustomRun: () => ({
      problems: ref([]),
      inputs,
      outputRows: ref([]),
      cpuCores: ref(2),
      ramGb: ref(2),
      language: ref({ file: 'run.sh' }),
      hasScript: ref(false),
      image: ref('minimap2'),
      placementSummary: ref('Any node'),
      unassignedPaths: ref([]),
      savedStart: ref(asked.value ? { run: { ask: { inputs: asked.value } } } : null),
    }),
  },
  '@/lib/tes': Tes,
  '@lucide/vue': new Proxy({}, { get: () => Empty }),
})

const fixedRef = { kind: 'file', url: 's3://refs/k12.fna.gz', path: '/work/in/ref/k12.fna.gz', name: 'k12.fna.gz' }

describe('run summary', () => {
  it('counts an asked input of a saved run before it is chosen', async () => {
    inputs.value = [fixedRef]
    asked.value = ['/work/in/genome.fasta']
    const { root } = await mountApp(component)

    expect(content(root)).toMatch(/Inputs\s*2/)
  })

  it('counts every listed input of a run that is not saved', async () => {
    inputs.value = [fixedRef, { ...fixedRef, path: '/work/in/genome.fasta' }]
    asked.value = null
    const { root } = await mountApp(component)

    expect(content(root)).toMatch(/Inputs\s*2/)
  })
})
