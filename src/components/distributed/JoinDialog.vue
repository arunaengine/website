<script setup lang="ts">
// Adds a node to a bucket: the node creates its bucket, joins, copies and becomes ready.
import { computed, ref, watch } from 'vue'
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
import { useRealmNodes } from '@/composables/useRealmNodes'
import { useSetChanges } from '@/composables/useSetChanges'
import { COVERAGES, MOCK_NODES, SHARD_HOST_LABEL, STRATEGIES, type Coverage, type DataStrategy } from '@/lib/distributedMock'
import type { DistributedBucket } from '@/lib/distribution'

const props = defineProps<{ open: boolean; bucket: DistributedBucket }>()
const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'done', message: string): void
  (e: 'changed'): void
}>()

const STRATEGY_NAMES = { copy: 'copy', 'copy on use': 'copy_on_use', 'cache on use': 'cache_on_use', stream: 'stream' } as const

const strategy = ref<DataStrategy>('copy')
const coverage = ref<Coverage>('all')
const nodeId = ref('')
const ranges = ref<string[]>([])
const changes = useSetChanges(computed(() => props.bucket.live))
const { nodes } = useRealmNodes()

watch(() => props.open, (open) => {
  if (open) {
    nodeId.value = ''
    ranges.value = []
  }
})
// Members that keep only their own ranges need to be told which ones.
watch(coverage, (value) => (ranges.value = value === 'assigned' ? ranges.value : []))

const taken = computed(() => new Set(props.bucket.members.filter((member) => member.state !== 'leaving').map((member) => member.nodeId)))
// A node that is already a member is not offered; a node that is leaving can join again.
const others = computed(() =>
  props.bucket.live
    ? nodes.value
        .filter((node) => node.kind !== 'user' && !taken.value.has(node.nodeId))
        .map((node) => ({ id: node.nodeId, location: node.location ?? 'Location not set', eligible: node.reachable, note: node.reachable ? '' : 'Not reachable' }))
    : MOCK_NODES.filter((node) => !taken.value.has(node.id)).map((node) => ({
        id: node.id,
        location: node.location,
        eligible: node.shardHost,
        note: node.shardHost ? '' : `${SHARD_HOST_LABEL} is not set`,
      })),
)
const strategies = STRATEGIES.map(({ value, label }) => ({ value, label }))
const coverages = COVERAGES.map(({ value, label }) => ({ value, label }))
const ready = computed(() => Boolean(nodeId.value) && (coverage.value === 'all' || !props.bucket.live || ranges.value.length > 0))

async function join() {
  if (!props.bucket.live) {
    emit('done', `${nodeId.value} would create ${props.bucket.name}, catch up with ${strategy.value} and ${coverage.value} metadata, then become ready.`)
    emit('update:open', false)
    return
  }
  const done = await changes.join({
    node_id: nodeId.value,
    coverage: coverage.value,
    strategy: STRATEGY_NAMES[strategy.value],
    ...(coverage.value === 'assigned' ? { ranges: ranges.value } : {}),
  })
  if (!done) return
  emit('changed')
  if (!changes.failure.value) emit('update:open', false)
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
          :class="node.eligible ? '' : 'text-muted-foreground'"
        >
          <input v-model="nodeId" type="radio" name="join-node" :value="node.id" :disabled="!node.eligible" />
          <NodeLabel :node-id="node.id" />
          <span>{{ node.location }}</span>
          <span v-if="node.note" class="ml-auto">{{ node.note }}</span>
        </label>
      </fieldset>
      <div class="grid gap-3 sm:grid-cols-2">
        <Select v-model="strategy" :options="strategies" aria-label="Data strategy" label="Data" />
        <Select v-model="coverage" :options="coverages" aria-label="Metadata coverage" label="Metadata" />
      </div>
      <fieldset v-if="coverage === 'assigned' && bucket.live" class="space-y-1">
        <legend class="mb-1 text-xs font-medium text-foreground">Ranges it keeps a copy of</legend>
        <div class="max-h-40 space-y-1 overflow-y-auto rounded-md border border-border p-2">
          <label v-for="range in bucket.ranges" :key="range.id" class="flex items-center gap-2 text-xs">
            <input v-model="ranges" type="checkbox" :value="range.id" />
            <span class="font-mono">{{ range.lower || '(start)' }} to {{ range.upper || '(end)' }}</span>
          </label>
        </div>
      </fieldset>
      <Notice v-if="changes.failure.value" tone="error">{{ changes.failure.value }}</Notice>
      <DialogFooter>
        <Button variant="outline" @click="emit('update:open', false)">Cancel</Button>
        <Button :disabled="!ready || changes.busy.value" @click="join">Add node</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
