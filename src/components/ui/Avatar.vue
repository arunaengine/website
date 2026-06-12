<script setup lang="ts">
import type { User } from '@/data/types'
import { computed } from 'vue'
import { cn } from '@/lib/utils'

const props = withDefaults(
  defineProps<{
    user: User | Pick<User, 'name' | 'initials' | 'avatarColor'>
    size?: 'xs' | 'sm' | 'md' | 'lg'
    title?: string
    class?: string
  }>(),
  { size: 'sm' },
)

const sizeClass = computed(
  () =>
    ({
      xs: 'h-5 w-5 text-[9px]',
      sm: 'h-7 w-7 text-[11px]',
      md: 'h-9 w-9 text-xs',
      lg: 'h-11 w-11 text-sm',
    })[props.size],
)
</script>

<template>
  <span
    :class="
      cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ring-2 ring-background',
        sizeClass,
        props.class,
      )
    "
    :style="{ backgroundColor: user.avatarColor }"
    :title="title ?? user.name"
  >
    {{ user.initials }}
  </span>
</template>
