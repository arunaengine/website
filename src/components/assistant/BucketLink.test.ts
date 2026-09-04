import * as VueRuntime from 'vue'
import { defineComponent, effectScope, h, provide, type InjectionKey } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as VueRouter from 'vue-router'
import * as objectLinks from '@/lib/assistant/objectLinks'
import * as assistantObject from '@/composables/useAssistantObject'
import { compileClientComponent, element, flush, mountApp, type HostNode } from '@/test/clientRender'

const BucketLink = compileClientComponent(new URL('./BucketLink.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': VueRouter,
  '@/lib/assistant/objectLinks': objectLinks,
  '@/composables/useAssistantObject': assistantObject,
})

const push = vi.fn()
const scopes: ReturnType<typeof effectScope>[] = []

function leaveWith(handler: () => void) {
  const scope = effectScope()
  scope.run(() => assistantObject.provideLeaveHandler(handler))
  scopes.push(scope)
}

async function link(): Promise<HostNode> {
  const host = defineComponent({
    setup() {
      provide(VueRouter.routerKey as unknown as InjectionKey<unknown>, { push })
      return () => h(BucketLink, { bucket: 'test' })
    },
  })
  const { root } = await mountApp(host)
  await flush()
  return element(root, (node) => node.tag === 'a')
}

function press(node: HostNode, event: Partial<MouseEvent> = {}) {
  const handler = node.props.onClick as (value: unknown) => void
  const prevented = vi.fn()
  handler({ metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, button: 0, ...event, preventDefault: prevented })
  return prevented
}

afterEach(() => {
  for (const scope of scopes.splice(0)) scope.stop()
  push.mockClear()
})

describe('BucketLink', () => {
  it('routes to the bucket in the data browser', async () => {
    const anchor = await link()

    const prevented = press(anchor)

    expect(prevented).toHaveBeenCalled()
    expect(anchor.props.href).toBe('/app/buckets/test')
    expect(push).toHaveBeenCalledWith('/app/buckets/test')
  })

  it('takes the chat along from the assistant page', async () => {
    const left = vi.fn()
    leaveWith(left)
    const anchor = await link()

    press(anchor)

    expect(left).toHaveBeenCalledOnce()
    expect(push).toHaveBeenCalledWith('/app/buckets/test')
  })

  it('toggles nothing from the panel, where no surface asks for it', async () => {
    const anchor = await link()

    press(anchor)

    expect(push).toHaveBeenCalledOnce()
  })

  it('leaves a modified click to the browser', async () => {
    const left = vi.fn()
    leaveWith(left)
    const anchor = await link()

    const prevented = press(anchor, { metaKey: true })

    expect(prevented).not.toHaveBeenCalled()
    expect(left).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
  })
})
