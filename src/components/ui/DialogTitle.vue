<script setup lang="ts">
import { DialogTitle } from 'radix-vue'
import { computed } from 'vue'
import { cn } from '@/lib/utils'

const props = defineProps<{ class?: string }>()
const classes = computed(() =>
  cn('text-lg font-semibold leading-none tracking-tight font-display', props.class),
)
</script>

<template>
  <DialogTitle :class="classes"><slot /></DialogTitle>
</template>
