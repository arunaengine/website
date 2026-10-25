import { defineComponent, h } from 'vue'
import * as VueRuntime from 'vue'
import { describe, expect, it } from 'vitest'
import type { AdmissionResponse } from '@/lib/api'
import { compileClientComponent, content, mountApp, moduleDefault } from '@/test/clientRender'

const Slotted = (tag: string) =>
  defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h(tag, attrs, [attrs.title ? `${attrs.title} ` : '', slots.default?.()]) })

const component = compileClientComponent(new URL('./CreateResults.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': { RefreshCw: defineComponent(() => () => h('i')) },
  '@/components/ui/Badge.vue': moduleDefault(Slotted('span')),
  '@/components/ui/Button.vue': moduleDefault(Slotted('button')),
  '@/components/ui/NodeLabel.vue': moduleDefault(defineComponent({ props: { nodeId: String }, setup: (props) => () => h('b', props.nodeId) })),
  '@/components/ui/Notice.vue': moduleDefault(Slotted('aside')),
})

const member = (id: string, admitted: boolean) => ({ member_id: id, node_id: id, admitted, error: admitted ? null : 'busy' })

async function text(outcome: AdmissionResponse) {
  return content((await mountApp(component, { props: { name: 'lab', outcome, busy: false, failure: null } })).root)
}

describe('create results', () => {
  it('claims every member admitted only when each one is, and offers the retry otherwise', async () => {
    const all = await text({ set_id: 's', active: true, members: [member('n1', true), member('n2', true)] })
    expect(all).toContain('Every member is admitted')
    expect(all).not.toContain('Retry admission')

    const some = await text({ set_id: 's', active: true, members: [member('n1', true), member('n2', false)] })
    expect(some).not.toContain('Every member is admitted')
    expect(some).toContain('Some members are not admitted')
    expect(some).toContain('Retry admission')
  })
})
