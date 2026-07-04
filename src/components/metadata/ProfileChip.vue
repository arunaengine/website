<script setup lang="ts">
// Non-interactive profile chip shared by the dashboard / search / recent-datasets
// cards (L6). Those cards are themselves RouterLinks, so a nested profile anchor
// would be invalid HTML — this stays a titled span. Resolution: a locally-known
// profile → its short name (tooltip "Profile: <name>"); otherwise the first raw
// conformsTo IRI (tooltip = the full IRI); no conformance → "No profile".
import { computed } from 'vue'
import { ListChecks } from '@lucide/vue'
import { useAruna, readableIri } from '@/composables/useAruna'
import type { MetadataDoc } from '@/data/types'

const props = defineProps<{ doc: MetadataDoc }>()
const { profiles } = useAruna()

const chip = computed(() => {
  const resolved = profiles.value.find((profile) => profile.id === props.doc.profileId)
  if (resolved) return { label: resolved.shortName, profileId: resolved.id, title: '' }
  const iri = props.doc.conformsToIds?.[0]
  if (iri) return { label: readableIri(iri), profileId: '', title: iri }
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
