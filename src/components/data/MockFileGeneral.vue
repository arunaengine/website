<script setup lang="ts">
// The id of a file in a bucket stored on several nodes, and the datasets that use it.
import GlobalId from '@/components/distributed/GlobalId.vue'
import type { MockObject } from '@/lib/distributedMockData'

defineProps<{ object: MockObject }>()
</script>

<template>
  <div class="space-y-3 text-xs">
    <div>
      <p class="mb-1 text-muted-foreground">Id of this version</p>
      <GlobalId :version-id="object.versionId" :content-hash="object.contentHash" />
      <p class="mt-1 text-muted-foreground">The id names no node. Any node of the realm can resolve it.</p>
    </div>
    <div>
      <p class="mb-1 text-muted-foreground">Datasets that use this file</p>
      <ul class="list-disc space-y-0.5 pl-5 text-foreground">
        <li v-for="title in object.datasets" :key="title">{{ title }}</li>
      </ul>
    </div>
  </div>
</template>
