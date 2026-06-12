<script setup lang="ts">
import type { Realm } from '@/data/types'
import { cn } from '@/lib/utils'

withDefaults(
  defineProps<{
    realm: Realm | undefined
    size?: 'sm' | 'md'
    class?: string
  }>(),
  { size: 'sm' },
)
</script>

<template>
  <span
    v-if="realm"
    :class="
      cn(
        'inline-flex items-center gap-1.5 rounded-full border bg-card/80 font-medium text-foreground/90',
        size === 'sm'
          ? 'px-2 py-0.5 text-[11px]'
          : 'px-2.5 py-1 text-xs',
        $props.class,
      )
    "
    :style="{ borderColor: `${realm.color}55` }"
  >
    <span
      class="h-1.5 w-1.5 rounded-full"
      :style="{ backgroundColor: realm.color }"
    />
    {{ realm.shortName }}
  </span>
</template>
