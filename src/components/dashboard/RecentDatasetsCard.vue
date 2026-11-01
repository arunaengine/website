<script setup lang="ts">
// The latest datasets and run records, newest first from the registry, under a section heading. A
// node that cannot order by recency falls back to the loaded catalog window; a failed refresh keeps
// the list shown. It says there are none only when the registry was read to its end.
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { Clock, FileJson2, FileText, Scale, Users } from '@lucide/vue'
import Button from '@/components/ui/Button.vue'
import SectionHeading from '@/components/ui/SectionHeading.vue'
import StatusMark from '@/components/ui/StatusMark.vue'
import type { MetadataDoc } from '@/data/types'
import { useAruna } from '@/composables/useAruna'
import { licenseOf } from '@/lib/datasetFacts'
import { relativeTime } from '@/lib/utils'

const props = withDefaults(defineProps<{ refreshRevision?: number }>(), { refreshRevision: 0 })
const SHOWN = 5

const { metadata, myGroups, listRecentMetadata, sessionEpoch } = useAruna()
const recent = ref<{ documents: MetadataDoc[]; complete: boolean } | null>(null)
const settled = ref(false)
let round = 0

async function load() {
  const mine = ++round
  const epoch = sessionEpoch.value
  const answer = await listRecentMetadata(SHOWN).catch(() => null)
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
  (recent.value?.documents ?? [...metadata.value].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))).slice(0, SHOWN),
)
const knownNone = computed(() => recent.value?.complete === true)
const groupName = (doc: MetadataDoc) => myGroups.value.find((group) => group.id === doc.realmId)?.name ?? null
const files = (doc: MetadataDoc) => doc.linkedObjects?.length ?? 0
</script>

<template>
  <section class="flex flex-col" aria-labelledby="recent-datasets-heading">
    <SectionHeading id="recent-datasets-heading" title="Recent datasets" :icon="FileJson2">
      <template #actions>
        <Button variant="outline" size="sm" as-child><RouterLink :to="{ name: 'datasets' }">All datasets</RouterLink></Button>
      </template>
    </SectionHeading>
    <div class="surface flex flex-1 flex-col overflow-hidden">
      <p v-if="!settled" class="px-5 py-4 text-xs text-muted-foreground">Reading the latest datasets…</p>
      <!-- The walk stopped early or only the loaded window was read: older datasets may exist. -->
      <p v-else-if="!shown.length && !knownNone" class="px-5 py-4 text-xs text-muted-foreground">No recent datasets.</p>
      <div v-else-if="!shown.length" class="flex items-center justify-between gap-3 px-5 py-4 text-xs text-muted-foreground">
        <span>No datasets you can see yet.</span>
        <RouterLink :to="{ name: 'dataset-new' }" class="font-medium text-primary hover:underline">Create dataset</RouterLink>
      </div>
      <ul v-else class="divide-y divide-border-subtle">
        <li v-for="doc in shown" :key="doc.ulid" class="flex items-start gap-3 px-5 py-3 hover:bg-muted/40">
          <StatusMark label="Published" class="mt-0.5" />
          <div class="min-w-0 flex-1">
            <RouterLink :to="{ name: 'dataset', params: { id: doc.ulid } }" class="line-clamp-2 break-words text-sm font-medium text-foreground hover:underline">
              {{ doc.title }}
            </RouterLink>
            <p class="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs tabular-nums text-muted-foreground">
              <span v-if="files(doc)" class="inline-flex items-center gap-1"><FileText class="h-3 w-3" />{{ files(doc) }} {{ files(doc) === 1 ? 'file' : 'files' }}</span>
              <span v-if="groupName(doc)" class="inline-flex items-center gap-1"><Users class="h-3 w-3" />{{ groupName(doc) }}</span>
              <span v-if="doc.license" class="inline-flex items-center gap-1"><Scale class="h-3 w-3" />{{ licenseOf(doc) }}</span>
              <span class="inline-flex items-center gap-1"><Clock class="h-3 w-3" />Updated {{ relativeTime(doc.updatedAt) }}</span>
            </p>
          </div>
        </li>
      </ul>
    </div>
  </section>
</template>
