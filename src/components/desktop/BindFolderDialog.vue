<script setup lang="ts">
// Binds a folder on this machine to a bucket in the realm. The folder itself
// is picked with the shell's native dialog; everything else names the realm
// side, the way the bucket sync dialog does.
import { computed, ref, watch } from 'vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Select from '@/components/ui/Select.vue'
import Switch from '@/components/ui/Switch.vue'
import RefusalNote from '@/components/ui/RefusalNote.vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogClose from '@/components/ui/DialogClose.vue'
import GroupSelect from '@/components/groups/GroupSelect.vue'
import BucketSearchBox from '@/components/data/BucketSearchBox.vue'
import { useAruna } from '@/composables/useAruna'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { useSyncedFolders } from '@/composables/useSyncedFolders'
import { isWorkspaceBucket } from '@/lib/workspaces'
import type { BucketSearchHit } from '@/lib/api'
import type { FolderMode, SyncedFolder } from '@/lib/deviceApi'
import { FolderOpen, Loader2 } from '@lucide/vue'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{
  (e: 'update:open', v: boolean): void
  (e: 'bound', folder: SyncedFolder): void
}>()

const { myGroups } = useAruna()
const realmNodes = useRealmNodes()
const { bind, busy } = useSyncedFolders()

const root = ref('')
const groupId = ref('')
const nodeId = ref('')
const bucket = ref('')
const prefix = ref('')
const mode = ref<FolderMode>('two_way')
const propagateDeletes = ref(true)
const error = ref<string | null>(null)
const pickError = ref<string | null>(null)
const submitting = ref(false)
const selectedBucket = ref<BucketSearchHit | null>(null)

// Only realm nodes hold the other half of a folder; other devices never do.
const nodeChoices = computed(() =>
  realmNodes.nodes.value
    .filter((node) => node.kind !== 'user')
    .map((node) => ({
      value: node.nodeId,
      label: `${node.label}${node.reachable ? '' : ' (offline)'}`,
      reachable: node.reachable,
    })),
)
const nodeOptions = computed(() => nodeChoices.value.map(({ value, label }) => ({ value, label })))
const groupOptions = computed(() => myGroups.value.map((group) => ({ value: group.id, label: group.name })))

const MODE_OPTIONS = [
  { value: 'two_way', label: 'Two-way' },
  { value: 'upload_only', label: 'Upload only' },
]
const modeHint = computed(() =>
  mode.value === 'two_way'
    ? 'New realm versions are written into this folder. A file you changed is never overwritten: the incoming copy lands beside it and waits for you.'
    : 'Files travel from this folder to the realm only. Nothing in the realm is written to this disk.',
)

watch(
  () => props.open,
  (open) => {
    if (!open) return
    root.value = ''
    groupId.value = groupOptions.value[0]?.value ?? ''
    nodeId.value = (nodeChoices.value.find((node) => node.reachable) ?? nodeChoices.value[0])?.value ?? ''
    bucket.value = ''
    prefix.value = ''
    mode.value = 'two_way'
    propagateDeletes.value = true
    error.value = null
    pickError.value = null
    selectedBucket.value = null
  },
  { immediate: true },
)

async function chooseFolder(): Promise<void> {
  pickError.value = null
  try {
    const { pickDirectory } = await import('@/lib/desktopBridge')
    const picked = await pickDirectory({ title: 'Folder to sync', startPath: root.value || undefined })
    if (picked) root.value = picked
  } catch (err) {
    pickError.value = err instanceof Error ? err.message : String(err)
  }
}

function pickSuggestion(hit: BucketSearchHit): void {
  selectedBucket.value = hit
  bucket.value = hit.bucket
  if (hit.node_id) nodeId.value = hit.node_id
}

watch([bucket, nodeId], ([name, selectedNode]) => {
  const hit = selectedBucket.value
  if (hit && (hit.bucket !== name.trim() || hit.node_id !== selectedNode)) selectedBucket.value = null
})

const bucketInvalid = computed(() => {
  const name = bucket.value.trim()
  if (!name) return null
  if (name.includes('/')) return "The bucket name cannot contain '/'."
  if (isWorkspaceBucket(name)) return 'Workspace buckets (ws-…) cannot be synced to a folder.'
  return null
})

const canSubmit = computed(
  () =>
    Boolean(root.value.trim() && groupId.value && nodeId.value && bucket.value.trim()) &&
    !bucketInvalid.value &&
    !busy.value &&
    !submitting.value,
)

