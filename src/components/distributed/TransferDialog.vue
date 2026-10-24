<script setup lang="ts">
// Moves the write role of one range to another member. The old coordinator must be reachable.
import { computed, ref, watch } from 'vue'
import Button from '@/components/ui/Button.vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import Notice from '@/components/ui/Notice.vue'
import OptionToggle from '@/components/ui/OptionToggle.vue'
import Select from '@/components/ui/Select.vue'
import { stamp } from '@/lib/distributedMock'
import type { DistributedBucket } from '@/lib/distribution'

const props = defineProps<{ open: boolean; bucket: DistributedBucket }>()
const emit = defineEmits<{ (e: 'update:open', value: boolean): void; (e: 'done', message: string): void }>()

const rangeId = ref(props.bucket.ranges[0].id)
const target = ref('')
const role = ref('replica')

watch(rangeId, () => (target.value = ''))

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
const rangeOptions = computed(() => props.bucket.ranges.map((item) => ({ value: item.id, label: `${item.id} on ${item.coordinator}` })))
const targets = computed(() =>
  props.bucket.members
    .filter((member) => member.nodeId !== range.value.coordinator && member.state === 'ready')
    .map((member) => ({ value: member.nodeId, label: member.nodeId })),
)

function move() {
  emit('done', `${target.value} would become the coordinator of ${range.value.id}. ${range.value.coordinator} would ${role.value === 'leave' ? 'leave the range' : 'keep a copy'}.`)
  emit('update:open', false)
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Move a range to another node</DialogTitle>
        <DialogDescription>Only the coordinator of a range writes to it. A transfer is the only way to change that.</DialogDescription>
      </DialogHeader>
      <div class="grid gap-3 sm:grid-cols-2">
        <Select v-model="rangeId" :options="rangeOptions" aria-label="Range" label="Range" />
        <Select v-model="target" :options="targets" aria-label="New coordinator" placeholder="New coordinator" />
      </div>
      <OptionToggle v-model="role" :options="ROLES" aria-label="Role of the old coordinator" />
      <Notice v-if="range.degradedSince" tone="warning" title="This transfer is blocked">
        {{ range.coordinator }} has been unreachable since {{ stamp(range.degradedSince) }}. It must stop writes before another node can take over.
        Replacing a lost coordinator is not part of this version.
      </Notice>
      <ol v-else class="list-decimal space-y-0.5 pl-5 text-xs text-muted-foreground">
        <li v-for="step in STEPS" :key="step">{{ step }}</li>
      </ol>
      <DialogFooter>
        <Button variant="outline" @click="emit('update:open', false)">Cancel</Button>
        <Button :disabled="!target || Boolean(range.degradedSince)" @click="move">Start the move</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
