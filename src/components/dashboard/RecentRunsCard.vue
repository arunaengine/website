<script setup lang="ts">
// The latest runs the user can see under a section heading: a check for a completed run, a pill for
// any other state, the name as a link and a line of facts: tool, node, how long it took and when.
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { Container, History, Server, Timer } from '@lucide/vue'
import Button from '@/components/ui/Button.vue'
import SectionHeading from '@/components/ui/SectionHeading.vue'
import StatusMark from '@/components/ui/StatusMark.vue'
import StatusPill from '@/components/ui/StatusPill.vue'
import type { RecentRun } from '@/composables/useRecentRuns'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { isActiveTesState, TES_STATE_META } from '@/lib/tes'
import { formatDuration, relativeTime } from '@/lib/utils'

/** `hideNode`: every run ran on the same node, which the page already names. */
const props = defineProps<{ runs: RecentRun[]; state: 'idle' | 'loading' | 'ready' | 'failed' | 'off'; hideNode?: boolean }>()
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
// The tool is the image name without its registry, path and tag.
function tool(run: RecentRun): string {
  const image = run.task.executors?.[0]?.image ?? ''
  return image.split('/').pop()?.split(/[:@]/)[0] ?? ''
}
const stateLabel = (run: RecentRun) => TES_STATE_META[run.task.state ?? 'UNKNOWN'].label
</script>

<template>
  <section class="flex flex-col" aria-labelledby="recent-runs-heading">
    <SectionHeading id="recent-runs-heading" title="Recent runs" :icon="History">
      <template #actions>
        <slot name="actions">
          <Button variant="outline" size="sm" as-child><RouterLink :to="{ name: 'compute' }">All runs</RouterLink></Button>
        </slot>
      </template>
    </SectionHeading>
    <div class="surface flex flex-1 flex-col overflow-hidden">
      <p v-if="state === 'loading' || state === 'idle'" class="px-5 py-4 text-xs text-muted-foreground">Reading your runs…</p>
      <p v-else-if="state === 'failed'" class="px-5 py-4 text-xs text-muted-foreground">Your runs could not be read right now.</p>
      <p v-else-if="!shown.length" class="px-5 py-4 text-xs text-muted-foreground">No runs yet.</p>
      <ul v-else class="divide-y divide-border-subtle">
        <li v-for="run in shown" :key="run.task.id" class="flex items-start gap-3 px-5 py-3 hover:bg-muted/40">
          <StatusMark
            v-if="run.task.state === 'COMPLETE' || run.task.state === 'EXECUTOR_ERROR' || run.task.state === 'SYSTEM_ERROR'"
            :failed="run.task.state !== 'COMPLETE'"
            :label="stateLabel(run)"
            class="mt-0.5"
          />
          <StatusPill v-else :state="stateLabel(run)" />
          <div class="min-w-0 flex-1">
            <RouterLink
              v-if="run.task.id"
              :to="{ name: 'task', params: { taskId: run.task.id } }"
              class="line-clamp-2 break-words text-sm font-medium text-foreground hover:underline"
              :title="run.task.name || 'Untitled run'"
            >{{ run.task.name || 'Untitled run' }}</RouterLink>
            <p class="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs tabular-nums text-muted-foreground">
              <span v-if="tool(run)" class="inline-flex items-center gap-1"><Container class="h-3 w-3" />{{ tool(run) }}</span>
              <RouterLink v-if="!hideNode && where(run)" :to="{ name: 'node', params: { nodeId: where(run)! } }" class="inline-flex items-center gap-1 hover:underline">
                <Server class="h-3 w-3" />{{ displayName(where(run)) }}
              </RouterLink>
              <span v-if="took(run)" class="inline-flex items-center gap-1"><Timer class="h-3 w-3" />{{ took(run) }}</span>
              <span v-if="run.task.creation_time">{{ relativeTime(run.task.creation_time) }}</span>
            </p>
          </div>
        </li>
      </ul>
    </div>
  </section>
</template>
