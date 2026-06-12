<script setup lang="ts">
import { DialogDescription } from 'radix-vue'
import { computed } from 'vue'
import { cn } from '@/lib/utils'

const props = defineProps<{ class?: string }>()
const classes = computed(() =>
  cn('text-sm text-muted-foreground', props.class),
)
</script>

<template>
  <DialogDescription :class="classes"><slot /></DialogDescription>
</template>
