import * as VueRuntime from 'vue'
import { defineComponent, h } from 'vue'
import { describe, expect, it } from 'vitest'
import { button, click, compileClientComponent, content, element, mountApp, moduleDefault } from '@/test/clientRender'
import type { OrganizeJob } from '@/lib/api'
import * as Organize from '@/lib/organize'
import * as Utils from '@/lib/utils'

const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})
const JobProgress = compileClientComponent(new URL('./JobProgress.vue', import.meta.url), {
  vue: VueRuntime,
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/lib/api': {},
  '@/lib/organize': Organize,
  '@/lib/utils': Utils,
})

const JOB: OrganizeJob = { kind: 'move', state: 'running', done: 92410, total: 214880, skipped: 2, controls: true }

async function mount(job: OrganizeJob) {
  const actions: string[] = []
  const mounted = await mountApp(
    defineComponent(() => () => h(JobProgress, { job, onControl: (action: string) => actions.push(action) })),
  )
  if (mounted.errors.length) throw mounted.errors[0]
  return { ...mounted, actions }
}

describe('JobProgress', () => {
  it('shows the count and pauses', async () => {
    const { root, actions } = await mount(JOB)
    expect(content(root)).toContain('92,410 of 214,880 · 2 skipped')
    expect(element(root, (node) => node.props.role === 'progressbar').props['aria-valuenow']).toBe(43)
    await click(button(root, 'Pause'))
    expect(actions).toEqual(['pause'])
  })

  it('offers Resume while paused', async () => {
    const { root, actions } = await mount({ ...JOB, state: 'paused' })
    expect(content(root)).toContain('(paused)')
    await click(button(root, 'Resume'))
    expect(actions).toEqual(['resume'])
  })

  it('asks before it aborts', async () => {
    const { root, actions } = await mount(JOB)
    await click(button(root, 'Abort'))
    expect(content(root)).toContain('92,410 files are already moved and stay moved. The other 122,470 keep their names.')
    expect(actions).toEqual([])
    await click(button(root, 'Keep running'))
    expect(content(root)).not.toContain('Abort moving files?')
    await click(button(root, 'Abort'))
    await click(element(root, (node) => node.tag === 'button' && content(node) === 'Abort' && node.props.variant === 'destructive'))
    expect(actions).toEqual(['abort'])
  })

  it('hides the controls for a step that cannot stop', async () => {
    const { root } = await mount({ ...JOB, kind: 'rename', controls: false })
    expect(content(root)).toContain('Renaming files in your storage')
    expect(() => button(root, 'Pause')).toThrow()
  })
})
