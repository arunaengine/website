<script setup lang="ts">
// Other buckets that get a copy of this one: a second bucket follows this one.
import RowList from '@/components/distributed/RowList.vue'
import StorageFeatureLink from '@/components/distributed/StorageFeatureLink.vue'
import MockNotice from '@/components/distributed/MockNotice.vue'
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
      <MockNotice class="ml-auto" />
    </header>
    <div class="px-5 py-4">
      <p v-if="!bucketCopies(bucket).length" class="text-xs text-muted-foreground">None</p>
      <RowList v-else :rows="bucketCopies(bucket).map((copy) => ({ label: copy.to, value: copy.how }))" />
    </div>
  </section>
</template>
