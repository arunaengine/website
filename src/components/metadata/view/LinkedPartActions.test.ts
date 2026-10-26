import { defineComponent, h, ref } from 'vue'
import * as VueRuntime from 'vue'
import { describe, expect, it, vi } from 'vitest'
import * as LinkedPart from '@/lib/linkedPart'
import { button, compileClientComponent, flush, mountApp, moduleDefault } from '@/test/clientRender'

const push = vi.fn()
const aruna = vi.hoisted(() => ({ getPartTarget: vi.fn(), sessionEpoch: { value: 1 } }))
const Slotted = (tag: string) =>
  defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h(tag, attrs, slots.default?.()) })

const component = compileClientComponent(new URL('./LinkedPartActions.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { useRouter: () => ({ push }) },
  '@lucide/vue': new Proxy({}, { get: () => defineComponent(() => () => h('i')) }),
  '@/components/data/LinkedDatasets.vue': moduleDefault(defineComponent(() => () => h('i'))),
  '@/components/ui/Button.vue': moduleDefault(Slotted('button')),
  '@/composables/useAruna': { useAruna: () => aruna },
  '@/composables/useRealmNodes': { useRealmNodes: () => ({ isLocalNode: (id: string) => id === 'n1' }) },
  '@/lib/api': { apiErrorMessage: (cause: unknown) => String(cause) },
  '@/lib/linkedPart': LinkedPart,
})

describe('linked part actions', () => {
  it('does not open the files of a part asked for before', async () => {
    let settle: (value: unknown) => void = () => {}
    aruna.getPartTarget.mockImplementation(() => new Promise((resolve) => (settle = resolve)))
    const id = ref('arn:aruna:r:n1:s3/lab/raw/')
    const host = defineComponent(() => () => h(component, { id: id.value, datasetId: 'd1' }))
    const { root } = await mountApp(host)

    void (button(root, 'Browse the files').props.onClick as (event: unknown) => Promise<void>)({ stopPropagation: () => {} })
    id.value = 'arn:aruna:r:n1:s3/lab/other/'
    await flush()
    settle({ id: 'x', bucket: 'lab', prefix: 'raw/', node_id: 'n1', held_here: true })
    await flush()

    expect(aruna.getPartTarget).toHaveBeenCalledTimes(1)
    expect(push).not.toHaveBeenCalled()
  })
})
