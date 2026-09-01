<script setup lang="ts">
// One placeholder for the whole Data view: the bucket sidebar and the object
// browser in their final positions, so opening a session and loading the group
// data swap into the real view instead of stacking loading states.
import Skeleton from '@/components/ui/Skeleton.vue'
</script>

<template>
  <div class="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]" aria-busy="true">
    <span class="sr-only">Loading buckets and objects</span>

    <aside class="space-y-3">
      <div class="surface p-3"><Skeleton class="h-9 w-full" /></div>
      <div class="surface overflow-hidden">
        <header class="flex items-center justify-between border-b border-border px-4 py-3">
          <Skeleton class="h-4 w-20" />
          <Skeleton class="size-5 rounded-full" />
        </header>
        <div class="py-1">
          <div v-for="row in 6" :key="row" class="px-4 py-2"><Skeleton class="h-6 w-full" /></div>
        </div>
      </div>
    </aside>

    <div class="min-w-0 space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <Skeleton class="h-6 w-56" />
        <div class="flex items-center gap-2">
          <Skeleton class="h-8 w-24" />
          <Skeleton class="h-8 w-24" />
          <Skeleton class="h-8 w-8" />
        </div>
      </div>
      <div class="surface overflow-hidden">
        <div class="border-b border-border px-4 py-3"><Skeleton class="h-4 w-40" /></div>
        <div class="divide-y divide-border">
          <div v-for="row in 8" :key="row" class="flex items-center gap-3 px-4 py-3">
            <Skeleton class="h-4 w-4 shrink-0" />
            <Skeleton class="h-4 min-w-0 flex-1" />
            <Skeleton class="h-4 w-16 shrink-0" />
            <Skeleton class="h-4 w-20 shrink-0" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
