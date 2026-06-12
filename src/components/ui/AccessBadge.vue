<script setup lang="ts">
import type { BucketAccess, GroupRole, RealmRole } from '@/data/types'
import { computed } from 'vue'
import { cn } from '@/lib/utils'

const props = defineProps<{
  access?: BucketAccess | GroupRole | RealmRole | string
  label?: string
  class?: string
}>()

const style = computed(() => {
  switch (props.access) {
    case 'admin':
    case 'realm-admin':
      return 'bg-aruna-navy text-white border-aruna-navy dark:bg-white dark:text-aruna-navy dark:border-white'
    case 'realm-operator':
      return 'bg-aruna-royal/10 text-aruna-royal border-aruna-royal/30'
    case 'user':
    case 'read-write':
      return 'bg-aruna-sky/10 text-aruna-royal border-aruna-sky/30'
    case 'auditor':
      return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-200 dark:border-amber-400/20'
    case 'realm-member':
    case 'viewer':
    case 'read-only':
      return 'bg-muted text-muted-foreground border-border'
    case 'realm-guest':
      return 'bg-muted/60 text-muted-foreground border-dashed border-border'
    default:
      return 'bg-muted text-muted-foreground border-border'
  }
})
</script>

<template>
  <span
    :class="
      cn(
        'inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide',
        style,
        $props.class,
      )
    "
  >
    {{ label ?? access }}
  </span>
</template>
