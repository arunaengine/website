<script setup lang="ts">
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogClose from '@/components/ui/DialogClose.vue'
import DiscardDraftConfirm from '@/components/ui/DiscardDraftConfirm.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import { computed, ref, watch } from 'vue'
import { Users } from '@lucide/vue'
import { useAruna } from '@/composables/useAruna'
import { ApiError, type GroupDetailResponse } from '@/lib/api'
import { errorMessage } from '@/lib/utils'
import Notice from '@/components/ui/Notice.vue'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{
  (e: 'update:open', v: boolean): void
  (e: 'created', group: GroupDetailResponse): void
}>()

const { createGroup, saving } = useAruna()

const name = ref('')
const submitError = ref<string | null>(null)
const capReached = ref(false)

// Dialog discard guard: outside clicks never close the dialog; an explicit close
// (X, Escape, Cancel) after a name has been typed asks before discarding.
const confirmDiscardOpen = ref(false)
const hasDraftProgress = computed(() => Boolean(name.value.trim()))
function requestClose(next: boolean) {
  if (next) {
    emit('update:open', true)
    return
  }
  if (hasDraftProgress.value) {
    confirmDiscardOpen.value = true
    return
  }
  emit('update:open', false)
}
function discardDraft() {
  confirmDiscardOpen.value = false
  emit('update:open', false)
}

watch(
  () => props.open,
  (open) => {
    if (!open) return
    confirmDiscardOpen.value = false
    name.value = ''
    submitError.value = null
    capReached.value = false
  },
)

async function submit() {
  if (!name.value.trim()) return
  submitError.value = null
  capReached.value = false
  try {
    const created = await createGroup(name.value.trim())
    emit('created', created)
    emit('update:open', false)
  } catch (err) {
    capReached.value = err instanceof ApiError && err.status === 409
    submitError.value = errorMessage(err)
  }
}
</script>

<template>
  <Dialog :open="props.open" @update:open="requestClose">
    <DialogContent class="max-w-md" @interact-outside="(event: Event) => event.preventDefault()">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <Users class="h-4 w-4 text-primary" /> Create group
        </DialogTitle>
        <DialogDescription>
          You become the group admin and can invite members and manage roles.
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-3">
        <div>
          <label class="text-xs font-medium text-foreground">Group name</label>
          <Input v-model="name" class="mt-1" placeholder="e.g. Climate Modelling Lab" @keyup.enter="submit" />
        </div>
        <Notice v-if="submitError" :tone="capReached ? 'warning' : 'error'">{{ submitError }}</Notice>
      </div>

      <DialogFooter>
        <DialogClose as-child><Button variant="outline">Cancel</Button></DialogClose>
        <Button :disabled="!name.trim() || saving" @click="submit">
          {{ saving ? 'Creating…' : 'Create group' }}
        </Button>
      </DialogFooter>

      <DiscardDraftConfirm :open="confirmDiscardOpen" @keep="confirmDiscardOpen = false" @discard="discardDraft" />
    </DialogContent>
  </Dialog>
</template>
