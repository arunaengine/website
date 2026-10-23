<script setup lang="ts">
// Adds a node to a bucket: the node creates its bucket, joins, copies and becomes ready.
import { computed, ref } from 'vue'
import Button from '@/components/ui/Button.vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import NodeLabel from '@/components/ui/NodeLabel.vue'
import Notice from '@/components/ui/Notice.vue'
import Select from '@/components/ui/Select.vue'
import { COVERAGES, MOCK_NODES, SHARD_HOST_LABEL, STRATEGIES, type Coverage, type DataStrategy } from '@/lib/distributedMock'
import type { MockBucket } from '@/lib/distributedMockData'

const props = defineProps<{ open: boolean; bucket: MockBucket }>()
const emit = defineEmits<{ (e: 'update:open', value: boolean): void; (e: 'done', message: string): void }>()

const strategy = ref<DataStrategy>('copy')
const coverage = ref<Coverage>('all')
const nodeId = ref('')

const others = computed(() => MOCK_NODES.filter((node) => !props.bucket.members.some((member) => member.nodeId === node.id)))
const strategies = STRATEGIES.map(({ value, label }) => ({ value, label }))
const coverages = COVERAGES.map(({ value, label }) => ({ value, label }))

function join() {
  emit('done', `${nodeId.value} would create ${props.bucket.name}, catch up with ${strategy.value} and ${coverage.value} metadata, then become ready.`)
  emit('update:open', false)
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Add a node</DialogTitle>
        <DialogDescription>
          The node creates its own bucket named {{ bucket.name }}, then catches up. It serves reads when it is ready.
        </DialogDescription>
      </DialogHeader>
      <Notice v-if="!others.length">Every node of the realm is already a member.</Notice>
      <fieldset v-else class="space-y-1">
        <legend class="mb-1 text-xs font-medium text-foreground">Node</legend>
        <label
          v-for="node in others"
          :key="node.id"
          class="flex items-center gap-3 rounded-md border border-border px-3 py-2 text-xs"
          :class="node.shardHost ? '' : 'text-muted-foreground'"
        >
          <input v-model="nodeId" type="radio" name="join-node" :value="node.id" :disabled="!node.shardHost" />
          <NodeLabel :node-id="node.id" />
          <span>{{ node.location }}</span>
          <span v-if="!node.shardHost" class="ml-auto">
            <span class="font-mono">{{ SHARD_HOST_LABEL }}</span> is not set
          </span>
        </label>
      </fieldset>
      <div class="grid gap-3 sm:grid-cols-2">
        <Select v-model="strategy" :options="strategies" aria-label="Data strategy" label="Data" />
        <Select v-model="coverage" :options="coverages" aria-label="Metadata coverage" label="Metadata" />
      </div>
      <DialogFooter>
        <Button variant="outline" @click="emit('update:open', false)">Cancel</Button>
        <Button :disabled="!nodeId" @click="join">Add node</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
