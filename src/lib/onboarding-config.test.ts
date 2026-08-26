import { describe, expect, it } from 'vitest'
import type { RealmNodeInfo } from '@/lib/api'
import { managementPortals } from '@/lib/onboarding-config'

function node(kind: RealmNodeInfo['kind'], api?: string): RealmNodeInfo {
  return {
    node_id: `${kind}-${api ?? 'none'}`,
    kind,
    owner: null,
    configured: true,
    present: true,
    connection_status: 'connected',
    placement: null,
    info: api ? { executors: [], labels: {}, urls: { api }, utilization: { storage_bytes_used: 0, heartbeat_at_ms: 0 }, updated_at_ms: 0 } : null,
  } as RealmNodeInfo
}

describe('management portals', () => {
  it('prefers the published list and strips the api prefix', () => {
    const portals = managementPortals({
      management_urls: ['https://a.test/api/v1', 'https://a.test/api/v1/', 'https://b.test/api/v1'],
      nodes: [node('management', 'https://c.test/api/v1')],
    })
    expect(portals.map((portal) => portal.url)).toEqual(['https://a.test', 'https://b.test'])
  })

  it('falls back to the node list of an older backend', () => {
    const portals = managementPortals({ nodes: [node('server', 'https://s.test/api/v1'), node('management', 'https://m.test/api/v1'), node('management')] })
    expect(portals.map((portal) => portal.url)).toEqual(['https://m.test'])
  })

  it('answers nothing for no realm info', () => {
    expect(managementPortals(null)).toEqual([])
  })
})
