<script setup lang="ts">
// Which node served the file, where its bytes are, and how a registered file is checked.
import Badge from '@/components/ui/Badge.vue'
import NodeLabel from '@/components/ui/NodeLabel.vue'
import SourceInfo from '@/components/distributed/SourceInfo.vue'
import type { MockObject } from '@/lib/distributedMockData'
import { computed, ref } from 'vue'
import Notice from '@/components/ui/Notice.vue'

const props = defineProps<{ object: MockObject }>()

const copied = ref(false)
// Only a node with a full copy holds bytes. The others know the file but keep none.
const withBytes = computed(() => props.object.holders.filter((holder) => holder.bytes === 'Full copy'))
const listedOnly = computed(() => props.object.holders.filter((holder) => holder.bytes !== 'Full copy'))
</script>

<template>
  <div class="grid gap-4 lg:grid-cols-2">
    <div class="surface space-y-3 p-4">
      <h3 class="text-sm font-medium text-foreground">Served by</h3>
      <p class="flex items-center gap-2 text-sm">
        <NodeLabel :node-id="object.servedBy" /> <Badge variant="outline" size="sm">The node you are connected to</Badge>
      </p>
      <p class="text-xs text-muted-foreground">{{ object.how }}</p>
    </div>
    <div class="surface space-y-3 p-4">
      <h3 class="text-sm font-medium text-foreground">Storage locations</h3>
      <ul v-if="withBytes.length" class="divide-y divide-border rounded-md border border-border text-xs">
        <li v-for="holder in withBytes" :key="holder.nodeId" class="flex flex-wrap items-center gap-x-4 px-3 py-2">
          <NodeLabel :node-id="holder.nodeId" class="w-20 font-medium" />
          <span class="w-32">{{ holder.role }}</span>
          <span class="text-muted-foreground">{{ holder.bytes }}</span>
        </li>
      </ul>
      <p v-else class="text-xs text-muted-foreground">No node holds the bytes yet. They are read from the source.</p>
      <p v-if="listedOnly.length" class="text-xs text-muted-foreground">
        Also listed on: {{ listedOnly.map((holder) => `${holder.nodeId} (${holder.role.toLowerCase()}, ${holder.bytes.toLowerCase()})`).join(', ') }}.
      </p>
    </div>
    <div v-if="object.external" class="surface space-y-3 p-4 lg:col-span-2">
      <h3 class="text-sm font-medium text-foreground">Registered from an external source</h3>
      <SourceInfo :info="object.external" @copy="copied = true" />
      <Notice v-if="copied" tone="success">Mock, nothing changed: the file would be copied into the bucket and get a content hash.</Notice>
    </div>
  </div>
</template>
