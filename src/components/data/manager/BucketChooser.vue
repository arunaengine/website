<script setup lang="ts">
// Beside the bucket list while no bucket is open: one short message at its content height.
import IconTile from '@/components/ui/IconTile.vue'
import SectionHeading from '@/components/ui/SectionHeading.vue'
import { Boxes, FolderOpen } from '@lucide/vue'
</script>

<template>
  <div class="min-w-0 self-start">
    <SectionHeading title="Files" :icon="FolderOpen" />
    <div class="surface px-5 py-8 text-center">
      <div class="mb-3 flex justify-center"><IconTile :icon="Boxes" tone="muted" /></div>
      <p class="text-sm font-medium text-foreground">No bucket open</p>
      <p class="mt-1 text-sm text-muted-foreground">Choose a bucket to see its files.</p>
    </div>
  </div>
</template>
