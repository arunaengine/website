import * as VueRuntime from 'vue'
import { defineComponent, effectScope, h, provide, type InjectionKey } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as VueRouter from 'vue-router'
import * as objectLinks from '@/lib/assistant/objectLinks'
import * as assistantObject from '@/composables/useAssistantObject'
import { compileClientComponent, element, flush, mountApp, type HostNode } from '@/test/clientRender'

const ObjectLink = compileClientComponent(new URL('./ObjectLink.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': VueRouter,
  '@/lib/assistant/objectLinks': objectLinks,
  '@/composables/useAssistantObject': assistantObject,
})

const push = vi.fn()
const scopes: ReturnType<typeof effectScope>[] = []

function openWith(handler: (target: assistantObject.ObjectTarget) => void) {
  const scope = effectScope()
  scope.run(() => assistantObject.provideObjectOpener(handler))
  scopes.push(scope)
}

function leaveWith(handler: () => void) {
  const scope = effectScope()
  scope.run(() => assistantObject.provideLeaveHandler(handler))
  scopes.push(scope)
}

async function link(): Promise<HostNode> {
  const host = defineComponent({
    setup() {
      provide(VueRouter.routerKey as unknown as InjectionKey<unknown>, { push })
      return () => h(ObjectLink, { bucket: 'test', objectKey: 'notes/hello.txt', name: 'hello.txt' })
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

describe('ObjectLink', () => {
  it('opens the file in place when a surface offers that', async () => {
    const opened = vi.fn()
    openWith(opened)
    const anchor = await link()

    const prevented = press(anchor)

    expect(prevented).toHaveBeenCalled()
    expect(opened).toHaveBeenCalledWith(expect.objectContaining({ bucket: 'test', key: 'notes/hello.txt' }))
    expect(push).not.toHaveBeenCalled()
  })

  it('routes to the data browser without a handler', async () => {
    const anchor = await link()

    const prevented = press(anchor)

    expect(prevented).toHaveBeenCalled()
    expect(push).toHaveBeenCalledWith('/app/buckets/test?prefix=notes&object=notes%2Fhello.txt')
  })

  it('takes the chat along when it really navigates', async () => {
    const left = vi.fn()
    leaveWith(left)
    const anchor = await link()

    press(anchor)

    expect(left).toHaveBeenCalledOnce()
    expect(push).toHaveBeenCalled()
  })

  it('leaves the surface alone when the file opens in place', async () => {
    const left = vi.fn()
    leaveWith(left)
    openWith(vi.fn())
    const anchor = await link()

    press(anchor)

    expect(left).not.toHaveBeenCalled()
  })

  it('leaves a modified click to the browser', async () => {
    const opened = vi.fn()
    openWith(opened)
    const anchor = await link()

    const prevented = press(anchor, { metaKey: true })

    expect(prevented).not.toHaveBeenCalled()
    expect(opened).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
    expect(anchor.props.href).toBe('/app/buckets/test?prefix=notes&object=notes%2Fhello.txt')
  })
})
