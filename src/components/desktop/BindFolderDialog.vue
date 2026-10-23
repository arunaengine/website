<script setup lang="ts">
// Sync to this computer: what you want to happen comes first, then the folder
// and the bucket. A bucket page hands its own bucket in; the Home and Sync
// pages leave it open to pick. The folder is picked with the shell's native
// dialog, and the rare settings wait under More options.
import { computed, ref, watch } from 'vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Select from '@/components/ui/Select.vue'
import Switch from '@/components/ui/Switch.vue'
import RefusalNote from '@/components/ui/RefusalNote.vue'
import Spinner from '@/components/ui/Spinner.vue'
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
import { ApiError, type BucketSearchHit } from '@/lib/api'
import type { FolderMode, SyncedFolder } from '@/lib/deviceApi'
import { errorMessage } from '@/lib/utils'
import { ArrowDown, ArrowLeftRight, ArrowUp, Boxes, ChevronRight, FolderOpen } from '@lucide/vue'

// A bucket a page already knows: where it lives and which group owns it.
const props = defineProps<{ open: boolean; bucket?: string; nodeId?: string | null; groupId?: string | null }>()
const emit = defineEmits<{
  (e: 'update:open', v: boolean): void
  (e: 'bound', folder: SyncedFolder): void
}>()

const { myGroups } = useAruna()
const realmNodes = useRealmNodes()
const { bind, busy } = useSyncedFolders()

const CHOICES: Array<{ value: FolderMode; title: string; text: string; icon: unknown }> = [
  {
    value: 'upload_only',
    title: 'Send a folder to Aruna',
    text: 'Copy files from this computer into the bucket. Nothing is changed on this computer.',
    icon: ArrowUp,
  },
  {
    value: 'download_only',
    title: 'Keep a copy on this computer',
    text: 'Download the bucket into a folder and keep it up to date. Your own edits are never overwritten.',
    icon: ArrowDown,
  },
  {
    value: 'two_way',
    title: 'Both ways',
    text: 'Changes travel in both directions. If both sides change a file, you decide.',
    icon: ArrowLeftRight,
  },
]

const mode = ref<FolderMode>('two_way')
const root = ref('')
const groupId = ref('')
const nodeId = ref('')
const bucket = ref('')
const prefix = ref('')
const propagateDeletes = ref(true)
// The bucket the owner settled on; null while one is still being typed or picked.
const chosen = ref<{ bucket: string; nodeId: string; groupId: string } | null>(null)
const error = ref<string | null>(null)
const pickError = ref<string | null>(null)
const submitting = ref(false)

// Only realm nodes hold the other half of a folder; other devices never do.
const nodeChoices = computed(() =>
  realmNodes.nodes.value
    .filter((node) => node.kind !== 'user')
    .map((node) => ({
      value: node.nodeId,
      label: `${node.label}${node.reachable ? '' : ' (unreachable)'}`,
      reachable: node.reachable,
    })),
)
const nodeOptions = computed(() => nodeChoices.value.map(({ value, label }) => ({ value, label })))
const groupOptions = computed(() => myGroups.value.map((group) => ({ value: group.id, label: group.name })))
const nodeName = (id: string) => nodeChoices.value.find((node) => node.value === id)?.label ?? 'this realm'

watch(
  () => props.open,
  (open) => {
    if (!open) return
    root.value = ''
    prefix.value = ''
    propagateDeletes.value = true
    error.value = null
    pickError.value = null
    const fallbackGroup = groupOptions.value[0]?.value ?? ''
    const fallbackNode = (nodeChoices.value.find((node) => node.reachable) ?? nodeChoices.value[0])?.value ?? ''
    const given = props.bucket?.trim()
    if (given) {
      const host = props.nodeId || fallbackNode
      chosen.value = { bucket: given, nodeId: host, groupId: props.groupId || fallbackGroup }
      bucket.value = given
      nodeId.value = host
      groupId.value = chosen.value.groupId
      mode.value = 'download_only'
    } else {
      chosen.value = null
      bucket.value = ''
      nodeId.value = fallbackNode
      groupId.value = fallbackGroup
      mode.value = 'two_way'
    }
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
    pickError.value = errorMessage(err)
  }
}

