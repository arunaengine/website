<script setup lang="ts">
// One create result per member node. A set stays pending until every member is admitted.
import { RouterLink } from 'vue-router'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import NodeLabel from '@/components/ui/NodeLabel.vue'
import Notice from '@/components/ui/Notice.vue'
import { isPending, MIN_MEMBERS, type MemberResult } from '@/lib/distributedMock'
import { MOCK_BASE } from '@/router/distributedMock'
import { RefreshCw, UserMinus } from '@lucide/vue'

defineProps<{ name: string; results: MemberResult[] }>()
const emit = defineEmits<{ (e: 'retry', nodeId: string): void; (e: 'drop', nodeId: string): void }>()
</script>

<template>
  <section class="surface space-y-4 p-5">
    <div class="flex flex-wrap items-center gap-2">
      <h2 class="font-display text-base font-semibold text-aruna-navy">Create results for <span class="font-mono">{{ name }}</span></h2>
      <Badge v-if="isPending(results)" variant="warn" size="sm">Pending</Badge>
      <Badge v-else variant="success" size="sm">Active</Badge>
    </div>

    <Notice v-if="isPending(results)" tone="warning" title="The bucket is pending">
      It starts serving when every coordinator and replica is admitted. Members that were created are kept.
      Retry the failed member or drop it from the bucket.
    </Notice>
    <Notice v-else tone="success" title="Every member is admitted">The bucket is active on {{ results.length }} nodes.</Notice>

    <div class="overflow-x-auto rounded-md border border-border">
      <table class="w-full min-w-[40rem] text-left text-xs">
        <thead class="border-b border-border bg-muted/40 text-muted-foreground">
          <tr>
            <th class="px-3 py-2 font-medium">Node</th>
            <th class="px-3 py-2 font-medium">Result</th>
            <th class="px-3 py-2 font-medium">Detail</th>
            <th class="px-3 py-2"><span class="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border">
          <tr v-for="result in results" :key="result.nodeId">
            <td class="px-3 py-2 font-medium"><NodeLabel :node-id="result.nodeId" /></td>
            <td class="px-3 py-2">
              <Badge :variant="result.created ? 'success' : 'destructive'" size="sm">{{ result.created ? 'Created' : 'Failed' }}</Badge>
            </td>
            <td class="px-3 py-2 text-muted-foreground">
              <template v-if="result.created">Bucket created and admitted.</template>
              <template v-else>
                A bucket named {{ name }} already exists on {{ result.nodeId }}, and this bucket did not create it.
                <template v-if="result.tries > 1"> Tried {{ result.tries }} times.</template>
              </template>
            </td>
            <td class="px-3 py-2 text-right">
              <div v-if="!result.created" class="flex justify-end gap-2">
                <Button size="sm" variant="outline" @click="emit('retry', result.nodeId)"><RefreshCw class="size-3.5" /> Retry</Button>
                <Button size="sm" variant="outline" :disabled="results.length <= MIN_MEMBERS" :title="results.length <= MIN_MEMBERS ? 'A bucket needs at least two members.' : undefined" @click="emit('drop', result.nodeId)">
                  <UserMinus class="size-3.5" /> Drop member
                </Button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-if="isPending(results)" class="text-xs text-muted-foreground">
      Mock: the retry fails once more with the same reason, then works as if the other bucket was removed.
    </p>
    <Button v-else variant="outline" size="sm" as-child>
      <RouterLink :to="`${MOCK_BASE}/spire-db`">Open an example bucket page</RouterLink>
    </Button>
  </section>
</template>
