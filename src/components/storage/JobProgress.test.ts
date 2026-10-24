import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { describe, expect, it } from 'vitest'
import { button, click, compileClientComponent, content, element, flush, mountApp, moduleDefault } from '@/test/clientRender'
import * as Organize from '@/lib/organize'
import type { ProgressJob } from '@/lib/organize'
import * as Utils from '@/lib/utils'

const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})
const JobProgress = compileClientComponent(new URL('./JobProgress.vue', import.meta.url), {
  vue: VueRuntime,
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Spinner.vue': moduleDefault(defineComponent({ props: { label: String }, setup: (p) => () => h('i', p.label) })),
  '@/lib/api': {},
  '@/lib/organize': Organize,
  '@/lib/utils': Utils,
})

const JOB: ProgressJob = { kind: 'move', state: 'running', done: 92410, total: 214880, counted: true, skipped: 2, failed: 0, controls: true }

async function mount(job: ProgressJob) {
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

  it('shows the wait on the control that was sent until the node answers', async () => {
    const busy = ref(false)
    const mounted = await mountApp(
      defineComponent(() => () => h(JobProgress, { job: JOB, busy: busy.value, onControl: () => (busy.value = true) })),
    )
    await click(button(mounted.root, 'Pause'))
    const pause = button(mounted.root, 'Pausing')
    expect(pause.props['aria-busy']).toBe(true)
    expect(pause.props.disabled).toBe(true)
    expect(button(mounted.root, 'Abort').props['aria-busy']).toBe(false)
    expect(button(mounted.root, 'Abort').props.disabled).toBe(true)
    busy.value = false
    await flush()
    expect(content(mounted.root)).not.toContain('Pausing')
    expect(button(mounted.root, 'Pause').props.disabled).toBe(false)
  })

  it('marks no control for a busy state no control caused', async () => {
    const busy = ref(false)
    const mounted = await mountApp(defineComponent(() => () => h(JobProgress, { job: JOB, busy: busy.value })))
    await click(button(mounted.root, 'Pause'))
    // The node answered; later the controls are blocked for another reason, such as no connection.
    busy.value = true
    await flush()
    busy.value = false
    await flush()
    busy.value = true
    await flush()
    expect(button(mounted.root, 'Pause').props['aria-busy']).toBe(false)
    expect(content(mounted.root)).not.toContain('Pausing')
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

  it('shows a step without a total as a count only', async () => {
    const { root } = await mount({ ...JOB, kind: 'move', total: 0, counted: false, failed: 3 })
    expect(content(root)).toContain('92,410 · 2 skipped · 3 failed')
    expect(() => element(root, (node) => node.props.role === 'progressbar')).toThrow()
  })

  it('shows a rename with its bar, time left and where it runs', async () => {
    const rename = { ...JOB, kind: 'rename', done: 152, total: 3877, skipped: 0, left: 'about 7 h left' } as const
    const { root } = await mount(rename)
    expect(content(root)).toContain('Renaming files in your storage')
    expect(content(root)).toContain('152 of 3,877 renamed · about 7 h left')
    expect(content(root)).toContain('Runs on the server. You can close this window.')
    expect(element(root, (node) => node.props.role === 'progressbar').props['aria-valuenow']).toBe(4)
  })

  it('never calls a renamed file skipped and shows failed ones only when there are some', async () => {
    const rename = { ...JOB, kind: 'rename', done: 152, total: 3877, skipped: 2, failed: 0 } as const
    const quiet = await mount(rename)
    expect(content(quiet.root)).not.toContain('skipped')
    expect(content(quiet.root)).not.toContain('failed')
    const failed = await mount({ ...rename, failed: 3 })
    expect(content(failed.root)).toContain('152 of 3,877 renamed · 3 failed')
  })

  it('names the bar and reads its value', async () => {
    const { root } = await mount(JOB)
    const bar = element(root, (node) => node.props.role === 'progressbar')
    expect(bar.props['aria-label']).toBe('Moving files')
    expect(bar.props['aria-valuetext']).toBe('92,410 of 214,880')
    const lower = await mount({ ...JOB, counted: false })
    expect(element(lower.root, (node) => node.props.role === 'progressbar').props['aria-valuetext']).toBe('92,410 of at least 214,880')
  })

  it('says a rename is starting, with no count and no controls to use', async () => {
    const starting = { ...JOB, kind: 'rename', done: 0, total: 0, counted: false, skipped: 0, controls: false, starting: true } as const
    const { root } = await mount(starting)
    expect(content(root)).toContain('Starting rename…')
    expect(content(root)).not.toContain('renamed')
    expect(content(root)).toContain('Runs on the server. You can close this window.')
    expect(() => button(root, 'Pause')).toThrow()
  })

  it('shows a rename without a total as a count only', async () => {
    const { root } = await mount({ ...JOB, kind: 'rename', total: 0, counted: false, skipped: 0 })
    expect(content(root)).toContain('92,410 renamed')
    expect(() => element(root, (node) => node.props.role === 'progressbar')).toThrow()
  })

  it('calls an uncounted total a lower bound', async () => {
    const { root } = await mount({ ...JOB, counted: false })
    expect(content(root)).toContain('of at least 214,880')
  })

  it('hides the controls for a step that cannot stop', async () => {
    const { root } = await mount({ ...JOB, kind: 'rename', controls: false })
    expect(content(root)).toContain('Renaming files in your storage')
    expect(() => button(root, 'Pause')).toThrow()
  })
})
