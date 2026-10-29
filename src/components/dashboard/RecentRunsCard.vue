<script setup lang="ts">
// The latest runs the user can see: name, how long it took, where it ran and its state in one
// colored word. A name opens the run, a place the node.
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import type { RecentRun } from '@/composables/useRecentRuns'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { stateTone } from '@/lib/stateBadge'
import { isActiveTesState, TES_STATE_META } from '@/lib/tes'
import { formatDuration } from '@/lib/utils'

const props = defineProps<{ runs: RecentRun[]; state: 'idle' | 'loading' | 'ready' | 'failed' | 'off' }>()
const SHOWN = 5

const { displayName, localNodeId } = useRealmNodes()
const shown = computed(() => props.runs.slice(0, SHOWN))

function took(run: RecentRun): string {
  const log = run.task.logs?.at(-1)
  const start = log?.start_time ? Date.parse(log.start_time) : NaN
  const end = log?.end_time ? Date.parse(log.end_time) : isActiveTesState(run.task.state) ? Date.now() : NaN
  if (!Number.isFinite(start) || !Number.isFinite(end)) return ''
  return `${formatDuration(end - start)}${log?.end_time ? '' : ' so far'}`
}
const where = (run: RecentRun) => run.nodeId ?? localNodeId.value
const TONE_TEXT: Record<string, string> = {
  done: 'text-emerald-600 dark:text-emerald-400',
  failed: 'text-destructive',
  attention: 'text-amber-700 dark:text-amber-300',
}
function stateClass(run: RecentRun): string {
  return TONE_TEXT[stateTone(run.task.state ?? 'UNKNOWN')] ?? 'text-muted-foreground'
}
</script>

<template>
  <section class="surface flex flex-col overflow-hidden" aria-labelledby="recent-runs-heading">
    <header class="flex items-center justify-between gap-3 px-5 py-4">
      <h2 id="recent-runs-heading" class="font-display text-sm font-semibold text-aruna-navy">Recent runs</h2>
      <RouterLink :to="{ name: 'compute' }" class="text-xs font-medium text-primary hover:underline">All runs</RouterLink>
    </header>
    <p v-if="state === 'loading' || state === 'idle'" class="px-5 pb-4 text-xs text-muted-foreground">Reading your runs…</p>
    <p v-else-if="state === 'failed'" class="px-5 pb-4 text-xs text-muted-foreground">Your runs could not be read right now.</p>
    <p v-else-if="!shown.length" class="px-5 pb-4 text-xs text-muted-foreground">No runs yet.</p>
    <table v-else class="w-full text-sm">
      <thead class="text-[11px] uppercase tracking-wider text-muted-foreground">
        <tr>
          <th class="px-5 py-2 text-left font-semibold">Run</th>
          <th class="px-3 py-2 text-left font-semibold">Took</th>
          <th class="px-3 py-2 text-left font-semibold">Where</th>
          <th class="px-5 py-2 text-left font-semibold">State</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="run in shown" :key="run.task.id" class="border-t border-border">
          <td class="max-w-0 px-5 py-2.5">
            <RouterLink
              v-if="run.task.id"
              :to="{ name: 'task', params: { taskId: run.task.id } }"
              class="block truncate text-foreground hover:underline"
              :title="run.task.name || 'Untitled run'"
            >{{ run.task.name || 'Untitled run' }}</RouterLink>
          </td>
          <td class="whitespace-nowrap px-3 py-2.5 text-xs tabular-nums text-muted-foreground">{{ took(run) }}</td>
          <td class="whitespace-nowrap px-3 py-2.5 text-xs">
            <RouterLink v-if="where(run)" :to="{ name: 'node', params: { nodeId: where(run)! } }" class="text-muted-foreground hover:underline">
              {{ displayName(where(run)) }}
            </RouterLink>
          </td>
          <td class="whitespace-nowrap px-5 py-2.5 text-xs" :class="stateClass(run)">{{ TES_STATE_META[run.task.state ?? 'UNKNOWN'].label.toLowerCase() }}</td>
        </tr>
      </tbody>
    </table>
  </section>
</template>