function pickSuggestion(hit: BucketSearchHit): void {
  chosen.value = { bucket: hit.bucket, nodeId: hit.node_id || nodeId.value, groupId: hit.group_id }
  bucket.value = hit.bucket
  if (hit.node_id) nodeId.value = hit.node_id
  if (hit.group_id) groupId.value = hit.group_id
}

function pickAnother(): void {
  chosen.value = null
  bucket.value = ''
}

// Typing over a picked bucket makes it a new name again.
watch(bucket, (name) => {
  if (chosen.value && chosen.value.bucket !== name.trim()) chosen.value = null
})
watch(nodeId, (selected) => {
  if (chosen.value && chosen.value.nodeId !== selected) chosen.value = null
})

const folderHint = computed(() =>
  mode.value === 'upload_only'
    ? 'The files in this folder are copied into the bucket. The folder stays where it is.'
    : 'Pick an empty folder or make a new one. Files from the bucket are saved here.',
)

const bucketInvalid = computed(() => {
  const name = bucket.value.trim()
  if (!name) return null
  if (name.includes('/')) return "The bucket name cannot contain '/'."
  if (isWorkspaceBucket(name)) return 'Workspace buckets (ws-…) cannot be synced to a folder.'
  // A copy to this computer needs something to copy.
  if (mode.value === 'download_only' && !chosen.value) return 'Pick a bucket that exists, so there is something to copy.'
  return null
})

// A new bucket belongs to a group, which is only worth asking when there is a choice.
const askGroup = computed(() => !chosen.value && groupOptions.value.length > 1)
const uploads = computed(() => mode.value !== 'download_only')

const canSubmit = computed(
  () =>
    Boolean(root.value.trim() && groupId.value && nodeId.value && bucket.value.trim()) &&
    !bucketInvalid.value &&
    !busy.value &&
    !submitting.value,
)

