import { defineComponent, h } from 'vue'
import * as VueRuntime from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as Errors from '@/composables/s3/errors'
import { compileClientComponent, flush, mountApp, moduleDefault } from '@/test/clientRender'

const Slotted = (tag: string) =>
  defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h(tag, attrs, slots.default?.()) })

const pdf = compileClientComponent(new URL('./PdfPreview.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => Slotted('i') }),
  '@/composables/s3/errors': Errors,
  '@/components/ui/Button.vue': moduleDefault(Slotted('button')),
  '@/components/ui/EmptyState.vue': moduleDefault(Slotted('section')),
  '@/components/ui/Skeleton.vue': moduleDefault(Slotted('div')),
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('pdf preview', () => {
  it('reports a locked bucket instead of a plain loading failure', async () => {
    const headers = { 'x-aruna-bucket-locked': 'true' }
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<Error/>', { status: 403, headers })))
    const onLocked = vi.fn()

    await mountApp(pdf, { props: { url: 'https://b.test/presigned', onLocked } })
    await flush()

    expect(onLocked).toHaveBeenCalledOnce()
  })

  it('keeps an ordinary refusal a loading failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<Error/>', { status: 403 })))
    const onLocked = vi.fn()

    await mountApp(pdf, { props: { url: 'https://b.test/presigned', onLocked } })
    await flush()

    expect(onLocked).not.toHaveBeenCalled()
  })
})
