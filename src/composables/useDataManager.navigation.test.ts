import { defineComponent } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it } from 'vitest'
import { navigationQueue } from './useDataManager'

const View = defineComponent({ render: () => null })

async function bucketRouter() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/buckets', name: 'buckets', component: View },
      { path: '/buckets/:bucketId', name: 'bucket', component: View },
    ],
  })
  await router.push({ name: 'bucket', params: { bucketId: 'reef' }, query: { group: 'g-a' } })
  return router
}

describe('group switch navigation', () => {
  it('ends on the picker of the new group when the session query follows at once', async () => {
    const router = await bucketRouter()
    const navigate = navigationQueue()
    const route = router.currentRoute

    // The switch asks for the picker; the cached session then syncs its group query.
    void navigate(() => router.replace({ name: 'buckets', query: { group: 'g-b' } }))
    await navigate(() => {
      if (route.value.query.group === 'g-b') return
      return router.replace({ query: { ...route.value.query, group: 'g-b' } })
    })

    expect(route.value.name).toBe('buckets')
    expect(route.value.query).toEqual({ group: 'g-b' })
  })

  it('runs the next step after a failed one', async () => {
    const navigate = navigationQueue()
    const order: string[] = []
    void navigate(() => {
      order.push('first')
      throw new Error('refused')
    }).catch(() => undefined)
    await navigate(() => order.push('second'))

    expect(order).toEqual(['first', 'second'])
  })
})
