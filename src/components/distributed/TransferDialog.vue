<script setup lang="ts">
// Moves the write role of one range to another member. The old coordinator must be reachable,
// and the new one must already hold a ready copy of the range.
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
import OptionToggle from '@/components/ui/OptionToggle.vue'
import Select from '@/components/ui/Select.vue'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { useSetChanges } from '@/composables/useSetChanges'
import { stamp } from '@/lib/distributedMock'
import { openTransfers, transferChoice, type DistributedBucket } from '@/lib/distribution'

const props = defineProps<{ open: boolean; bucket: DistributedBucket }>()
const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'done', message: string): void
  (e: 'changed'): void
}>()

const { displayName } = useRealmNodes()
const rangeId = ref(props.bucket.ranges[0]?.id ?? '')
const target = ref('')
const role = ref<'replica' | 'leave'>('replica')
const changes = useSetChanges(computed(() => props.bucket.live))

watch(rangeId, () => (target.value = ''))
watch(() => props.open, (open) => open && (target.value = ''))

const ROLES = [
  { value: 'replica', label: 'Keep a copy' },
  { value: 'leave', label: 'Leave the range' },
]
const STEPS = [
  'The new coordinator catches up with the range.',
  'The old coordinator stops writes to the range. New writes fail for a short time and can be retried.',
  'The new coordinator applies everything up to that point and checks the sources.',
  'The new coordinator takes over with a new epoch.',
]

const range = computed(() => props.bucket.ranges.find((item) => item.id === rangeId.value) ?? props.bucket.ranges[0])
const rangeOptions = computed(() =>
  props.bucket.ranges.map((item) => ({ value: item.id, label: `${item.lower || '(start)'} to ${item.upper || '(end)'} on ${displayName(item.coordinator)}` })),
)
const choice = computed(() => transferChoice(props.bucket, range.value))
const targets = computed(() =>
  choice.value.offered.map((member) => ({ value: member.memberId ?? member.nodeId, label: displayName(member.nodeId) })),
)
const moving = computed(() => openTransfers(props.bucket).some((transfer) => transfer.rangeId === range.value.id))

async function move() {
  const member = choice.value.offered.find((item) => (item.memberId ?? item.nodeId) === target.value)
  if (!member) return
  if (!props.bucket.live || !member.memberId) {
    emit('done', `${member.nodeId} would become the coordinator of ${range.value.id}. ${range.value.coordinator} would ${role.value === 'leave' ? 'leave the range' : 'keep a copy'}.`)
    emit('update:open', false)
    return
  }
  if (!(await changes.transfer({ range_id: range.value.id, to: member.memberId, role: role.value }))) return
  emit('changed')
  emit('update:open', false)
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Move a range to another node</DialogTitle>
        <DialogDescription>Only the coordinator of a range writes to it. A move is the only way to change that.</DialogDescription>
      </DialogHeader>
      <div v-if="range" class="grid gap-3 sm:grid-cols-2">
        <Select v-model="rangeId" :options="rangeOptions" aria-label="Range" label="Range" />
        <Select v-model="target" :options="targets" aria-label="New coordinator" placeholder="New coordinator" :disabled="!targets.length" />
      </div>
      <div v-if="range" class="space-y-1 text-xs text-muted-foreground">
        <p>Only a node with a ready copy of the range can take it over.</p>
        <ul v-if="choice.refused.length" class="space-y-0.5">
          <li v-for="item in choice.refused" :key="item.member.memberId ?? item.member.nodeId" class="flex gap-2">
            <NodeLabel :node-id="item.member.nodeId" class="font-medium text-foreground" />
            <span>{{ item.reason }}</span>
          </li>
        </ul>
      </div>
      <OptionToggle v-model="role" :options="ROLES" aria-label="Role of the old coordinator" />
      <Notice v-if="range?.degradedSince || range?.degraded" tone="warning" title="This move is blocked">
        {{ displayName(range.coordinator) }} is unreachable<template v-if="range.degradedSince"> since {{ stamp(range.degradedSince) }}</template>.
        It must stop writes before another node can take over. Replacing a lost coordinator is not part of this version.
      </Notice>
      <Notice v-else-if="moving" tone="info">A move of this range is already open.</Notice>
      <ol v-else class="list-decimal space-y-0.5 pl-5 text-xs text-muted-foreground">
        <li v-for="step in STEPS" :key="step">{{ step }}</li>
      </ol>
      <Notice v-if="changes.failure.value" tone="error">{{ changes.failure.value }}</Notice>
      <DialogFooter>
        <Button variant="outline" @click="emit('update:open', false)">Cancel</Button>
        <Button :disabled="!target || Boolean(range?.degraded || range?.degradedSince) || moving || changes.busy.value" @click="move">Start the move</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
