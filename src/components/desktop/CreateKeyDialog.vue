<script setup lang="ts">
// Makes one access key for one tool. The node keeps no name for a key, so the
// name stays in this app; the secret is handed up once and kept nowhere.
import { computed, onUnmounted, ref, watch } from 'vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import RefusalNote from '@/components/ui/RefusalNote.vue'
import Select from '@/components/ui/Select.vue'
import Spinner from '@/components/ui/Spinner.vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogClose from '@/components/ui/DialogClose.vue'
import { useAruna } from '@/composables/useAruna'
import { useDeviceKeys } from '@/composables/useDeviceKeys'
import { activeGroupId } from '@/composables/useGroupSelection'
import type { CreateS3CredentialsResponse } from '@/lib/api'
import { rememberKeyName } from '@/lib/keyNames'
import { errorMessage } from '@/lib/utils'

// A key lives a year; the list shows when, so nobody is surprised by it.
const YEAR_SECONDS = 365 * 24 * 3600

// `create` makes the key on another node; without it the key is this computer's.
const props = defineProps<{
  open: boolean
  create?: (groupId: string, expiresInSeconds: number) => Promise<CreateS3CredentialsResponse>
}>()
const emit = defineEmits<{
  (e: 'update:open', v: boolean): void
  (e: 'created', key: { accessKeyId: string; secret: string; name: string }): void
  // The saved name only, also after its opening ended; never the secret.
  (e: 'named', key: { accessKeyId: string; name: string }): void
}>()

const { myGroups } = useAruna()
const deviceKeys = useDeviceKeys()
const available = computed(() => Boolean(props.create) || deviceKeys.available.value)

const name = ref('')
const groupId = ref('')
const error = ref<string | null>(null)
const busy = ref(false)
// Each opening of the dialog is one generation; closing or unmounting ends it, so a
// late answer of an earlier opening never closes or changes the one shown now.
let generation = 0
onUnmounted(() => (generation += 1))

const groupOptions = computed(() => myGroups.value.map((group) => ({ value: group.id, label: group.name })))
// One group needs no question; with more, the key belongs to the one chosen.
const askGroup = computed(() => groupOptions.value.length > 1)
const canCreate = computed(() => Boolean(name.value.trim() && groupId.value) && available.value && !busy.value)

watch(
  () => props.open,
  (open) => {
    if (!open) {
      generation += 1
      busy.value = false
      return
    }
    name.value = ''
    groupId.value = activeGroupId.value
    error.value = null
  },
  { immediate: true },
)

async function create(): Promise<void> {
  if (!canCreate.value) return
  const mine = generation
  busy.value = true
  error.value = null
  const label = name.value.trim()
  try {
    const made = await (props.create ?? deviceKeys.create)(groupId.value, YEAR_SECONDS)
    // The key exists either way, so the list can name it; only its own opening sees the secret.
    rememberKeyName(made.access_key_id, label)
    emit('named', { accessKeyId: made.access_key_id, name: label })
    if (mine !== generation) return
    emit('created', { accessKeyId: made.access_key_id, secret: made.access_secret, name: label })
    emit('update:open', false)
  } catch (err) {
    if (mine === generation) error.value = errorMessage(err)
  } finally {
    if (mine === generation) busy.value = false
  }
}
</script>

<template>
  <Dialog :open="props.open" @update:open="(v: boolean) => emit('update:open', v)">
    <DialogContent class="max-w-md">
      <DialogHeader>
        <DialogTitle>Create a key</DialogTitle>
        <DialogDescription>
          Give it a name you will recognise later, for example the tool it is for.
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-3 py-1">
        <label class="block">
          <span class="text-xs font-medium text-foreground">Name</span>
          <Input v-model="name" class="mt-1" placeholder="Laptop tools" aria-label="Key name" @keydown.enter="create" />
        </label>
        <label v-if="askGroup" class="block">
          <span class="text-xs font-medium text-foreground">Group</span>
          <Select v-model="groupId" class="mt-1" :options="groupOptions" aria-label="Group the key belongs to" />
        </label>
        <p v-if="!available" class="text-[11px] text-destructive">
          Aruna is not running on this computer, so a key cannot be made now.
        </p>
        <p v-else class="text-[11px] text-muted-foreground">You will see the secret once, right after this step.</p>
        <RefusalNote v-if="error" :message="error" />
      </div>

      <DialogFooter>
        <DialogClose as-child><Button variant="ghost">Cancel</Button></DialogClose>
        <Button :disabled="!canCreate" @click="create">
          <Spinner v-if="busy" label="Creating the key…" /> Create key
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
