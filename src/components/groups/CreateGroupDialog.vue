<script setup lang="ts">
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogClose from '@/components/ui/DialogClose.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import { ref, watch } from 'vue'
import { Users } from '@lucide/vue'
import { useAruna } from '@/composables/useAruna'
import { OFFLINE_WRITE_HINT, useConnectivity } from '@/lib/connectivity'
import { ApiError, type GroupDetailResponse } from '@/lib/api'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{
  (e: 'update:open', v: boolean): void
  (e: 'created', group: GroupDetailResponse): void
}>()

const { createGroup, saving } = useAruna()
const { writesDisabled } = useConnectivity()

const name = ref('')
const submitError = ref<string | null>(null)
const capReached = ref(false)

watch(
  () => props.open,
  (open) => {
    if (!open) return
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
    submitError.value = err instanceof Error ? err.message : String(err)
  }
}
</script>

<template>
  <Dialog :open="props.open" @update:open="(v: boolean) => emit('update:open', v)">
    <DialogContent class="max-w-md">
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
        <div v-if="submitError" class="rounded-md border px-3 py-2 text-xs" :class="capReached ? 'border-amber-500/30 bg-amber-500/5 text-amber-800 dark:text-amber-300' : 'border-destructive/30 bg-destructive/5 text-destructive'">
          {{ submitError }}
        </div>
        <div v-if="writesDisabled" class="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
          You're offline — creating a group needs connectivity.
        </div>
      </div>

      <DialogFooter>
        <DialogClose><Button variant="outline">Cancel</Button></DialogClose>
        <Button :disabled="!name.trim() || saving || writesDisabled" :title="writesDisabled ? OFFLINE_WRITE_HINT : undefined" @click="submit">
          {{ saving ? 'Creating…' : 'Create group' }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
