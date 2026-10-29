// Running import (staging) jobs per realm node, for the activity badges on the landing view. A node
// lists only the signed-in user's own jobs that it owns, oldest first and without a state filter, so a
// few pages are read per node and anything past them makes the count a lower bound.
import { computed, ref } from 'vue'
import { useAruna } from '@/composables/useAruna'

const PAGE_SIZE = 200
const MAX_PAGES = 3

export interface NodeImports {
  running: number
  /** More jobs were listed than read, so `running` is a lower bound. */
  more: boolean
}

export function useNodeImports() {
  const { listStagingJobs, sessionEpoch } = useAruna()
  const imports = ref(new Map<string, NodeImports>())
  const failed = ref(0)
  let run = 0

  async function count(nodeId: string | null): Promise<NodeImports> {
    let running = 0
    let cursor: string | undefined
    for (let page = 0; page < MAX_PAGES; page++) {
      const answer = await listStagingJobs(cursor, PAGE_SIZE, nodeId)
      running += answer.jobs.filter((job) => job.state === 'running').length
      cursor = answer.next_cursor
      if (!cursor) return { running, more: false }
    }
    return { running, more: true }
  }

  /** Reads each node once; a node that does not answer gets no badge and makes the total a lower bound. */
  async function load(nodeIds: readonly string[], isLocal: (nodeId: string) => boolean) {
    const mine = ++run
    const epoch = sessionEpoch.value
    const answers = await Promise.all(
      nodeIds.map(async (id) => [id, await count(isLocal(id) ? null : id).catch(() => null)] as const),
    )
    if (mine !== run || epoch !== sessionEpoch.value) return
    imports.value = new Map(answers.filter((entry): entry is readonly [string, NodeImports] => entry[1] !== null))
    failed.value = answers.length - imports.value.size
  }

  const total = computed(() => {
    const counts = [...imports.value.values()]
    return {
      running: counts.reduce((sum, entry) => sum + entry.running, 0),
      atLeast: failed.value > 0 || counts.some((entry) => entry.more),
    }
  })

  return { imports, total, load }
}
