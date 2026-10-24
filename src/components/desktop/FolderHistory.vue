<script setup lang="ts">
// The decisions taken in one folder, newest first, ending with the day it
// started syncing. Both come from the node; nothing here is made up.
import { computed, onMounted, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { useFolderDecisions } from '@/composables/useFolderDecisions'
import type { FolderMode } from '@/lib/deviceApi'
import { dayTime } from '@/lib/dayTime'
import { modePhrase } from '@/lib/syncStates'
import { History } from '@lucide/vue'

const props = defineProps<{ folderId: string; mode: FolderMode; startedMs: number | null }>()
const decisions = useFolderDecisions()

const entries = computed(() => [
  ...decisions.items.value.map((item) => ({ text: item.text, atMs: item.atMs, outcome: item.outcome })),
  ...(props.startedMs
    ? [{ text: `Started syncing this folder, ${modePhrase(props.mode)}.`, atMs: props.startedMs, outcome: 'applied' as const }]
    : []),
])

onMounted(() => void decisions.load(props.folderId))
watch(() => props.folderId, (id) => void decisions.load(id))
// The folder list reloads after a decision, so the log is read again with it.
defineExpose({ reload: () => decisions.load(props.folderId) })
</script>

<template>
  <section class="surface overflow-hidden">
    <header class="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
      <div class="flex items-center gap-2">
        <History class="h-4 w-4 text-primary" />
        <h2 class="font-display text-sm font-semibold text-aruna-navy">History</h2>
      </div>
      <span class="text-[11px] text-muted-foreground">Your decisions</span>
    </header>
    <p v-if="decisions.state.value === 'loading' || decisions.state.value === 'idle'" class="px-4 py-3 text-[11px] text-muted-foreground">
      Reading the history…
    </p>
    <p v-else-if="decisions.state.value === 'unsupported'" class="px-4 py-3 text-[11px] text-muted-foreground">
      This version of Aruna does not keep a history of decisions yet.
    </p>
    <p v-else-if="decisions.state.value !== 'ready'" class="px-4 py-3 text-[11px] text-destructive">
      The history could not be read{{ decisions.error.value ? `: ${decisions.error.value}` : '.' }}
    </p>
    <ul v-else-if="entries.length" class="divide-y divide-border/70">
      <li
        v-for="(entry, index) in entries"
        :key="index"
        class="px-4 py-2.5 text-[12px] leading-snug"
        :class="entry.outcome === 'failed' ? 'text-destructive' : entry.outcome === 'stale' ? 'text-amber-700 dark:text-amber-300' : 'text-foreground'"
      >
        {{ entry.text }}
        <span v-if="entry.atMs" class="mt-0.5 block text-[11px] text-muted-foreground">{{ dayTime(entry.atMs) }}</span>
      </li>
    </ul>
    <p v-else class="px-4 py-3 text-[11px] text-muted-foreground">You have not decided anything in this folder yet.</p>
    <p v-if="decisions.partial.value" class="px-4 pb-2 text-[11px] text-muted-foreground">
      Part of the history could not be read.
    </p>
    <p class="border-t border-border/70 px-4 py-2 text-[11px] text-muted-foreground">
      Every file is listed, not only these. Open
      <RouterLink :to="{ name: 'device' }" class="text-primary hover:underline">This computer</RouterLink>
      for what is moving now.
    </p>
  </section>
</template>
