// The distributed bucket mock shows example data only. It opens when the deployment
// feature `distributedMock` is on in portal-config.json, or for a local build started
// with VITE_ARUNA_DISTRIBUTED_MOCK=1. Otherwise the routes send people to the buckets.
import { RouterView, type RouteRecordRaw } from 'vue-router'
import { featureEnabled } from '@/lib/config'

export const MOCK_BASE = '/app/mock/distributed'

export function mockEnabled(): boolean {
  return featureEnabled('distributedMock') || import.meta.env.VITE_ARUNA_DISTRIBUTED_MOCK === '1'
}

export function distributedMockRoutes(): RouteRecordRaw {
  return {
    path: 'mock/distributed',
    component: RouterView,
    beforeEnter: () => mockEnabled() || { name: 'buckets' },
    children: [
      { path: '', name: 'mock-distributed', component: () => import('@/views/DistributedMockView.vue') },
    ],
  }
}
