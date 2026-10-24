<script setup lang="ts">
// Link a local folder: a folder on this computer and a bucket on a realm node
// kept in step. A bucket page hands its own bucket in; other pages leave it
// open to pick. Only a bucket asked for through New bucket is created, by the link.
import { computed, ref, watch } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
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
import LinkBucketPicker from '@/components/desktop/LinkBucketPicker.vue'
import NewBucketDialog from '@/components/desktop/NewBucketDialog.vue'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { useSyncedFolders } from '@/composables/useSyncedFolders'
import { ApiError, type BucketSearchHit } from '@/lib/api'
import type { BindSource } from '@/lib/bindSource'
import { placeName } from '@/lib/bucketPlace'
import type { FolderMode, SyncedFolder } from '@/lib/deviceApi'
import { errorMessage } from '@/lib/utils'
import { ArrowDown, ArrowLeft, ArrowLeftRight, ArrowRight, ArrowUp, Boxes, ChevronRight, Folder, FolderOpen, Link } from '@lucide/vue'

// A bucket a page already knows; newBucket marks one that New bucket asked for.
const props = defineProps<{
  open: boolean
  bucket?: string
  nodeId?: string | null
  groupId?: string | null
  newBucket?: boolean
}>()
const emit = defineEmits<{
  (e: 'update:open', v: boolean): void
  (e: 'bound', folder: SyncedFolder): void
}>()

const realmNodes = useRealmNodes()
const { bind, busy } = useSyncedFolders()

const CHOICES: Array<{ value: FolderMode; title: string; text: string; icon: unknown }> = [
  {
    value: 'upload_only',
    title: 'Send to Aruna',
    text: 'Copy files into the bucket. Nothing changes here.',
    icon: ArrowUp,
  },
  {
    value: 'download_only',
    title: 'Keep a copy here',
    text: 'Download the bucket and keep it up to date. Your own edits are never overwritten.',
    icon: ArrowDown,
  },
  {
    value: 'two_way',
    title: 'Both ways',
    text: 'Changes go both ways. If both sides change a file, you decide.',
    icon: ArrowLeftRight,
  },
]
const ARROWS: Record<FolderMode, unknown> = {
  upload_only: ArrowRight,
  download_only: ArrowLeft,
  two_way: ArrowLeftRight,
}

const mode = ref<FolderMode>('two_way')
const root = ref('')
const query = ref('')
const prefix = ref('')
const propagateDeletes = ref(true)
// The bucket the owner settled on; null while one is still being picked.
const chosen = ref<(BindSource & { isNew: boolean }) | null>(null)
const newOpen = ref(false)
const newName = ref('')
const error = ref<string | null>(null)
const pickError = ref<string | null>(null)
const submitting = ref(false)

watch(
  () => props.open,
  (open) => {
    if (!open) return
    root.value = ''
    query.value = ''
    prefix.value = ''
    propagateDeletes.value = true
    error.value = null
    pickError.value = null
    newOpen.value = false
    const given = props.bucket?.trim()
    if (given && props.nodeId && props.groupId) {
      chosen.value = { bucket: given, nodeId: props.nodeId, groupId: props.groupId, isNew: Boolean(props.newBucket) }
      mode.value = props.newBucket ? 'two_way' : 'download_only'
    } else {
      chosen.value = null
      mode.value = 'two_way'
    }
  },
  { immediate: true },
)

async function chooseFolder(): Promise<void> {
  pickError.value = null
  try {
    const { pickDirectory } = await import('@/lib/desktopBridge')
    const picked = await pickDirectory({ title: 'Folder to link', startPath: root.value || undefined })
    if (picked) root.value = picked
  } catch (err) {
    pickError.value = errorMessage(err)
  }
}

function pickSuggestion(hit: BucketSearchHit): void {
  chosen.value = { bucket: hit.bucket, nodeId: hit.node_id, groupId: hit.group_id, isNew: false }
}

function pickAnother(): void {
  chosen.value = null
  query.value = ''
}

function askNew(name: string): void {
  newName.value = name
  newOpen.value = true
}

function onNewBucket(target: BindSource): void {
  chosen.value = { ...target, isNew: true }
}

function placeOf(nodeId: string): string {
  const node = realmNodes.nodeById(nodeId)
  return node ? placeName(node) : realmNodes.displayName(nodeId)
}

