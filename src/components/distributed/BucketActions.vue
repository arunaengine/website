<script setup lang="ts">
// Actions for group admins. Everyone else sees why they are missing.
import { ref } from 'vue'
import Button from '@/components/ui/Button.vue'
import Notice from '@/components/ui/Notice.vue'
import JoinDialog from '@/components/distributed/JoinDialog.vue'
import LeaveDialog from '@/components/distributed/LeaveDialog.vue'
import SetDeleteDialog from '@/components/distributed/SetDeleteDialog.vue'
import TransferDialog from '@/components/distributed/TransferDialog.vue'
import type { MockBucket } from '@/lib/distributedMockData'
import { ArrowRightLeft, Plus, Trash2, UserMinus } from '@lucide/vue'

defineProps<{ bucket: MockBucket; admin: boolean }>()

const dialog = ref<'join' | 'leave' | 'transfer' | 'delete' | null>(null)
const result = ref('')

function done(message: string) {
  result.value = `Mock, nothing changed: ${message}`
}
</script>

<template>
  <div class="space-y-3">
    <div v-if="admin" class="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" @click="dialog = 'join'"><Plus class="size-3.5" /> Add node</Button>
      <Button variant="outline" size="sm" @click="dialog = 'leave'"><UserMinus class="size-3.5" /> Remove node</Button>
      <Button variant="outline" size="sm" @click="dialog = 'transfer'"><ArrowRightLeft class="size-3.5" /> Transfer a range</Button>
      <Button variant="outline" size="sm" class="text-destructive hover:text-destructive" @click="dialog = 'delete'"><Trash2 class="size-3.5" /> Delete bucket</Button>
    </div>
    <p v-else class="text-xs text-muted-foreground">Only admins of the group can add or remove nodes, move ranges or delete the bucket.</p>
    <Notice v-if="result" tone="success">{{ result }}</Notice>
    <JoinDialog :open="dialog === 'join'" :bucket="bucket" @update:open="dialog = $event ? 'join' : null" @done="done" />
    <LeaveDialog :open="dialog === 'leave'" :bucket="bucket" @update:open="dialog = $event ? 'leave' : null" @done="done" />
    <TransferDialog :open="dialog === 'transfer'" :bucket="bucket" @update:open="dialog = $event ? 'transfer' : null" @done="done" />
    <SetDeleteDialog :open="dialog === 'delete'" :bucket="bucket" @update:open="dialog = $event ? 'delete' : null" @done="done" />
  </div>
</template>
