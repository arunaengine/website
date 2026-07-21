<script setup lang="ts">
// Non-interactive chip for cards that are already links. It shows a resolved
// profile, one unresolved IRI, or an honest count for multiple profiles.
import { computed } from 'vue'
import { ListChecks } from '@lucide/vue'
import { useAruna, readableIri } from '@/composables/useAruna'
import type { MetadataDoc } from '@/data/types'

const props = defineProps<{ doc: MetadataDoc }>()
const { profiles } = useAruna()

const chip = computed(() => {
  const resolved = profiles.value.find((profile) => profile.id === props.doc.profileId)
  if (resolved) return { label: resolved.shortName, profileId: resolved.id, title: '' }
  const iris = props.doc.conformsToIds ?? []
  if (iris.length === 1) {
    for (const iri of iris) return { label: readableIri(iri), profileId: '', title: iri }
  }
  if (iris.length > 1) return { label: `${iris.length} profiles`, profileId: '', title: iris.join('\n') }
  return { label: 'No profile', profileId: '', title: '' }
})

const title = computed(() =>
  chip.value.profileId ? `Profile: ${chip.value.label}` : chip.value.title || undefined,
)
</script>

<template>
  <span
    class="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary"
    :title="title"
  >
    <ListChecks class="h-3 w-3" /> {{ chip.label }}
  </span>
</template>
