import { computed, effectScope, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { createCustomRun } from './useCustomRun'

const node = (nodeId: string, kind: string, executorKinds: string[]) =>
  ({ nodeId, kind, label: nodeId, executorKinds, info: { labels: {} } }) as never

describe('run placement nodes', () => {
  it('matches no device for a realm run and offers none of its executors', () => {
    const scope = effectScope()
    const store = scope.run(() =>
      createCustomRun({
        runTarget: { local: computed(() => false), available: computed(() => true), target: ref('realm') } as never,
        s3: { activeContext: ref(null), hasActiveKey: ref(false), endpoint: ref(null) } as never,
        myGroups: ref([]) as never,
        currentUser: ref(null) as never,
        searchBuckets: (async () => ({ hits: [], nodes_failed: 0 })) as never,
        isTarget: () => true,
        isLocalNode: () => false,
        nodes: computed(() => [node('node-2', 'server', ['kubernetes']), node('laptop', 'user', ['docker'])]),
        getTask: (async () => ({})) as never,
        dataView: ref('tree') as never,
        realmName: computed(() => 'Realm'),
      }),
    )!

    expect(store.nodeMatches.value.matches.map((entry) => entry.nodeId)).toEqual(['node-2'])
    expect(store.nodeMatches.value.total).toBe(1)
    expect(store.executorKindOptions.value.map((option) => option.value)).toEqual(['kubernetes'])
    scope.stop()
  })
})

describe('run buckets', () => {
  it('lists the group buckets of every node but devices, and reads a picked script from its node', async () => {
    const searchBuckets = vi.fn(async () => ({
      hits: [
        { bucket: 'demo', node_id: 'node-2', group_id: 'g1' },
        { bucket: 'shared', node_id: 'node-2', group_id: 'g1' },
        { bucket: 'shared', node_id: 'node-1', group_id: 'g1' },
        { bucket: 'laptop-files', node_id: 'laptop', group_id: 'g1' },
        { bucket: 'other', node_id: 'node-1', group_id: 'g2' },
      ],
      nodes_failed: 0,
      next_cursor: null,
    }))
    const getObjectText = vi.fn(async () => 'print(1)')
    const scope = effectScope()
    const store = scope.run(() =>
      createCustomRun({
        runTarget: { local: computed(() => false), available: computed(() => true), target: ref('realm') } as never,
        s3: { activeContext: ref(null), hasActiveKey: ref(false), endpoint: ref(null), getObjectText, ensureSession: async () => {} } as never,
        myGroups: ref([]) as never,
        currentUser: ref({ id: 'user-1' }) as never,
        searchBuckets: searchBuckets as never,
        isTarget: (id) => id !== 'laptop',
        isLocalNode: (id) => id === 'node-1',
        nodes: computed(() => []),
        getTask: (async () => ({})) as never,
        dataView: ref('tree') as never,
        realmName: computed(() => 'Realm'),
      }),
    )!
    store.groupId.value = 'g1'
    await vi.waitFor(() => expect(store.bucketsLoaded.value).toBe(true))

    expect(searchBuckets).toHaveBeenCalledWith('', expect.objectContaining({ groupId: 'g1' }))
    expect(store.buckets.value).toEqual(['demo', 'shared'])
    expect(store.stagingBucket.value).toBe('demo')
    expect(store.stagingNode.value).toBe('node-2')
    store.stagingBucket.value = 'shared'
    expect(store.stagingNode.value).toBeNull()

    store.onScriptPick({ bucket: 'demo', key: 'tools/a.py', name: 'a.py', nodeId: 'node-2' })
    await vi.waitFor(() => expect(store.selectedScript.value?.content).toBe('print(1)'))
    expect(getObjectText).toHaveBeenCalledWith('demo', 'tools/a.py', 'node-2')
    scope.stop()
  })

  it('never takes a distributed bucket as the default for results', async () => {
    const searchBuckets = vi.fn(async () => ({
      hits: [
        { bucket: 'bakrep', node_id: 'node-2', group_id: 'g1', set_id: 's1' },
        { bucket: 'bakrep', node_id: 'node-3', group_id: 'g1', set_id: 's1' },
        { bucket: 'lab', node_id: 'node-2', group_id: 'g1' },
      ],
      nodes_failed: 0,
      next_cursor: null,
    }))
    const scope = effectScope()
    const store = scope.run(() =>
      createCustomRun({
        runTarget: { local: computed(() => false), available: computed(() => true), target: ref('realm') } as never,
        s3: { activeContext: ref(null), hasActiveKey: ref(false), endpoint: ref(null), ensureSession: async () => {} } as never,
        myGroups: ref([]) as never,
        currentUser: ref({ id: 'user-1' }) as never,
        searchBuckets: searchBuckets as never,
        isTarget: () => true,
        isLocalNode: () => false,
        nodes: computed(() => []),
        getTask: (async () => ({})) as never,
        dataView: ref('tree') as never,
        realmName: computed(() => 'Realm'),
      }),
    )!
    store.groupId.value = 'g1'
    await vi.waitFor(() => expect(store.bucketsLoaded.value).toBe(true))

    expect(store.buckets.value).toEqual(['bakrep', 'lab'])
    expect(store.stagingBucket.value).toBe('lab')
    store.addCapture('/work/out')
    expect(store.outputRows.value[0]?.bucket).toBe('lab')
    scope.stop()
  })
})
