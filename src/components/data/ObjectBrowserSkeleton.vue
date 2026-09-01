<script setup lang="ts">
// The dialog browser's placeholder while its session opens: the bucket list
// and the object table in their final positions, sized for a dialog.
import Skeleton from '@/components/ui/Skeleton.vue'

withDefaults(defineProps<{ sidebar?: boolean }>(), { sidebar: true })
</script>

<template>
  <div :class="sidebar ? 'grid gap-3 sm:grid-cols-[200px_minmax(0,1fr)]' : ''" aria-busy="true">
    <span class="sr-only">Opening the session</span>

    <aside v-if="sidebar" class="overflow-hidden rounded-md border border-border">
      <header class="flex items-center justify-between border-b border-border px-3 py-2">
        <Skeleton class="h-3.5 w-14" />
        <Skeleton class="size-5 rounded-full" />
      </header>
      <div class="py-1">
        <div v-for="row in 4" :key="row" class="px-3 py-1.5"><Skeleton class="h-5 w-full" /></div>
      </div>
    </aside>

    <div class="min-w-0">
      <div class="pb-2"><Skeleton class="h-4 w-40" /></div>
      <div class="overflow-hidden rounded-md border border-border">
        <div class="border-b border-border px-3 py-2"><Skeleton class="h-3 w-32" /></div>
        <div class="divide-y divide-border">
          <div v-for="row in 5" :key="row" class="flex items-center gap-3 px-3 py-2">
            <Skeleton class="h-4 w-4 shrink-0" />
            <Skeleton class="h-4 min-w-0 flex-1" />
            <Skeleton class="h-4 w-12 shrink-0" />
            <Skeleton class="h-4 w-16 shrink-0" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
