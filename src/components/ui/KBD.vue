<script setup lang="ts">
import { computed } from 'vue'
import { cn } from '@/lib/utils'
const props = defineProps<{ class?: string }>()
const classes = computed(() =>
  cn(
    'inline-flex items-center rounded border border-border bg-muted/70 px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground shadow-sm',
    props.class,
  ),
)
</script>
<template>
  <kbd :class="classes"><slot /></kbd>
</template>
