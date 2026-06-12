<script setup lang="ts">
import { cn } from '@/lib/utils'

defineProps<{
  eyebrow?: string
  title: string
  description?: string
  centered?: boolean
  class?: string
}>()
</script>

<template>
  <div
    :class="
      cn(
        'mb-10 flex flex-col gap-2',
        centered && 'mx-auto max-w-2xl text-center items-center',
        $props.class,
      )
    "
  >
    <span v-if="eyebrow" class="eyebrow">{{ eyebrow }}</span>
    <h2 class="section-title">{{ title }}</h2>
    <p v-if="description" class="max-w-2xl text-sm text-muted-foreground md:text-base">
      {{ description }}
    </p>
  </div>
</template>
