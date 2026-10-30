<script setup lang="ts">
// The leading icon of a dataset row or card: its type, green or red for a finished run.
import { computed } from 'vue'
import { FileJson2, ListChecks, Play } from '@lucide/vue'
import IconTile, { type TileTone } from '@/components/ui/IconTile.vue'
import { crateRunState, crateTypeOf } from '@/lib/crateType'
import type { MetadataDoc } from '@/data/types'

const props = withDefaults(defineProps<{ doc: MetadataDoc; size?: 'sm' | 'lg' }>(), { size: 'sm' })
const type = computed(() => crateTypeOf(props.doc))
const icon = computed(() => (type.value === 'profile' ? ListChecks : type.value.endsWith('-run') ? Play : FileJson2))
const tone = computed<TileTone>(() => {
  if (!type.value.endsWith('-run')) return 'muted'
  return crateRunState(props.doc.roCrate) === 'failed' ? 'failed' : 'ok'
})
</script>

<template>
  <IconTile :icon="icon" :tone="tone" :size="size" />
</template>
