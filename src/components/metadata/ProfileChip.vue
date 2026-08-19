<script lang="ts">
export function profileChipValidationLabel(validation?: { status: string }): string {
  return validation?.status ?? 'not checked'
}
</script>

<script setup lang="ts">
// Cards can resolve a stored reference locally, but conformance always comes
// from the backend's revision-bound status route.
import { computed, watch, type DeepReadonly } from 'vue'
import { ListChecks } from '@lucide/vue'
import { useAruna, readableIri, type ProfileValidationPresentation } from '@/composables/useAruna'
import type { MetadataDoc } from '@/data/types'

const props = defineProps<{ doc: MetadataDoc; statusOnly?: boolean }>()
const {
  profiles,
  profileValidationStatuses,
  loadProfileValidationStatus,
  revalidateProfileValidationStatus,
} = useAruna()

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
  chip.value.profileId ? `Profile reference: ${chip.value.label}` : chip.value.title || undefined,
)

const validation = computed<DeepReadonly<ProfileValidationPresentation>>(() => profileValidationStatuses.value[props.doc.ulid] ?? {
  status: 'not checked' as const,
  stale: false,
  canRevalidate: false,
})
const validationTitle = computed(() => {
  if (validation.value.message) return validation.value.message
  const revision = validation.value.response?.profile_revision
  return revision ? `Validated Profile revision: ${revision}` : undefined
})
const validationClass = computed(() => {
  if (validation.value.status === 'verified') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
  if (validation.value.status === 'invalid') return 'border-destructive/30 bg-destructive/5 text-destructive'
  if (validation.value.status === 'partial') return 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300'
  return 'border-border bg-muted/40 text-muted-foreground'
})

watch(
  () => props.doc.ulid,
  (documentId) => {
    if (documentId) void loadProfileValidationStatus(documentId).catch(() => undefined)
  },
  { immediate: true },
)

function revalidate(event: Event) {
  event.preventDefault()
  event.stopPropagation()
  void revalidateProfileValidationStatus(props.doc.ulid).catch(() => undefined)
}

function retry(event: Event) {
  event.preventDefault()
  event.stopPropagation()
  void loadProfileValidationStatus(props.doc.ulid, true).catch(() => undefined)
}
</script>

<template>
  <span class="inline-flex shrink-0 flex-wrap items-center gap-1">
    <span
      v-if="!props.statusOnly"
      class="inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary"
      :title="title"
    >
      <ListChecks class="h-3 w-3" /> Reference: {{ chip.label }}
    </span>
    <span
      class="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px]"
      :class="validationClass"
      :title="validationTitle"
    >
      Validation: {{ profileChipValidationLabel(validation) }}
      <button
        v-if="validation.stale"
        type="button"
        class="font-medium underline underline-offset-2"
        @click="revalidate"
      >Revalidate</button>
      <button
        v-else-if="validation.status === 'unavailable'"
        type="button"
        class="font-medium underline underline-offset-2"
        @click="retry"
      >Retry</button>
    </span>
  </span>
</template>
