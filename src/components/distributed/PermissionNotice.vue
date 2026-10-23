<script setup lang="ts">
// A grant that names single nodes can break reads that fetch from another member.
import CopyButton from '@/components/ui/CopyButton.vue'
import Notice from '@/components/ui/Notice.vue'
import { nodeGlob } from '@/lib/distributedMock'

defineProps<{ holder: string; bucket: string; missing: string[] }>()
</script>

<template>
  <Notice tone="warning" :title="`${holder} does not have access on every node`">
    <p>
      This grant does not reach {{ missing.join(', ') }}. A read on node A that fetches from node B fails when you have no
      permission on B.
    </p>
    <p class="mt-1">
      Use a node glob instead, for example
      <code class="break-all rounded bg-muted px-1 py-0.5 font-mono text-[11px] text-foreground">{{ nodeGlob(bucket) }}</code>
      <CopyButton :value="nodeGlob(bucket)" label="Copy the node glob" class="ml-1 align-middle" />
    </p>
  </Notice>
</template>
