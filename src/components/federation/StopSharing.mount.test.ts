import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { button, click, compileClientComponent, content, flush, moduleDefault, mountApp } from '@/test/clientRender'
import { ApiError } from '@/lib/api/client'

const revokeGrant = vi.fn()
const checkOwnerNode = vi.fn()
class OwnerNodeError extends Error {
  ambiguous = false
}
const OWNER = 'https://a2.example/api/v1'
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
  '@/lib/federation/transfer': { checkOwnerNode, OwnerNodeError },
})

async function stopSharing(props: Record<string, unknown> = { jobId: 'J1', ownerNodeUrl: OWNER }) {
  const mounted = await mountApp(StopSharing, { props })
  await click(button(mounted.root, 'Stop sharing'))
  await click(button(mounted.root, 'Confirm stop sharing'))
  await flush()
  return mounted
}

beforeEach(() => {
  vi.clearAllMocks()
  checkOwnerNode.mockImplementation(async (url: string) => url)
})

describe('StopSharing', () => {
  it('revokes the grant at the owner node of the export after a confirmation', async () => {
    revokeGrant.mockResolvedValue(undefined)
    const mounted = await stopSharing()
    expect(checkOwnerNode).toHaveBeenCalledWith(OWNER, '/api/v1', 'A-TOKEN')
    expect(revokeGrant).toHaveBeenCalledWith('J1', { baseUrl: OWNER, token: 'A-TOKEN' })
    expect(content(mounted.root)).toContain('Sharing stopped.')
    mounted.app.unmount()
  })

  it('says so when the export was never shared', async () => {
    revokeGrant.mockRejectedValue(new ApiError(404, 'Not found'))
    const mounted = await stopSharing()
    expect(content(mounted.root)).toContain('This export is not shared with another realm.')
    mounted.app.unmount()
  })

  it.each([
    ['no owner node is named', { jobId: 'J1' }, null, 'does not say which node'],
    ['the owner is not a node of this realm', undefined, new OwnerNodeError('x'), 'this realm does not list'],
    ['two nodes have the owner address', undefined, Object.assign(new OwnerNodeError('x'), { ambiguous: true }), 'More than one node'],
    ['the node list cannot be read', undefined, new ApiError(404, 'No realm here'), 'No realm here'],
  ])('sends nothing and claims nothing when %s', async (_, props, refusal, message) => {
    if (refusal) checkOwnerNode.mockRejectedValue(refusal)
    const mounted = await stopSharing(props)
    expect(revokeGrant).not.toHaveBeenCalled()
    expect(content(mounted.root)).toContain(message)
    expect(content(mounted.root)).not.toContain('not shared')
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
