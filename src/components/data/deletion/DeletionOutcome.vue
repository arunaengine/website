<script setup lang="ts">
// The exact per-entry result of a selection delete, one line per object key or
// folder prefix. Only a confirmed success is cleared from the selection.
import type { SelectionOutcome } from './useSelectionDelete'

const props = defineProps<{ outcome: SelectionOutcome }>()
</script>

<template>
  <section class="space-y-2 rounded-md border border-border px-3 py-2 text-xs">
    <h4 class="font-medium text-foreground">Deletion outcome</h4>
    <p class="font-medium">
      Committed: {{ props.outcome.committed.length }}. Failed: {{ props.outcome.failed.length }}. Unknown: {{ props.outcome.unknown.length }}.
    </p>
    <div v-if="props.outcome.committed.length" class="space-y-1">
      <p class="font-medium text-emerald-700 dark:text-emerald-300">Committed entries</p>
      <ul class="space-y-1 pl-4 font-mono text-[10px] text-muted-foreground">
        <li v-for="key in props.outcome.committed" :key="key" class="list-disc break-all">{{ key }}</li>
      </ul>
      <p class="text-muted-foreground">Only these confirmed-successful entries were cleared from the selection.</p>
    </div>
    <div v-if="props.outcome.failed.length" class="space-y-1 text-destructive">
      <p class="font-medium">Failed entries</p>
      <ul class="space-y-1 pl-4">
        <li v-for="issue in props.outcome.failed" :key="issue.key" class="list-disc break-all">
          <span class="font-mono text-[10px]">{{ issue.key }}</span>: {{ issue.message }}
        </li>
      </ul>
      <p>Failed entries stay selected for review or retry.</p>
    </div>
    <div v-if="props.outcome.unknown.length" class="space-y-1 text-amber-800 dark:text-amber-300">
      <p class="font-medium">Unknown entries</p>
      <ul class="space-y-1 pl-4">
        <li v-for="issue in props.outcome.unknown" :key="issue.key" class="list-disc break-all">
          <span class="font-mono text-[10px]">{{ issue.key }}</span>: {{ issue.message }}
        </li>
      </ul>
      <p>The transport returned no definitive result. Unknown entries stay selected for review or retry.</p>
    </div>
  </section>
</template>
