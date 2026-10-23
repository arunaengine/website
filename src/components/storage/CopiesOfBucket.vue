<script setup lang="ts">
// Other buckets that get a copy of this one: a second bucket follows this one.
import MockNotice from '@/components/distributed/MockNotice.vue'
import StorageFeatureLink from '@/components/distributed/StorageFeatureLink.vue'
import { bucketCopies } from '@/lib/distributedMockData'
import { ArrowLeftRight } from '@lucide/vue'

defineProps<{ bucket: string }>()
</script>

<template>
  <section class="surface">
    <header class="flex items-center gap-2 border-b border-border px-5 py-4">
      <ArrowLeftRight class="size-4 text-primary" />
      <h2 class="font-display text-sm font-semibold text-aruna-navy">Copies of this bucket</h2>
      <StorageFeatureLink icon question="sync" />
    </header>
    <div class="space-y-3 px-5 py-4 text-sm">
      <MockNotice />
      <p v-if="!bucketCopies(bucket).length" class="text-muted-foreground">No other bucket gets a copy of this one.</p>
      <ul v-else class="space-y-1.5">
        <li v-for="copy in bucketCopies(bucket)" :key="copy">{{ copy }}</li>
      </ul>
    </div>
  </section>
</template>
