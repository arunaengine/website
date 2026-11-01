import { ref } from 'vue'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

type Profile = { user: { attributes: Record<string, string> } }
const userInfo = ref<Profile | null>(null)
const updateUserProfile = vi.fn()
const reportGlobalError = vi.fn()

let useBucketOrder: typeof import('./useBucketOrder').useBucketOrder

beforeAll(async () => {
  vi.doMock('@/composables/useAruna', () => ({ useAruna: () => ({ userInfo, updateUserProfile }) }))
  vi.doMock('@/composables/useGlobalErrors', () => ({ reportGlobalError }))
  ;({ useBucketOrder } = await import('./useBucketOrder'))
})

beforeEach(() => {
  userInfo.value = { user: { attributes: { 'ui.bucket_order.g1': 'reef,genes', 'ui.bucket_order.g2': 'other' } } }
  updateUserProfile.mockReset()
  reportGlobalError.mockReset()
})

// Holds each write until the test lets it finish.
function heldWrites() {
  const held: { body: unknown; finish: (fail?: Error) => void }[] = []
  updateUserProfile.mockImplementation((body: unknown) => new Promise<void>((resolve, reject) => {
    held.push({ body, finish: (fail) => (fail ? reject(fail) : resolve()) })
  }))
  return held
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('own bucket order', () => {
  it('reads the order of the open group only', () => {
    const group = ref<string | null>('g1')
    const order = useBucketOrder(group)
    expect(order.names.value).toEqual(['reef', 'genes'])
    group.value = 'g2'
    expect(order.names.value).toEqual(['other'])
    group.value = null
    expect(order.names.value).toEqual([])
    expect(order.canSave.value).toBe(false)
  })

  it('shows a change at once and writes the changes in the order they were made', async () => {
    const held = heldWrites()
    const order = useBucketOrder(ref('g1'))
    void order.save(['genes', 'reef'])
    void order.save(['reef', 'genes', 'new'])
    expect(order.names.value).toEqual(['reef', 'genes', 'new'])
    await settle()
    expect(held.map((write) => write.body)).toEqual([{ set_attributes: { 'ui.bucket_order.g1': 'genes,reef' } }])

    // The first answer does not bring back the first change while the second is still out.
    held[0].finish()
    await settle()
    expect(order.names.value).toEqual(['reef', 'genes', 'new'])
    expect(held[1].body).toEqual({ set_attributes: { 'ui.bucket_order.g1': 'reef,genes,new' } })
    userInfo.value = { user: { attributes: { 'ui.bucket_order.g1': 'reef,genes,new' } } }
    held[1].finish()
    await settle()
    expect(order.names.value).toEqual(['reef', 'genes', 'new'])
  })

  it('goes back to the stored order and reports it when the write fails', async () => {
    const held = heldWrites()
    const order = useBucketOrder(ref('g1'))
    const saved = order.save(['genes', 'reef'])
    await settle()
    held[0].finish(new Error('refused'))
    await saved
    expect(order.names.value).toEqual(['reef', 'genes'])
    expect(reportGlobalError).toHaveBeenCalledWith('refused')
  })

  it('removes the attribute on reset', async () => {
    updateUserProfile.mockResolvedValue(undefined)
    await useBucketOrder(ref('g1')).reset()
    expect(updateUserProfile).toHaveBeenCalledWith({ remove_attributes: ['ui.bucket_order.g1'] })
  })
})
