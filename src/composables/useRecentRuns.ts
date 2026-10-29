// The latest runs the signed-in user can see, for the landing view: the serving node's own and, on
// the web, a first page of each other realm node, as the run list reads them. A node that does not
// answer or has more pages makes the running count a lower bound.
import { computed, ref, watch } from 'vue'
import { useAruna } from '@/composables/useAruna'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { useTes } from '@/composables/useTes'
import { isDesktop } from '@/lib/desktop'
import { isActiveTesState, type TesTask } from '@/lib/tes'

const PAGE_SIZE = 50

export interface RecentRun {
  task: TesTask
  /** The node that owns the run; null for the node serving the portal. */
  nodeId: string | null
}

export function useRecentRuns() {
  const { sessionEpoch } = useAruna()
  const { tesEnabled, listTasks } = useTes()
  const { targets } = useRealmNodes()
  const runs = ref<RecentRun[]>([])
  const partial = ref(false)
  const state = ref<'idle' | 'loading' | 'ready' | 'failed' | 'off'>('idle')
  let round = 0

  async function load() {
    if (!tesEnabled.value) {
      state.value = 'off'
      return
    }
    const mine = ++round
    const epoch = sessionEpoch.value
    if (state.value !== 'ready') state.value = 'loading'
    const others = isDesktop() ? [] : targets.value.filter((node) => !node.isLocal && node.apiBase)
    const pages = await Promise.all([
      listTasks({ view: 'BASIC', page_size: PAGE_SIZE }).then((page) => ({ nodeId: null as string | null, page }), () => null),
      ...others.map((node) =>
        listTasks({ view: 'BASIC', page_size: PAGE_SIZE }, node.apiBase!).then((page) => ({ nodeId: node.nodeId as string | null, page }), () => null)),
    ])
    if (mine !== round || epoch !== sessionEpoch.value) return
    if (!pages[0]) {
      state.value = 'failed'
      return
    }
    const seen = new Set<string>()
    runs.value = pages
      .flatMap((entry) => (entry ? entry.page.tasks.map((task) => ({ task, nodeId: entry.nodeId })) : []))
      .filter((run) => !seen.has(run.task.id ?? '') && Boolean(seen.add(run.task.id ?? '')))
      .sort((a, b) => (b.task.creation_time ?? '').localeCompare(a.task.creation_time ?? ''))
    partial.value = pages.some((entry) => !entry || Boolean(entry.page.next_page_token))
    state.value = 'ready'
  }

  // Another account or realm: the old runs go at once, and a load under way ends unseen.
  watch(sessionEpoch, () => {
    round++
    runs.value = []
    partial.value = false
    state.value = 'idle'
  }, { flush: 'sync' })

  const running = computed(() => ({
    count: runs.value.filter((run) => isActiveTesState(run.task.state)).length,
    atLeast: partial.value,
  }))

  return { runs, running, state, load }
}
