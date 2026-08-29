<script setup lang="ts">
// Placeholder for the whole group detail: header, tab strip, usage, datasets
// and members in their final places, so the loaded detail replaces it in one
// step instead of appearing section by section.
import Skeleton from '@/components/ui/Skeleton.vue'
</script>

<template>
  <div aria-busy="true">
    <span class="sr-only">Loading the group</span>

    <header class="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
      <div class="min-w-0 space-y-2">
        <div class="flex items-center gap-2">
          <Skeleton class="h-4 w-40" />
          <Skeleton class="h-5 w-16 rounded-full" />
        </div>
        <Skeleton class="h-3 w-56" />
      </div>
      <Skeleton class="h-8 w-28" />
    </header>

    <div class="flex flex-wrap gap-2 border-b border-border px-5 py-2">
      <Skeleton v-for="tab in 5" :key="tab" class="h-8 w-24" />
    </div>

    <div class="border-b border-border px-5 py-4">
      <Skeleton class="h-4 w-28" />
      <div class="mt-3 grid grid-cols-3 gap-3">
        <Skeleton v-for="card in 3" :key="card" class="h-14" />
      </div>
    </div>

    <div class="border-b border-border px-5 py-4">
      <Skeleton class="h-4 w-24" />
      <Skeleton class="mt-3 h-3 w-full" />
      <Skeleton class="mt-2 h-3 w-64" />
    </div>

    <div class="border-b border-border px-5 py-4">
      <Skeleton class="h-4 w-24" />
      <div class="mt-3 space-y-2">
        <Skeleton v-for="row in 4" :key="row" class="h-8 w-full" />
      </div>
    </div>

    <div class="px-5 py-4">
      <Skeleton class="h-4 w-24" />
      <div class="mt-3 space-y-2">
        <Skeleton v-for="row in 3" :key="row" class="h-10 w-full" />
      </div>
    </div>
  </div>
</template>
