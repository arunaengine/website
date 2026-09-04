<script setup lang="ts">
// Two texts the assistant asked to compare, line by line, as one unified list.
import { computed } from 'vue'
import { lineDiff } from '@/lib/assistant/lineDiff'
import type { DiffView } from '@/lib/assistant/types'
import { GitCompare } from '@lucide/vue'

const props = defineProps<{ view: DiffView }>()

const lines = computed(() => lineDiff(props.view.before, props.view.after))
const added = computed(() => lines.value.filter((line) => line.op === 'add').length)
const removed = computed(() => lines.value.filter((line) => line.op === 'remove').length)

const TONE = {
  add: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  remove: 'bg-destructive/10 text-destructive',
  same: 'text-muted-foreground',
}

const MARK = { add: '+', remove: '-', same: ' ' }
</script>

<template>
  <div class="surface-inline overflow-hidden text-xs">
    <div class="flex items-center gap-2 border-b border-border/60 px-2.5 py-1.5">
      <GitCompare class="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
      <span class="min-w-0 flex-1 truncate font-medium text-foreground">{{ view.title }}</span>
      <span class="shrink-0 font-mono text-[10px] text-muted-foreground">+{{ added }} -{{ removed }}</span>
    </div>
    <p class="border-b border-border/60 px-2.5 py-1 text-[11px] text-muted-foreground">
      {{ view.beforeLabel }} → {{ view.afterLabel }}
    </p>
    <p v-if="!added && !removed" class="px-3 py-2.5 text-muted-foreground">The two texts are the same.</p>
    <div v-else class="scrollbar-thin max-h-72 overflow-auto py-1">
      <div
        v-for="(line, index) in lines"
        :key="index"
        class="flex gap-2 px-2.5 font-mono text-[11px] leading-5"
        :class="TONE[line.op]"
      >
        <span class="shrink-0 select-none opacity-70" aria-hidden="true">{{ MARK[line.op] }}</span>
        <span class="min-w-0 whitespace-pre-wrap break-words">{{ line.text }}</span>
      </div>
    </div>
  </div>
</template>
