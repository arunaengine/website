import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as SavedRuns from '@/lib/savedRuns'
import { RUN_TEMPLATES } from '@/lib/runTemplates'
import {
  button,
  click,
  compileClientComponent,
  content,
  moduleDefault,
  mountApp,
  nodes,
} from '@/test/clientRender'

const push = vi.fn()
const savedRuns = ref<SavedRuns.SavedRun[]>([])
const Passthrough = defineComponent((_, { slots }) => () => h('div', slots.default?.()))
const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup(_, { attrs, slots }) {
    return () => h('button', attrs, slots.default?.())
  },
})
const icons = new Proxy({}, { get: () => defineComponent(() => () => h('i')) })

const NewRunMenu = compileClientComponent(new URL('./NewRunMenu.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { useRouter: () => ({ push }) },
  '@lucide/vue': icons,
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/DropdownMenu.vue': moduleDefault(Passthrough),
  '@/components/ui/DropdownMenuTrigger.vue': moduleDefault(Passthrough),
  '@/components/ui/DropdownMenuContent.vue': moduleDefault(Passthrough),
  '@/components/ui/DropdownMenuItem.vue': moduleDefault(ButtonStub),
  '@/components/ui/DropdownMenuLabel.vue': moduleDefault(Passthrough),
  '@/components/ui/DropdownMenuSeparator.vue': moduleDefault(Passthrough),
  '@/components/compute/MyRunsDialog.vue': moduleDefault(Passthrough),
  '@/composables/useSavedRuns': { useSavedRuns: () => ({ runs: savedRuns }) },
  '@/lib/savedRuns': SavedRuns,
  '@/lib/runTemplates': { RUN_TEMPLATES },
})

describe('new run menu', () => {
  beforeEach(() => push.mockClear())

  it('opens the run page on the template that was picked', async () => {
    const mounted = await mountApp(NewRunMenu)

    expect(content(mounted.root)).toContain('New run')
    // The left half of the split button opens a blank run at once.
    await click(button(mounted.root, 'New run'))
    expect(push).toHaveBeenLastCalledWith({ name: 'compute-new' })
    const entries = ['Python script', 'JavaScript script', 'Bash script', 'Blank run']
    for (const entry of entries) expect(content(mounted.root)).toContain(entry)
    expect(
      nodes(mounted.root).filter(
        (node) => node.tag === 'button' && entries.some((entry) => content(node).trim().startsWith(entry)),
      ),
    ).toHaveLength(4)

    await click(button(mounted.root, 'Python script'))
    expect(push).toHaveBeenLastCalledWith({ name: 'compute-new', query: { template: 'python' } })

    await click(button(mounted.root, 'Bash script'))
    expect(push).toHaveBeenLastCalledWith({ name: 'compute-new', query: { template: 'bash' } })

    // A blank run carries no template, so the page opens on a custom image.
    await click(button(mounted.root, 'Blank run'))
    expect(push).toHaveBeenLastCalledWith({ name: 'compute-new' })
    expect(mounted.errors).toEqual([])
    mounted.app.unmount()
  })

  it('lists my runs first and starts one by its id', async () => {
    savedRuns.value = [{
      id: 'r1', name: 'Annotate a genome', savedAt: '2026-10-28T10:00:00Z',
      task: { executors: [{ image: 'bakta', command: ['bakta'] }], inputs: [{ name: 'genome', path: '/data/genome.fna' }] },
      ask: { inputs: ['/data/genome.fna'], results: true },
    }]
    const mounted = await mountApp(NewRunMenu)

    expect(content(mounted.root)).toContain('Asks for: genome, results folder')
    await click(button(mounted.root, 'Annotate a genome'))
    expect(push).toHaveBeenLastCalledWith({ name: 'compute-new', query: { saved: 'r1' } })
    savedRuns.value = []
    mounted.app.unmount()
  })
})
