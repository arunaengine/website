import * as VueRuntime from 'vue'
import { defineComponent, h } from 'vue'
import { describe, expect, it } from 'vitest'
import { compileClientComponent, content, moduleDefault, mountApp, nodes } from '@/test/clientRender'
import * as Organize from '@/lib/organize'

const SpinnerStub = defineComponent({
  props: { label: String },
  setup: (props) => () => h('i', { role: 'status' }, props.label),
})
const BucketJobLabel = compileClientComponent(new URL('./BucketJobLabel.vue', import.meta.url), {
  vue: VueRuntime,
  '@/components/ui/Spinner.vue': moduleDefault(SpinnerStub),
  '@/lib/organize': Organize,
})

async function mount(job: { kind: string; state: string; done?: number; failed?: number }) {
  const mounted = await mountApp(
    defineComponent(() => () => h(BucketJobLabel, { job: { done: 0, failed: 0, ...job } })),
  )
  if (mounted.errors.length) throw mounted.errors[0]
  return mounted.root
}

describe('BucketJobLabel', () => {
  it('shows a spinner with the step while it runs', async () => {
    const root = await mount({ kind: 'rename', state: 'running' })
    expect(content(root)).toBe('Renaming')
    expect(nodes(root).some((node) => node.props.role === 'status')).toBe(true)
  })

  it('says paused instead of spinning', async () => {
    const root = await mount({ kind: 'key_move', state: 'paused' })
    expect(content(root).trim()).toBe('Moving keys (paused)')
    expect(nodes(root).some((node) => node.props.role === 'status')).toBe(false)
  })
})
