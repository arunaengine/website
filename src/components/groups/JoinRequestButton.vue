<script setup lang="ts">
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogClose from '@/components/ui/DialogClose.vue'
import Button from '@/components/ui/Button.vue'
import Badge from '@/components/ui/Badge.vue'
import Textarea from '@/components/ui/Textarea.vue'
import { computed, onMounted, ref, watch } from 'vue'
import { UserPlus, X } from '@lucide/vue'
import { useJoinRequests } from '@/composables/useJoinRequests'
import { useAruna } from '@/composables/useAruna'
import { reportGlobalError } from '@/composables/useGlobalErrors'
import { errorMessage } from '@/lib/utils'

const props = defineProps<{ groupId: string; groupName?: string }>()

const { joinRequestsEnabled, pendingByGroup, ensureOwnRequestsLoaded, requestJoin, withdrawRequest, busy } =
  useJoinRequests()
const { currentUser, myGroups } = useAruna()

// Flag off, signed out, or already a member ⇒ this component renders nothing.
const visible = computed(
  () =>
    joinRequestsEnabled.value &&
    !!currentUser.value &&
    !myGroups.value.some((g) => g.id === props.groupId),
)

const pending = computed(() => pendingByGroup.value.get(props.groupId) ?? null)

const open = ref(false)
const message = ref('')
const submitError = ref<string | null>(null)

onMounted(() => {
  if (joinRequestsEnabled.value && currentUser.value) void ensureOwnRequestsLoaded()
})

watch(open, (isOpen) => {
  if (isOpen) {
    message.value = ''
    submitError.value = null
  }
})

async function submit() {
  submitError.value = null
  try {
    await requestJoin(props.groupId, message.value)
    open.value = false
  } catch (err) {
    // A 404 here means the realm advertises the flag but the backend has no
    // endpoint; surface the raw message honestly.
    submitError.value = errorMessage(err)
  }
}

async function withdraw() {
  const req = pending.value
  if (!req) return
  try {
    await withdrawRequest(req)
  } catch (err) {
    reportGlobalError(errorMessage(err))
  }
}
</script>

<template>
  <template v-if="visible">
    <div v-if="pending" class="flex items-center gap-1.5">
      <Badge size="sm" variant="warn" class="uppercase">requested</Badge>
      <Button variant="ghost" size="sm" :disabled="busy" @click="withdraw">
        <X class="h-3.5 w-3.5" /> Withdraw
      </Button>
    </div>
    <template v-else>
      <Button variant="outline" size="sm" :disabled="busy" @click="open = true">
        <UserPlus class="h-3.5 w-3.5" /> Request to join
      </Button>
      <Dialog :open="open" @update:open="(v: boolean) => (open = v)">
        <DialogContent class="max-w-md">
          <DialogHeader>
            <DialogTitle class="flex items-center gap-2">
              <UserPlus class="h-4 w-4 text-primary" /> Request to join {{ groupName || 'this group' }}
            </DialogTitle>
            <DialogDescription>
              The group admins are notified and decide whether to admit you.
            </DialogDescription>
          </DialogHeader>

          <div class="space-y-2">
            <label class="text-xs font-medium text-foreground">Message to the group admins (optional)</label>
            <Textarea v-model="message" rows="3" placeholder="Why would you like to join?" />
            <p v-if="submitError" class="text-xs text-destructive">{{ submitError }}</p>
          </div>

          <DialogFooter>
            <DialogClose as-child><Button variant="outline">Cancel</Button></DialogClose>
            <Button :disabled="busy" @click="submit">
              {{ busy ? 'Sending…' : 'Send request' }}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </template>
  </template>
</template>