const folderHint = computed(() =>
  mode.value === 'upload_only'
    ? 'The files in this folder are copied into the bucket. The folder stays where it is.'
    : 'Pick an empty folder or make a new one. Files from the bucket are saved here.',
)

// A copy to this computer needs something to copy.
const bucketInvalid = computed(() =>
  mode.value === 'download_only' && chosen.value?.isNew
    ? 'A new bucket is empty. Choose Send to Aruna or Both ways.'
    : null,
)
const uploads = computed(() => mode.value !== 'download_only')

const canSubmit = computed(
  () => Boolean(root.value.trim() && chosen.value) && !bucketInvalid.value && !busy.value && !submitting.value,
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
  const target = chosen.value
  if (!canSubmit.value || !target) return
  error.value = null
  submitting.value = true
  try {
    const folder = await bind({
      root: root.value.trim(),
      group_id: target.groupId,
      remote: { node_id: target.nodeId, bucket: target.bucket, prefix: prefix.value.trim() },
      create_bucket: target.isNew,
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
  <Dialog :open="props.open && !newOpen" @update:open="(v: boolean) => emit('update:open', v)">
    <DialogContent class="max-w-xl">
      <DialogHeader>
        <DialogTitle>Link a local folder</DialogTitle>
        <DialogDescription>Keep a folder on this computer and a bucket in step.</DialogDescription>
      </DialogHeader>

      <div class="space-y-4 py-1">
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
            class="surface-muted mt-1 flex flex-wrap items-center gap-2 px-3 py-2 text-xs"
            data-testid="chosen-bucket"
          >
            <Boxes class="h-3.5 w-3.5 shrink-0 text-primary" />
            <span class="font-mono text-foreground">{{ chosen.bucket }}</span>
            <span class="text-muted-foreground">on {{ placeOf(chosen.nodeId) }}</span>
            <Badge v-if="chosen.isNew" variant="outline" size="sm">new</Badge>
            <button type="button" class="ml-auto text-primary hover:underline" @click="pickAnother">Pick another</button>
          </div>
          <template v-else>
            <LinkBucketPicker v-model="query" class="mt-1" @select="pickSuggestion" @new="askNew" />
            <p class="mt-1 text-[11px] text-muted-foreground">
              Shows every bucket you can use, with its place. Nothing is created unless you choose New bucket.
            </p>
          </template>
          <p v-if="bucketInvalid" class="mt-1 text-[11px] text-destructive">{{ bucketInvalid }}</p>
        </div>

        <div>
          <span class="text-xs font-medium text-foreground">What should happen?</span>
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

        <details class="group surface-inline px-3 py-2">
          <summary class="flex cursor-pointer list-none items-center gap-2 text-xs font-medium text-foreground">
            <ChevronRight class="h-3.5 w-3.5 transition-transform group-open:rotate-90" /> More options
          </summary>
          <div class="mt-3 space-y-3">
            <label class="block">
              <span class="text-xs font-medium text-foreground">
                Only this part of the bucket <span class="text-muted-foreground">(optional)</span>
              </span>
              <Input v-model="prefix" class="mt-1 font-mono text-xs" placeholder="2026/run-17/" aria-label="Prefix" />
              <span class="mt-1 block text-[11px] text-muted-foreground">Leave empty to use the whole bucket.</span>
            </label>
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

        <p
          v-if="root && chosen"
          class="surface-muted flex flex-wrap items-center gap-1.5 px-3 py-2 text-xs"
          data-testid="link-summary"
        >
          <Folder class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <code class="min-w-0 truncate font-mono">{{ root }}</code>
          <component :is="ARROWS[mode]" class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <Boxes class="h-3.5 w-3.5 shrink-0 text-primary" />
          <span>
            <code class="font-mono">{{ chosen.bucket }}</code> on {{ placeOf(chosen.nodeId)
            }}{{ chosen.isNew ? ' (new)' : '' }}
          </span>
        </p>

        <RefusalNote v-if="error" :message="error" />
      </div>

      <DialogFooter>
        <DialogClose as-child><Button variant="ghost">Cancel</Button></DialogClose>
        <Button :disabled="!canSubmit" @click="submit">
          <Spinner v-if="busy || submitting" label="Linking the folder…" />
          <Link v-else class="h-4 w-4" />
          Link folder
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>

  <NewBucketDialog v-model:open="newOpen" :name="newName" :group-id="props.groupId" for-link @link="onNewBucket" />
</template>
