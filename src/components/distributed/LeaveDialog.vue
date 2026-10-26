<script setup lang="ts">
// A member leaves. A node that still writes a range must hand the range over first.
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
import { useSetChanges } from '@/composables/useSetChanges'
import { leaveBlock, type DistributedBucket } from '@/lib/distribution'

const props = defineProps<{ open: boolean; bucket: DistributedBucket }>()
const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'done', message: string): void
  (e: 'changed'): void
}>()

// The choice is a member: a node that left and joined again has two.
const chosen = ref('')
const changes = useSetChanges(computed(() => props.bucket.live))

watch(() => props.open, (open) => open && (chosen.value = ''))

const options = computed(() =>
  props.bucket.members.map((member) => ({ member, key: member.memberId ?? member.nodeId, block: leaveBlock(props.bucket, member) })),
)

async function leave() {
  const option = options.value.find((item) => item.key === chosen.value)
  if (!option) return
  if (!props.bucket.live || !option.member.memberId) {
    emit('done', `${option.member.nodeId} would stop receiving changes and refuse new ones. Its local bucket becomes an ordinary bucket.`)
    emit('update:open', false)
    return
  }
  if (!(await changes.leave(option.member.memberId))) return
  emit('changed')
  emit('update:open', false)
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Remove a node</DialogTitle>
        <DialogDescription>
          The node stops receiving changes. Its bucket stays on the node as an ordinary bucket, and you can delete it there.
        </DialogDescription>
      </DialogHeader>
      <fieldset class="space-y-1">
        <legend class="mb-1 text-xs font-medium text-foreground">Node</legend>
        <label
          v-for="option in options"
          :key="option.key"
          class="flex items-center gap-3 rounded-md border border-border px-3 py-2 text-xs"
          :class="option.block ? 'text-muted-foreground' : ''"
        >
          <input v-model="chosen" type="radio" name="leave-node" :value="option.key" :disabled="Boolean(option.block)" />
          <NodeLabel :node-id="option.member.nodeId" />
          <span v-if="option.block" class="ml-auto">{{ option.block }}</span>
        </label>
      </fieldset>
      <Notice v-if="changes.failure.value" tone="error">{{ changes.failure.value }}</Notice>
      <DialogFooter>
        <Button variant="outline" @click="emit('update:open', false)">Cancel</Button>
        <Button variant="destructive" :disabled="!chosen || changes.busy.value" @click="leave">Remove node</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
