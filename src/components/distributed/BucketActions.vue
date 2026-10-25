<script setup lang="ts">
// Actions for group admins. Everyone else sees why they are missing.
import { computed, ref } from 'vue'
import Button from '@/components/ui/Button.vue'
import Notice from '@/components/ui/Notice.vue'
import JoinDialog from '@/components/distributed/JoinDialog.vue'
import LeaveDialog from '@/components/distributed/LeaveDialog.vue'
import SettingsDialog from '@/components/distributed/SettingsDialog.vue'
import TransferDialog from '@/components/distributed/TransferDialog.vue'
import { isDeleting, type DistributedBucket } from '@/lib/distribution'
import { ArrowRightLeft, Plus, SlidersHorizontal, UserMinus } from '@lucide/vue'

const props = defineProps<{ bucket: DistributedBucket; admin: boolean }>()
const emit = defineEmits<{ (e: 'changed'): void }>()

const dialog = ref<'join' | 'leave' | 'transfer' | 'settings' | null>(null)
const result = ref('')

// Changes wait while the bucket is deleted or has not been admitted everywhere.
const blocked = computed(() => {
  if (isDeleting(props.bucket)) return 'The bucket is being deleted.'
  if (props.bucket.live?.pending) return 'The bucket is pending. Retry the admission first.'
  return ''
})

function done(message: string) {
  result.value = `Mock, nothing changed: ${message}`
}

function changed() {
  result.value = ''
  emit('changed')
}
</script>

<template>
  <div class="space-y-3">
    <div v-if="admin" class="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" :disabled="Boolean(blocked)" @click="dialog = 'join'"><Plus class="size-3.5" /> Add node</Button>
      <Button variant="outline" size="sm" :disabled="Boolean(blocked)" @click="dialog = 'leave'"><UserMinus class="size-3.5" /> Remove node</Button>
      <Button variant="outline" size="sm" :disabled="Boolean(blocked)" @click="dialog = 'transfer'"><ArrowRightLeft class="size-3.5" /> Move a range</Button>
      <Button v-if="bucket.live" variant="outline" size="sm" :disabled="isDeleting(bucket)" @click="dialog = 'settings'"><SlidersHorizontal class="size-3.5" /> Settings</Button>
    </div>
    <p v-if="admin && blocked" class="text-xs text-muted-foreground">{{ blocked }}</p>
    <p v-else-if="!admin" class="text-xs text-muted-foreground">Only group admins can change the nodes of a bucket.</p>
    <Notice v-if="result" tone="success">{{ result }}</Notice>
    <JoinDialog :open="dialog === 'join'" :bucket="bucket" @update:open="dialog = $event ? 'join' : null" @done="done" @changed="changed" />
    <LeaveDialog :open="dialog === 'leave'" :bucket="bucket" @update:open="dialog = $event ? 'leave' : null" @done="done" @changed="changed" />
    <TransferDialog :open="dialog === 'transfer'" :bucket="bucket" @update:open="dialog = $event ? 'transfer' : null" @done="done" @changed="changed" />
    <SettingsDialog v-if="bucket.live" :open="dialog === 'settings'" :bucket="bucket" @update:open="dialog = $event ? 'settings' : null" @changed="changed" />
  </div>
</template>
