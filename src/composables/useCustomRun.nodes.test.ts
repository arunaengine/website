import { computed, effectScope, ref } from 'vue'
import { describe, expect, it } from 'vitest'
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
