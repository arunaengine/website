<script setup lang="ts">
// A job that waits for a locked bucket: not failed and not retried, it goes on
// once a key holder unlocks every bucket named here on its own node.
import { RouterLink } from 'vue-router'
import NodeLabel from '@/components/ui/NodeLabel.vue'
import Notice from '@/components/ui/Notice.vue'
import { bucketUnlockLink } from '@/lib/bucketEncryption'
import type { JobKeyWait } from '@/lib/jobs'

defineProps<{ waits: JobKeyWait[] }>()
</script>

<template>
  <Notice tone="warning" title="Waiting for a bucket unlock" data-key-wait>
    This job needs data from a locked bucket. It goes on once a key holder unlocks it; until then it neither fails nor
    retries.
    <ul v-if="waits.length" class="mt-1 list-disc space-y-0.5 pl-4">
      <li v-for="wait in waits" :key="`${wait.node_id}/${wait.bucket}`">
        <RouterLink :to="bucketUnlockLink(wait.bucket, wait.node_id, wait.group_id)" class="font-medium underline">
          {{ wait.bucket }}
        </RouterLink>
        on <NodeLabel :node-id="wait.node_id" size="sm" />
      </li>
    </ul>
    <p v-else class="mt-1">The node did not say which bucket it waits for.</p>
  </Notice>
</template>
