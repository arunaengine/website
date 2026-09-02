<script setup lang="ts">
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Progress from '@/components/ui/Progress.vue'
import Spinner from '@/components/ui/Spinner.vue'
import { useUploadQueue, type UploadQueueItem } from '@/composables/useUploadQueue'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { AlertTriangle, ChevronDown, ChevronUp, UploadCloud, X } from '@lucide/vue'
import { stateVariant, type BadgeVariant } from '@/lib/stateBadge'

// Compact floating transfers list, bottom-right (file-transfer toasts): one
// row per queued upload with live progress. Completed rows clear themselves
// after a moment; failed and canceled rows stay until dismissed. Renders
// nothing while the queue is empty. Deliberately a floating panel, never a
// side sheet.
const queue = useUploadQueue()

const collapsed = ref(false)

const activeCount = computed(
  () => queue.items.value.filter((item) => item.state === 'queued' || item.state === 'uploading').length,
)
const overallProgress = computed(() => {
  const active = queue.items.value.filter((item) => item.state === 'queued' || item.state === 'uploading')
  if (!active.length) return null
  return Math.round(active.reduce((sum, item) => sum + item.progress, 0) / active.length)
})

// Auto-clear: a row that reaches 'done' disappears a few seconds later.
const DONE_LINGER_MS = 4000
const timers = new Map<number, ReturnType<typeof setTimeout>>()

watch(
  queue.items,
  (items) => {
    for (const item of items) {
      if (item.state === 'done' && !timers.has(item.id)) {
        timers.set(
          item.id,
          setTimeout(() => {
            timers.delete(item.id)
            queue.dismiss(item.id)
          }, DONE_LINGER_MS),
        )
      }
    }
  },
  { deep: true },
)

onBeforeUnmount(() => {
  for (const timer of timers.values()) clearTimeout(timer)
  timers.clear()
})

function transferVariant(item: UploadQueueItem): BadgeVariant {
  if (item.pausedForSession) return 'warn'
  return stateVariant(item.state)
}
</script>

<template>
  <div
    v-if="queue.items.value.length"
    class="fixed bottom-4 right-4 z-50 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-border bg-card shadow-lg md:bottom-6 md:right-6"
    role="status"
    aria-label="File transfers"
  >
    <button
      type="button"
      class="flex w-full items-center gap-2 border-b border-border bg-muted/40 px-3 py-2 text-left"
      :aria-expanded="!collapsed"
      @click="collapsed = !collapsed"
    >
      <UploadCloud class="h-4 w-4 shrink-0 text-primary" />
      <span class="text-xs font-semibold text-foreground">
        {{ activeCount ? `Uploading ${activeCount} file${activeCount === 1 ? '' : 's'}` : 'Transfers' }}
      </span>
      <span v-if="overallProgress !== null" class="font-mono text-[11px] text-muted-foreground">{{ overallProgress }}%</span>
      <span class="ml-auto flex items-center gap-1">
        <Spinner v-if="activeCount" label="Uploading" class="text-primary" />
        <component :is="collapsed ? ChevronUp : ChevronDown" class="h-4 w-4 text-muted-foreground" />
      </span>
    </button>

    <ul v-if="!collapsed" class="scrollbar-thin max-h-64 overflow-y-auto">
      <li
        v-for="item in queue.items.value"
        :key="item.id"
        class="space-y-1 border-b border-border/60 px-3 py-2 last:border-b-0"
      >
        <div class="flex items-center gap-2 text-xs">
          <span class="min-w-0 flex-1 truncate font-mono" :title="`${item.bucket}/${item.key}`">{{ item.name }}</span>
          <Badge
            v-if="item.state !== 'uploading' && item.state !== 'queued'"
            :variant="transferVariant(item)"
            size="sm"
            class="shrink-0 uppercase"
          >
            {{ item.pausedForSession ? 'PAUSED' : item.state }}
          </Badge>
          <span v-else class="shrink-0 font-mono text-[11px] text-muted-foreground">{{ item.progress }}%</span>
          <Button
            v-if="item.state === 'uploading' || item.state === 'queued'"
            variant="ghost"
            size="icon-sm"
            class="h-5 w-5 shrink-0"
            :aria-label="`Cancel upload of ${item.name}`"
            @click="queue.cancel(item)"
          >
            <X class="size-3" />
          </Button>
          <Button
            v-else
            variant="ghost"
            size="icon-sm"
            class="h-5 w-5 shrink-0"
            :aria-label="`Dismiss ${item.name}`"
            @click="queue.dismiss(item.id)"
          >
            <X class="size-3" />
          </Button>
        </div>
        <Progress
          v-if="item.state === 'uploading' || item.state === 'queued'"
          :value="item.progress"
          :warn="101"
          :critical="101"
          class="h-1"
        />
        <p
          v-if="item.overwrite && item.state !== 'error' && item.state !== 'canceled'"
          class="flex items-center gap-1 text-[10px] text-amber-700 dark:text-amber-400"
        >
          <AlertTriangle class="h-3 w-3 shrink-0" /> Overwrites existing object
        </p>
        <p
          v-if="item.error"
          class="break-words text-[10px]"
          :class="item.state === 'uploading' ? 'text-muted-foreground' : item.pausedForSession ? 'text-amber-700 dark:text-amber-400' : 'text-destructive'"
        >{{ item.error }}</p>
        <div v-if="item.state === 'error' || item.state === 'canceled'" class="flex items-center gap-2">
          <button class="text-[10px] font-medium text-primary hover:underline" @click="queue.retry(item)">Retry</button>
          <RouterLink
            v-if="item.quotaExceeded"
            :to="item.groupId ? { name: 'group', params: { id: item.groupId }, hash: '#storage-use' } : { name: 'groups' }"
            class="text-[10px] font-medium text-primary hover:underline"
          >
            View group quota
          </RouterLink>
        </div>
      </li>
    </ul>
  </div>
</template>
