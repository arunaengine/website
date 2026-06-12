<script setup lang="ts">
import { TabsList } from 'radix-vue'
import { computed } from 'vue'
import { cn } from '@/lib/utils'

const props = defineProps<{ class?: string }>()
const classes = computed(() =>
  cn(
    'inline-flex h-9 items-center justify-center rounded-lg bg-muted/70 p-1 text-muted-foreground',
    props.class,
  ),
)
</script>

<template>
  <TabsList :class="classes"><slot /></TabsList>
</template>
