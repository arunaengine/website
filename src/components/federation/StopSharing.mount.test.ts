import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { button, click, compileClientComponent, content, flush, moduleDefault, mountApp } from '@/test/clientRender'
import { ApiError } from '@/lib/api/client'

const revokeGrant = vi.fn()
const sessionEpoch = ref(1)
const JOB_CLIENT = Symbol('jobClient')
const Empty = defineComponent(() => () => null)
const Button = defineComponent((_, { attrs, slots }) => () => h('button', attrs, slots.default?.()))
const StopSharing = compileClientComponent(new URL('./StopSharing.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => Empty }),
  '@/components/ui/Button.vue': moduleDefault(Button),
  '@/composables/useAruna': {
    useAruna: () => ({ apiBaseUrl: ref('/api/v1'), authToken: ref('A-TOKEN'), sessionEpoch }),
  },
  '@/composables/useJobs': { JOB_CLIENT },
  '@/lib/api': { ApiError, apiErrorMessage: (error: Error) => error.message, revokeGrant },
})

async function stopSharing() {
  const mounted = await mountApp(StopSharing, { props: { jobId: 'J1' } })
  await click(button(mounted.root, 'Stop sharing'))
  await click(button(mounted.root, 'Confirm stop sharing'))
  await flush()
  return mounted
}

beforeEach(() => vi.clearAllMocks())

describe('StopSharing', () => {
  it('revokes the grant of the export at its node after a confirmation', async () => {
    revokeGrant.mockResolvedValue(undefined)
    const mounted = await stopSharing()
    expect(revokeGrant).toHaveBeenCalledWith('J1', { baseUrl: '/api/v1', token: 'A-TOKEN' })
    expect(content(mounted.root)).toContain('Sharing stopped.')
    mounted.app.unmount()
  })

  it('says so when the export was never shared', async () => {
    revokeGrant.mockRejectedValue(new ApiError(404, 'Not found'))
    const mounted = await stopSharing()
    expect(content(mounted.root)).toContain('This export is not shared with another realm.')
    mounted.app.unmount()
  })

  it('drops an answer that arrives after the login changed', async () => {
    revokeGrant.mockImplementation(async () => {
      sessionEpoch.value++
    })
    const mounted = await stopSharing()
    expect(content(mounted.root)).not.toContain('Sharing stopped.')
    mounted.app.unmount()
  })
})
