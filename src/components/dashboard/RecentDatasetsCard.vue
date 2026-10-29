<script setup lang="ts">
// The latest datasets, newest first from the registry. Run records have their own card, so the
// registry walk pages past them until five datasets are found. A node that cannot order by recency
// falls back to the loaded catalog window, without runs too; a failed refresh keeps the list shown.
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import type { MetadataDoc } from '@/data/types'
import { useAruna } from '@/composables/useAruna'
import { datasetPurposeOf } from '@/lib/datasetPurpose'
import { relativeTime } from '@/lib/utils'

const props = withDefaults(defineProps<{ refreshRevision?: number }>(), { refreshRevision: 0 })
const SHOWN = 5

const { metadata, listRecentMetadata, sessionEpoch } = useAruna()
const recent = ref<MetadataDoc[] | null>(null)
const settled = ref(false)
let round = 0

async function load() {
  const mine = ++round
  const epoch = sessionEpoch.value
  const answer = await listRecentMetadata(SHOWN, { skipRuns: true }).catch(() => null)
  if (mine !== round || epoch !== sessionEpoch.value) return
  if (answer || !settled.value) recent.value = answer
  settled.value = true
}
watch([sessionEpoch, () => props.refreshRevision], () => void load(), { immediate: true })
watch(sessionEpoch, () => {
  recent.value = null
  settled.value = false
}, { flush: 'sync' })

const shown = computed(() =>
  (recent.value ?? [...metadata.value].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)))
    .filter((doc) => datasetPurposeOf(doc) !== 'process-run')
    .slice(0, SHOWN),
)
</script>

<template>
  <section class="surface flex flex-col overflow-hidden" aria-labelledby="recent-datasets-heading">
    <header class="flex items-center justify-between gap-3 px-5 py-4">
      <h2 id="recent-datasets-heading" class="font-display text-sm font-semibold text-aruna-navy">Recent datasets</h2>
      <RouterLink :to="{ name: 'datasets' }" class="text-xs font-medium text-primary hover:underline">All datasets</RouterLink>
    </header>
    <p v-if="!settled" class="px-5 pb-4 text-xs text-muted-foreground">Reading the latest datasets…</p>
    <div v-else-if="!shown.length" class="flex items-center justify-between gap-3 px-5 pb-4 text-xs text-muted-foreground">
      <span>No datasets you can see yet.</span>
      <RouterLink :to="{ name: 'dataset-new' }" class="font-medium text-primary hover:underline">Create dataset</RouterLink>
    </div>
    <ul v-else class="divide-y divide-border border-t border-border">
      <li v-for="doc in shown" :key="doc.ulid">
        <RouterLink :to="{ name: 'dataset', params: { id: doc.ulid } }" class="flex items-center justify-between gap-3 px-5 py-2.5 hover:bg-muted/40">
          <span class="min-w-0 truncate text-sm text-foreground">{{ doc.title }}</span>
          <span class="shrink-0 text-[11px] text-muted-foreground">{{ relativeTime(doc.updatedAt) }}</span>
        </RouterLink>
      </li>
    </ul>
  </section>
</template>