async function submit(): Promise<void> {
  if (!canSubmit.value) return
  error.value = null
  submitting.value = true
  const name = bucket.value.trim()
  try {
    const folder = await bind({
      root: root.value.trim(),
      group_id: groupId.value,
      remote: { node_id: nodeId.value, bucket: name, prefix: prefix.value.trim() },
      create_bucket: !selectedBucket.value,
      mode: mode.value,
      propagate_deletes: propagateDeletes.value,
    })
    emit('bound', folder)
    emit('update:open', false)
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <Dialog :open="props.open" @update:open="(v: boolean) => emit('update:open', v)">
    <DialogContent class="max-w-xl">
      <DialogHeader>
        <DialogTitle>Sync a folder</DialogTitle>
        <DialogDescription>
          Pick a folder on this computer and the bucket it belongs to. The folder keeps living where it is.
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-4 py-1">
        <div>
          <span class="text-xs font-medium text-foreground">Folder on this computer</span>
          <div class="mt-1 flex flex-wrap items-center gap-2">
            <code class="min-w-0 flex-1 truncate rounded-md bg-muted/40 px-3 py-2 font-mono text-xs">{{
              root || 'No folder picked yet'
            }}</code>
            <Button variant="outline" size="sm" @click="chooseFolder">
              <FolderOpen class="h-3.5 w-3.5" /> Choose
            </Button>
          </div>
          <p v-if="pickError" class="mt-1 text-[11px] text-destructive">{{ pickError }}</p>
        </div>

        <div class="grid gap-3 sm:grid-cols-2">
          <label class="block">
            <span class="text-xs font-medium text-foreground">Group</span>
            <GroupSelect
              v-model="groupId"
              class="mt-1"
              :options="groupOptions"
              placeholder="Pick a group"
              aria-label="Group that owns the data"
              @navigate="emit('update:open', false)"
            />
          </label>
          <label class="block">
            <span class="text-xs font-medium text-foreground">Realm node</span>
            <Select
              v-model="nodeId"
              class="mt-1"
              :options="nodeOptions"
              placeholder="Pick a node"
              aria-label="Realm node holding the bucket"
            />
          </label>
        </div>

        <div>
          <span class="text-xs font-medium text-foreground">Bucket</span>
          <BucketSearchBox
            v-model="bucket"
            class="mt-1"
            mode="picker"
            allow-new
            :filter-node-id="nodeId || null"
            placeholder="Bucket name"
            @select="pickSuggestion"
          />
          <p v-if="bucketInvalid" class="mt-1 text-[11px] text-destructive">{{ bucketInvalid }}</p>
          <p v-else class="mt-1 text-[11px] text-muted-foreground">
            A new name creates the bucket on the selected node.
          </p>
        </div>

        <label class="block">
          <span class="text-xs font-medium text-foreground">Prefix <span class="text-muted-foreground">(optional)</span></span>
          <Input v-model="prefix" class="mt-1 font-mono text-xs" placeholder="raw/2026/" aria-label="Key prefix" />
        </label>

        <div class="grid gap-3 sm:grid-cols-2">
          <label class="block">
            <span class="text-xs font-medium text-foreground">Direction</span>
            <Select
              v-model="mode"
              class="mt-1"
              :options="MODE_OPTIONS"
              aria-label="Sync direction"
            />
          </label>
          <div class="flex items-start justify-between gap-3 rounded-md border border-border/70 px-3 py-2">
            <div class="min-w-0">
              <span class="text-xs font-medium text-foreground">Propagate deletes</span>
              <p class="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                Deleting a file here writes a delete marker in the realm. Earlier versions stay recoverable.
              </p>
            </div>
            <Switch
              :checked="propagateDeletes"
              aria-label="Propagate deletes to the realm"
              @update:checked="propagateDeletes = $event"
            />
          </div>
        </div>

        <p class="rounded-md bg-muted/40 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
          {{ modeHint }}
        </p>

        <RefusalNote v-if="error" :message="error" />
      </div>

      <DialogFooter>
        <DialogClose as-child><Button variant="ghost">Cancel</Button></DialogClose>
        <Button :disabled="!canSubmit" @click="submit">
          <Loader2 v-if="busy || submitting" class="h-4 w-4 animate-spin" /> Sync a folder
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
