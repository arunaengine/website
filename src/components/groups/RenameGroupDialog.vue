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
import Notice from '@/components/ui/Notice.vue'
import Spinner from '@/components/ui/Spinner.vue'
import { computed, ref, watch } from 'vue'
import { Pencil } from '@lucide/vue'
import { useAruna } from '@/composables/useAruna'
import { ApiError, GROUP_NAME_MAX_LENGTH } from '@/lib/api'
import { errorMessage } from '@/lib/utils'

const props = defineProps<{ open: boolean; groupId: string; name: string }>()
const emit = defineEmits<{
  (e: 'update:open', v: boolean): void
  (e: 'renamed', name: string): void
}>()

const { updateGroup } = useAruna()

const draft = ref(props.name)
const busy = ref(false)
const submitError = ref<string | null>(null)

const trimmed = computed(() => draft.value.trim())
const problem = computed(() => {
  if (!trimmed.value) return 'A group needs a name of at least one character.'
  if (trimmed.value.length > GROUP_NAME_MAX_LENGTH)
    return `A group name may be at most ${GROUP_NAME_MAX_LENGTH} characters.`
  return null
})
const unchanged = computed(() => trimmed.value === props.name.trim())
const blocker = computed(() => problem.value ?? (unchanged.value ? 'This is already the group name.' : null))

watch(
  () => props.open,
  (open) => {
    if (!open) return
    draft.value = props.name
    submitError.value = null
  },
)

async function save() {
  if (blocker.value || busy.value) return
  busy.value = true
  submitError.value = null
  try {
    const updated = await updateGroup(props.groupId, { display_name: trimmed.value })
    emit('renamed', updated.display_name)
    emit('update:open', false)
  } catch (err) {
    // A node without the rename route answers 404/405; say so instead of
    // repeating a bare status line.
    submitError.value =
      err instanceof ApiError && (err.status === 404 || err.status === 405)
        ? 'This node does not support renaming a group yet.'
        : errorMessage(err)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <Dialog :open="props.open" @update:open="(v: boolean) => emit('update:open', v)">
    <DialogContent class="max-w-md">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <Pencil class="h-4 w-4 text-primary" /> Rename group
        </DialogTitle>
        <DialogDescription>
          Only the name changes. The group id and every permission, bucket and dataset stay as they are.
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-2">
        <label class="text-xs font-medium text-foreground" for="rename-group-name">Group name</label>
        <Input
          id="rename-group-name"
          v-model="draft"
          :invalid="problem ? 'error' : undefined"
          placeholder="e.g. Climate Modelling Lab"
          @keyup.enter="save"
        />
        <p v-if="problem" class="text-xs text-destructive">{{ problem }}</p>
        <p v-else class="text-xs text-muted-foreground">1 to {{ GROUP_NAME_MAX_LENGTH }} characters.</p>
        <p class="font-mono text-[10px] text-muted-foreground">{{ props.groupId }}</p>
        <Notice v-if="submitError" tone="error">{{ submitError }}</Notice>
      </div>

      <DialogFooter>
        <p v-if="blocker && !problem" class="mr-auto self-center text-xs text-muted-foreground">{{ blocker }}</p>
        <DialogClose as-child><Button variant="outline">Cancel</Button></DialogClose>
        <Button :disabled="Boolean(blocker) || busy" @click="save">
          <Spinner v-if="busy" label="Saving…" /> Save
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
