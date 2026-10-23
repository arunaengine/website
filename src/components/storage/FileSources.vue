<script setup lang="ts">
// How files got into the bucket. Only incoming paths are listed, in plain sentences.
import StorageFeatureLink from '@/components/distributed/StorageFeatureLink.vue'
import { sourceLines } from '@/lib/distributedMockData'
import { Waypoints } from '@lucide/vue'

defineProps<{ bucket: string }>()
</script>

<template>
  <section class="surface">
    <header class="flex items-center gap-2 border-b border-border px-5 py-4">
      <Waypoints class="size-4 text-primary" />
      <div>
        <h2 class="font-display text-sm font-semibold text-aruna-navy">File sources</h2>
        <p class="text-xs text-muted-foreground">How files got into this bucket</p>
      </div>
    </header>
    <div class="px-5 py-4 text-sm">
      <p v-if="!sourceLines(bucket).length" class="text-muted-foreground">All files were uploaded to this bucket directly.</p>
      <ul v-else class="space-y-1.5">
        <li v-for="line in sourceLines(bucket)" :key="line.text" class="flex items-start gap-2">
          <span>{{ line.text }}</span>
          <StorageFeatureLink icon :question="line.question" class="mt-0.5" />
        </li>
      </ul>
    </div>
  </section>
</template>