// Only an older node's refusal of the mode itself says so; every other refusal
// (an unusable folder, a bad name) is shown as the node worded it.
const UNKNOWN_MODE = /unknown variant\s+[`'"]?download_only/i

function refusal(err: unknown): string {
  if (
    mode.value === 'download_only' &&
    err instanceof ApiError &&
    (err.status === 400 || err.status === 422) &&
    UNKNOWN_MODE.test(err.message)
  ) {
    return 'This version of Aruna cannot keep a copy on this computer yet. Choose another way, or update Aruna.'
  }
  return errorMessage(err)
}

async function submit(): Promise<void> {
  if (!canSubmit.value) return
  error.value = null
  submitting.value = true
  try {
    const folder = await bind({
      root: root.value.trim(),
      group_id: groupId.value,
      remote: { node_id: nodeId.value, bucket: bucket.value.trim(), prefix: prefix.value.trim() },
      create_bucket: !chosen.value,
      mode: mode.value,
      propagate_deletes: propagateDeletes.value,
    })
    emit('bound', folder)
    emit('update:open', false)
  } catch (err) {
    error.value = refusal(err)
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <Dialog :open="props.open" @update:open="(v: boolean) => emit('update:open', v)">
    <DialogContent class="max-w-xl">
      <DialogHeader>
        <DialogTitle>Sync to this computer</DialogTitle>
        <DialogDescription>
          {{
            props.bucket
              ? 'Choose how this bucket and a folder on your computer work together.'
              : 'Choose a bucket, and how it works together with a folder on your computer.'
          }}
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-4 py-1">
        <div>
          <span class="text-xs font-medium text-foreground">What do you want to do?</span>
          <div class="mt-2 grid gap-2 sm:grid-cols-3" role="group" aria-label="Direction">
            <button
              v-for="choice in CHOICES"
              :key="choice.value"
              type="button"
              :aria-pressed="mode === choice.value"
              class="flex flex-col items-start gap-1 rounded-lg border border-border bg-background p-3 text-left transition-colors hover:border-primary/40"
              :class="mode === choice.value ? 'border-primary/60 bg-primary/5 ring-1 ring-primary/30' : ''"
              @click="mode = choice.value"
            >
              <span class="flex items-center gap-2 text-sm font-medium text-foreground">
                <component :is="choice.icon" class="h-4 w-4 shrink-0 text-primary" />
                {{ choice.title }}
              </span>
              <span class="text-[11px] leading-snug text-muted-foreground">{{ choice.text }}</span>
            </button>
          </div>
        </div>

        <div>
          <span class="text-xs font-medium text-foreground">Folder on this computer</span>
          <div class="mt-1 flex flex-wrap items-center gap-2">
            <code class="surface-muted min-w-0 flex-1 truncate px-3 py-2 font-mono text-xs">{{
              root || 'No folder picked yet'
            }}</code>
            <Button variant="outline" size="sm" @click="chooseFolder">
              <FolderOpen class="h-3.5 w-3.5" /> Choose
            </Button>
          </div>
          <p v-if="pickError" class="mt-1 text-[11px] text-destructive">{{ pickError }}</p>
          <p v-else class="mt-1 text-[11px] text-muted-foreground">{{ folderHint }}</p>
        </div>

        <div>
          <span class="text-xs font-medium text-foreground">Bucket</span>
          <div
            v-if="chosen"
            class="surface-muted mt-1 flex items-center gap-2 px-3 py-2 text-xs"
            data-testid="chosen-bucket"
          >
            <Boxes class="h-3.5 w-3.5 shrink-0 text-primary" />
            <span class="font-mono text-foreground">{{ chosen.bucket }}</span>
            <span class="text-muted-foreground">on {{ nodeName(chosen.nodeId) }}</span>
            <button type="button" class="ml-auto text-primary hover:underline" @click="pickAnother">Pick another</button>
          </div>
          <template v-else>
            <BucketSearchBox
              v-model="bucket"
              class="mt-1"
              mode="picker"
              :allow-new="uploads"
              :filter-node-id="nodeId || null"
              placeholder="Bucket name"
              @select="pickSuggestion"
            />
            <p v-if="bucketInvalid" class="mt-1 text-[11px] text-destructive">{{ bucketInvalid }}</p>
            <p v-else-if="uploads" class="mt-1 text-[11px] text-muted-foreground">
              A bucket that does not exist yet is made for you.
            </p>
          </template>
        </div>

        <label v-if="askGroup" class="block">
          <span class="text-xs font-medium text-foreground">Group</span>
          <GroupSelect
            v-model="groupId"
            class="mt-1"
            :options="groupOptions"
            placeholder="Pick a group"
            aria-label="Group that owns the data"
            @navigate="emit('update:open', false)"
          />
          <span class="mt-1 block text-[11px] text-muted-foreground">The group that owns the new bucket.</span>
        </label>

        <details class="group surface-inline px-3 py-2">
          <summary class="flex cursor-pointer list-none items-center gap-2 text-xs font-medium text-foreground">
            <ChevronRight class="h-3.5 w-3.5 transition-transform group-open:rotate-90" /> More options
          </summary>
          <div class="mt-3 space-y-3">
            <div class="grid gap-3 sm:grid-cols-2">
              <label class="block">
                <span class="text-xs font-medium text-foreground">Which node</span>
                <Select
                  v-model="nodeId"
                  class="mt-1"
                  :options="nodeOptions"
                  :disabled="Boolean(chosen)"
                  placeholder="Pick a node"
                  aria-label="Realm node holding the bucket"
                />
                <span class="mt-1 block text-[11px] text-muted-foreground">The node that stores the bucket.</span>
              </label>
              <label class="block">
                <span class="text-xs font-medium text-foreground">
                  Only this part of the bucket <span class="text-muted-foreground">(optional)</span>
                </span>
                <Input v-model="prefix" class="mt-1 font-mono text-xs" placeholder="2026/run-17/" aria-label="Prefix" />
                <span class="mt-1 block text-[11px] text-muted-foreground">Leave empty to use the whole bucket.</span>
              </label>
            </div>
            <div v-if="uploads" class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <span class="text-xs font-medium text-foreground">Pass on deletions</span>
                <p class="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                  When you delete a file here, it is also deleted in Aruna. Earlier versions can still be restored.
                </p>
              </div>
              <Switch
                :checked="propagateDeletes"
                aria-label="Pass on deletions"
                @update:checked="propagateDeletes = $event"
              />
            </div>
          </div>
        </details>

        <RefusalNote v-if="error" :message="error" />
      </div>

      <DialogFooter>
        <DialogClose as-child><Button variant="ghost">Cancel</Button></DialogClose>
        <Button :disabled="!canSubmit" @click="submit">
          <Spinner v-if="busy || submitting" label="Starting the sync…" /> Start syncing
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
