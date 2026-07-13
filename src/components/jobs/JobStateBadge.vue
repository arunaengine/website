<script setup lang="ts">
import Badge from '@/components/ui/Badge.vue'
import { JOB_STATE_META, type JobState } from '@/lib/jobs'
import { computed } from 'vue'

// Single source for the job state colours (list, detail drawer, staging panel).
const props = defineProps<{ state: JobState }>()
const meta = computed(() => JOB_STATE_META[props.state] ?? { label: props.state, variant: 'outline' as const })
</script>

<template>
  <Badge :variant="meta.variant">{{ meta.label }}</Badge>
</template>
