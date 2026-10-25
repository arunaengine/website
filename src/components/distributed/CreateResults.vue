<script setup lang="ts">
// One create result per member node. A bucket stays pending until every coordinator and replica is admitted.
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import NodeLabel from '@/components/ui/NodeLabel.vue'
import Notice from '@/components/ui/Notice.vue'
import type { AdmissionResponse } from '@/lib/api'
import { RefreshCw } from '@lucide/vue'
import { computed } from 'vue'

const props = defineProps<{ name: string; outcome: AdmissionResponse; busy: boolean; failure: string | null }>()
// Active needs the coordinators and replicas only; other members may still be waiting.
const allAdmitted = computed(() => props.outcome.members.every((member) => member.admitted))
const emit = defineEmits<{ (e: 'retry'): void; (e: 'done'): void }>()
</script>

<template>
  <section class="space-y-4">
    <div class="flex flex-wrap items-center gap-2">
      <h2 class="font-display text-base font-semibold text-aruna-navy">Created on the nodes: <span class="font-mono">{{ name }}</span></h2>
      <Badge v-if="!outcome.active" variant="warn" size="sm">Pending</Badge>
      <Badge v-else variant="success" size="sm">Active</Badge>
    </div>

    <Notice v-if="!outcome.active" tone="warning" title="The bucket is pending">
      It starts serving when every coordinator and replica is admitted. Members that were created are kept.
      Retry the admission of the members that failed.
    </Notice>
    <Notice v-else-if="allAdmitted" tone="success" title="Every member is admitted">The bucket is active on {{ outcome.members.length }} nodes.</Notice>
    <Notice v-else tone="warning" title="Some members are not admitted">
      The bucket is active. Retry the admission of the members that failed.
    </Notice>
    <Notice v-if="outcome.error" tone="warning">{{ outcome.error }}</Notice>
    <Notice v-if="failure" tone="error">{{ failure }}</Notice>

    <div v-if="outcome.members.length" class="overflow-x-auto rounded-md border border-border">
      <table class="w-full min-w-[32rem] text-left text-xs">
        <thead class="border-b border-border bg-muted/40 text-muted-foreground">
          <tr>
            <th class="px-3 py-2 font-medium">Node</th>
            <th class="px-3 py-2 font-medium">Result</th>
            <th class="px-3 py-2 font-medium">Detail</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border">
          <tr v-for="member in outcome.members" :key="member.member_id">
            <td class="px-3 py-2 font-medium"><NodeLabel :node-id="member.node_id" /></td>
            <td class="px-3 py-2">
              <Badge :variant="member.admitted ? 'success' : 'destructive'" size="sm">{{ member.admitted ? 'Admitted' : 'Failed' }}</Badge>
            </td>
            <td class="px-3 py-2 text-muted-foreground">
              <template v-if="member.admitted">Bucket created and admitted.</template>
              <template v-else>{{ member.error ?? 'Not admitted yet.' }}</template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="flex justify-end gap-2">
      <Button v-if="!outcome.active || !allAdmitted" size="sm" variant="outline" :disabled="busy" @click="emit('retry')">
        <RefreshCw class="size-3.5" :class="busy ? 'animate-spin' : ''" /> Retry admission
      </Button>
      <Button size="sm" :disabled="busy" @click="emit('done')">Done</Button>
    </div>
  </section>
</template>
