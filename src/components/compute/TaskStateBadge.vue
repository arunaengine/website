<script setup lang="ts">
import Badge from '@/components/ui/Badge.vue'
import { TES_STATE_META, type TesState } from '@/lib/tes'
import { computed } from 'vue'

// Single source for the TES task state colours (list, detail drawer, e2e
// assertions). Falls back to the UNKNOWN entry when the state is missing.
const props = defineProps<{ state?: TesState }>()
const meta = computed(() => TES_STATE_META[props.state ?? 'UNKNOWN'])
</script>

<template>
  <Badge :variant="meta.variant">{{ meta.label }}</Badge>
</template>
