<script setup lang="ts">
// The labeled facts of one dataset in a row or card, the same for every type; a missing fact shows a dash.
// A size is shown only when known.
import { computed, watch } from 'vue'
import { useAruna } from '@/composables/useAruna'
import { useUserDirectory } from '@/composables/useUserDirectory'
import { datasetFacts, makersOf } from '@/lib/datasetFacts'
import type { MetadataDoc } from '@/data/types'

const props = defineProps<{ doc: MetadataDoc }>()
const { myGroups } = useAruna()
const userDir = useUserDirectory()
watch(() => makersOf(props.doc).flatMap((person) => person.userId ?? []), (ids) => {
  if (ids.length) void userDir.resolveUsers(ids)
}, { immediate: true })
const facts = computed(() =>
  datasetFacts(props.doc, {
    group: (id) => myGroups.value.find((group) => group.id === id)?.name ?? '',
    person: (id) => userDir.cachedUser(id)?.name ?? '',
  }).filter((fact) => fact.label !== 'Size' || fact.value),
)
</script>

<template>
  <dl class="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
    <div v-for="fact in facts" :key="fact.label" class="min-w-0">
      <dt class="text-xs text-muted-foreground">{{ fact.label }}</dt>
      <dd class="truncate text-xs" :class="fact.value ? 'text-foreground' : 'text-muted-foreground'" :title="fact.title">{{ fact.value || '-' }}</dd>
    </div>
  </dl>
</template>
