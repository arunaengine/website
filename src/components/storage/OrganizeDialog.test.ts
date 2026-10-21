import * as VueRuntime from 'vue'
import { defineComponent, h } from 'vue'
import { describe, expect, it } from 'vitest'
import { compileClientComponent, content, mountApp, moduleDefault } from '@/test/clientRender'

const Slot = defineComponent((_, { attrs, slots }) => () => h('div', attrs, slots.default?.()))
function stub(name: string) {
  return defineComponent({ inheritAttrs: false, setup: () => () => h('section', { 'data-step': name }, name) })
}

const Organize = compileClientComponent(new URL('./OrganizeDialog.vue', import.meta.url), {
  vue: VueRuntime,
  '@/components/ui/Dialog.vue': moduleDefault(Slot),
  '@/components/ui/DialogContent.vue': moduleDefault(Slot),
  '@/components/ui/DialogHeader.vue': moduleDefault(Slot),
  '@/components/ui/DialogTitle.vue': moduleDefault(Slot),
  '@/components/ui/DialogDescription.vue': moduleDefault(Slot),
  '@/components/ui/Notice.vue': moduleDefault(Slot),
  '@/components/storage/FileRulesStep.vue': moduleDefault(stub('rules step')),
  '@/components/storage/MoveStep.vue': moduleDefault(stub('move step')),
  '@/components/storage/TidyStep.vue': moduleDefault(stub('tidy step')),
  '@/components/storage/JobProgress.vue': moduleDefault(stub('running job')),
})

const LINK = { import_id: 'i1', bucket: 'reef', key_prefix: 'genomes/' }

async function mount(props: Record<string, unknown>) {
  const mounted = await mountApp(Organize, {
    props: { open: true, groupId: 'g1', link: LINK, renames: null, job: null, supported: true, ...props },
  })
  if (mounted.errors.length) throw mounted.errors[0]
  return mounted.root
}

describe('OrganizeDialog', () => {
  it('shows the three steps', async () => {
    const text = content(await mount({}))
    expect(text).toContain('Organize genomes/')
    expect(text).toContain('Where new files go')
    expect(text).toContain('Move existing files')
    expect(text).toContain('Tidy your storage')
    expect(text).not.toContain('running job')
  })

  it('leaves out moving files on a node without the routes', async () => {
    const text = content(await mount({ supported: false }))
    expect(text).not.toContain('move step')
    expect(text).toContain('rules step')
    expect(text).toContain('tidy step')
  })

  it('shows the running step at the top', async () => {
    const text = content(await mount({ job: { kind: 'move', state: 'running', done: 1, total: 2, skipped: 0, controls: true } }))
    expect(text).toContain('running job')
  })
})
