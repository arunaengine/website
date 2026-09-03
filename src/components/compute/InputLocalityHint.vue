<script setup lang="ts">
import { computed, watch } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import { useDataLocality } from '@/composables/useDataLocality'
import { parseS3Url } from '@/lib/tes'
import { MapPin } from '@lucide/vue'

// Advisory: it says where this input already is, not where the run will go.
// The planner screens every executor advertisement itself and stores its own
// decision, which can differ from what this hint suggests.
const props = defineProps<{ url: string }>()

const { entryFor, load, nodeNames } = useDataLocality()

const ref_ = computed(() => parseS3Url(props.url))
const entry = computed(() => (ref_.value ? entryFor(ref_.value.bucket, ref_.value.key) : null))

const label = computed(() => {
  const hint = entry.value?.hint
  if (!hint) return null
  if (hint.verdict === 'compute-to-data-possible') {
    return `Compute-to-data possible on ${nodeNames(hint.computeNodeIds)}`
  }
  if (hint.verdict === 'data-will-move') return 'Data will be moved'
  return 'Locality unknown'
})

const variant = computed(() => {
  const verdict = entry.value?.hint?.verdict
  if (verdict === 'compute-to-data-possible') return 'success'
  return verdict === 'data-will-move' ? 'sky' : 'outline'
})

watch(
  ref_,
  (parsed) => {
    if (parsed) void load(parsed.bucket, parsed.key)
  },
  { immediate: true },
)
</script>

<template>
  <span v-if="!ref_" class="text-[10px] text-muted-foreground">Locality needs an s3:// input.</span>
  <span v-else-if="!entry || entry.state === 'loading'" class="text-[10px] text-muted-foreground">
    Checking where this file is…
  </span>
  <span v-else-if="entry.state === 'unavailable'" class="text-[10px] text-muted-foreground">
    This node cannot say where files are stored.
  </span>
  <span v-else-if="entry.state === 'forbidden'" class="text-[10px] text-muted-foreground">
    This token may not read where this file is stored.
  </span>
  <span v-else-if="entry.state === 'error'" class="text-[10px] text-muted-foreground">
    Storage locations could not be read.
  </span>
  <span v-else-if="entry.hint" class="inline-flex items-center gap-1.5" :title="entry.hint.summary">
    <MapPin class="h-3 w-3 shrink-0 text-muted-foreground" />
    <Badge :variant="variant" size="sm">{{ label }}</Badge>
    <span v-if="entry.hint.pendingNodeIds.length" class="text-[10px] text-muted-foreground">
      {{ entry.hint.pendingNodeIds.length }} copy on its way
    </span>
    <span v-if="!entry.hint.complete" class="text-[10px] text-muted-foreground">incomplete view</span>
  </span>
</template>
