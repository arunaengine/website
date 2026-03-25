import DownloadsCard from '~/components/card/downloads.vue'
import { storagemodelsv2ReplicationStatus, v2ResourceVariant } from '~/composables/aruna_api_json'
import { mountWithNuxtSuspense } from '../../helpers/component'
import {beforeEach, describe, expect, it, vi } from "vitest"

const fetchEndpointMock = vi.hoisted(() => vi.fn())

vi.mock('~/composables/api_wrapper', () => ({
  fetchEndpoint: fetchEndpointMock,
}))

describe('components/card/downloads', () => {
  beforeEach(() => {
    fetchEndpointMock.mockReset()
  })

  it('renders endpoint names and ids for non-object resources', async () => {
    fetchEndpointMock.mockResolvedValueOnce({ name: 'Primary Endpoint' })

    const wrapper = await mountWithNuxtSuspense(DownloadsCard, {
      props: {
        endpoints: [{ id: 'endpoint-1', status: storagemodelsv2ReplicationStatus.REPLICATION_STATUS_FINISHED }],
        resourceType: v2ResourceVariant.RESOURCE_VARIANT_PROJECT,
      },
    })

    expect(fetchEndpointMock).toHaveBeenCalledWith('endpoint-1')
    expect(wrapper.text()).toContain('Endpoint Name')
    expect(wrapper.text()).toContain('Endpoint ID')
    expect(wrapper.text()).toContain('Primary Endpoint')
    expect(wrapper.text()).toContain('endpoint-1')
    expect(wrapper.text()).not.toContain('Download')
  })

  it('renders replication status and emits download for finished object replicas', async () => {
    fetchEndpointMock.mockResolvedValueOnce({ name: 'Replica Endpoint' })

    const wrapper = await mountWithNuxtSuspense(DownloadsCard, {
      props: {
        endpoints: [{ id: 'endpoint-2', status: storagemodelsv2ReplicationStatus.REPLICATION_STATUS_FINISHED }],
        resourceType: v2ResourceVariant.RESOURCE_VARIANT_OBJECT,
      },
    })

    expect(wrapper.text()).toContain('Replication Status')
    expect(wrapper.text()).toContain('Finished')

    await wrapper.get('button').trigger('click')

    expect(wrapper.findComponent(DownloadsCard).emitted('download')).toEqual([['endpoint-2']])
  })

  it('disables download buttons for unfinished replicas', async () => {
    fetchEndpointMock.mockResolvedValueOnce({ name: 'Replica Endpoint' })

    const wrapper = await mountWithNuxtSuspense(DownloadsCard, {
      props: {
        endpoints: [{ id: 'endpoint-3', status: storagemodelsv2ReplicationStatus.REPLICATION_STATUS_RUNNING }],
        resourceType: v2ResourceVariant.RESOURCE_VARIANT_OBJECT,
      },
    })

    expect(wrapper.text()).toContain('Running')
    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
  })
})
