<script setup lang="ts">
// A member leaves. A node that still writes a range must hand the range over first.
import { computed, ref } from 'vue'
import Button from '@/components/ui/Button.vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import NodeLabel from '@/components/ui/NodeLabel.vue'
import type { MockBucket } from '@/lib/distributedMockData'

const props = defineProps<{ open: boolean; bucket: MockBucket }>()
const emit = defineEmits<{ (e: 'update:open', value: boolean): void; (e: 'done', message: string): void }>()

const nodeId = ref('')

const writes = (id: string) => props.bucket.ranges.filter((range) => range.coordinator === id).length
const options = computed(() => props.bucket.members.map((member) => ({ ...member, writes: writes(member.nodeId) })))

function leave() {
  emit('done', `${nodeId.value} would stop receiving changes and refuse new ones. Its local bucket becomes an ordinary bucket.`)
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
          v-for="member in options"
          :key="member.nodeId"
          class="flex items-center gap-3 rounded-md border border-border px-3 py-2 text-xs"
          :class="member.writes ? 'text-muted-foreground' : ''"
        >
          <input v-model="nodeId" type="radio" name="leave-node" :value="member.nodeId" :disabled="member.writes > 0" />
          <NodeLabel :node-id="member.nodeId" />
          <span v-if="member.writes" class="ml-auto">
            Writes {{ member.writes }} {{ member.writes === 1 ? 'range' : 'ranges' }}. Transfer them first.
          </span>
        </label>
      </fieldset>
      <DialogFooter>
        <Button variant="outline" @click="emit('update:open', false)">Cancel</Button>
        <Button variant="destructive" :disabled="!nodeId" @click="leave">Remove node</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
