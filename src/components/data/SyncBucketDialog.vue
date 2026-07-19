<script setup lang="ts">
import Button from '@/components/ui/Button.vue'
import Badge from '@/components/ui/Badge.vue'
import Input from '@/components/ui/Input.vue'
import Select from '@/components/ui/Select.vue'
import Switch from '@/components/ui/Switch.vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogClose from '@/components/ui/DialogClose.vue'
import BucketSearchBox from '@/components/data/BucketSearchBox.vue'
import { useAruna } from '@/composables/useAruna'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { ApiError, type BucketSearchHit, type CreateSyncRelationshipRequest, type SyncMode, type SyncReferenceHandling, type SyncRelationship } from '@/lib/api'
import { isWorkspaceBucket } from '@/lib/workspaces'
import { computed, ref, watch } from 'vue'
import { ArrowRight, Loader2 } from '@lucide/vue'

// Creates a sync relationship for one bucket (optionally narrowed to a key
// prefix). Two directions share the dialog:
//  - push (sourceNodeId null): the browsed bucket on the connected node is the
//    source; the user picks a target node + bucket.
//  - pull (sourceNodeId set): a remote bucket (e.g. a federated search hit) is
//    the source and the connected node is the target. The create request POSTs
//    to the remote node's API base, because a relationship's source is always
//    the node that receives the request.
const props = defineProps<{
  open: boolean
  sourceBucket: string
  /** Key prefix under the source bucket, e.g. the current breadcrumb prefix ("a/b/"). */
  sourcePrefix?: string
  /** Node hosting the source bucket; null/absent = the connected node. */
  sourceNodeId?: string | null
}>()

const emit = defineEmits<{
  (e: 'update:open', v: boolean): void
  (e: 'created', relationship: SyncRelationship): void
}>()

const { createSyncRelationship } = useAruna()
const realmNodes = useRealmNodes()

const pullMode = computed(() => Boolean(props.sourceNodeId))
const sourceNode = computed(() => (props.sourceNodeId ? realmNodes.nodeById(props.sourceNodeId) : null))
// Pull mode POSTs to the source node's API; without a published URL the
// relationship must be created from that node's own portal.
const sourceApiBase = computed(() => sourceNode.value?.apiBase ?? null)

const sourcePrefix = ref('')
const targetNodeId = ref('')
const targetBucket = ref('')
const targetPrefix = ref('')
const mode = ref<SyncMode>('once')
const referenceHandling = ref<SyncReferenceHandling>('materialize')
const replicateDeletes = ref(false)
const busy = ref(false)
const error = ref<string | null>(null)

watch(
  () => props.open,
  (open) => {
    if (!open) return
    sourcePrefix.value = props.sourcePrefix ?? ''
    targetNodeId.value = pullMode.value ? (realmNodes.localNodeId.value ?? '') : ''
    targetBucket.value = props.sourceBucket
    targetPrefix.value = ''
    mode.value = 'once'
    referenceHandling.value = 'materialize'
    replicateDeletes.value = false
    busy.value = false
    error.value = null
  },
)

const nodeOptions = computed(() =>
  realmNodes.nodes.value.map((node) => ({
    value: node.nodeId,
    label: `${node.label}${node.isLocal ? ' (this node)' : ''}${node.reachable ? '' : ' (offline)'}`,
  })),
)

const targetNodeLabel = computed(() => realmNodes.displayName(targetNodeId.value || null))
const sourceNodeLabel = computed(() =>
  pullMode.value ? realmNodes.displayName(props.sourceNodeId ?? null) : 'this node',
)

interface ModeOption {
  value: SyncMode
  label: string
  description: string
}
const MODE_OPTIONS: ModeOption[] = [
  { value: 'once', label: 'Once', description: 'Copies everything under the source to the target once, right now.' },
  {
    value: 'continuous',
    label: 'Keep in sync',
    description: 'Copies the existing data, then keeps following new uploads automatically.',
  },
  {
    value: 'reference',
    label: 'Reference',
    description: 'Exposes the source objects at the target without copying the data.',
  },
]
const REFERENCE_HANDLING_OPTIONS: Array<{ value: SyncReferenceHandling; label: string; description: string }> = [
  { value: 'materialize', label: 'Materialize', description: 'Download referenced source data on the sender and copy the bytes to the target.' },
  { value: 'preserve', label: 'Preserve references', description: 'Send reference metadata so the target keeps the objects lazy.' },
  { value: 'skip', label: 'Skip references', description: 'Sync materialized objects only and leave referenced objects out.' },
]

function pickSuggestion(hit: BucketSearchHit) {
  targetBucket.value = hit.bucket
  if (!pullMode.value) targetNodeId.value = hit.node_id
}

const bucketInvalid = computed(() => {
  const name = targetBucket.value.trim()
  if (!name) return null
  if (name.includes('/')) return "The bucket name cannot contain '/'."
  if (isWorkspaceBucket(name)) return 'Workspace buckets (ws-…) cannot be synchronized.'
  return null
})

const sameEndpoint = computed(() => {
  const sourceNodeKey = props.sourceNodeId ?? realmNodes.localNodeId.value ?? ''
  const targetNodeKey = targetNodeId.value
  return (
    Boolean(targetNodeKey) &&
    sourceNodeKey === targetNodeKey &&
    props.sourceBucket === targetBucket.value.trim() &&
    (sourcePrefix.value.trim() || '') === (targetPrefix.value.trim() || '')
  )
})

const canSubmit = computed(
  () =>
    !busy.value &&
    Boolean(targetNodeId.value) &&
    Boolean(targetBucket.value.trim()) &&
    !bucketInvalid.value &&
    !sameEndpoint.value &&
    !(pullMode.value && !sourceApiBase.value),
)

async function submit() {
  if (!canSubmit.value) return
  busy.value = true
  error.value = null
  const source: CreateSyncRelationshipRequest['source'] = { bucket: props.sourceBucket }
  const srcPrefix = sourcePrefix.value.trim()
  if (srcPrefix) source.prefix = srcPrefix
  const target: CreateSyncRelationshipRequest['target'] = {
    node_id: targetNodeId.value,
    bucket: targetBucket.value.trim(),
  }
  const tgtPrefix = targetPrefix.value.trim()
  if (tgtPrefix) target.prefix = tgtPrefix
  try {
    const relationship = await createSyncRelationship(
      { source, target, mode: mode.value, reference_handling: mode.value === 'reference' ? 'preserve' : referenceHandling.value, replicate_deletes: replicateDeletes.value },
      pullMode.value && sourceApiBase.value ? { baseUrl: sourceApiBase.value } : {},
    )
    emit('created', relationship)
    emit('update:open', false)
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 409) {
        error.value = 'This sync relationship already exists.'
      } else if (err.status === 502) {
        error.value = 'The target node is unreachable right now, the relationship was not created.'
      } else if (err.status === 401 || err.status === 403) {
        error.value = 'You need read access on the source bucket to set up a sync.'
      } else {
        error.value = err.message
      }
    } else {
      error.value = err instanceof Error ? err.message : String(err)
    }
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <Dialog :open="props.open" @update:open="(v: boolean) => emit('update:open', v)">
    <DialogContent class="max-w-lg">
      <DialogHeader>
        <DialogTitle>{{ pullMode ? 'Sync to this node' : 'Sync bucket' }}</DialogTitle>
        <DialogDescription>
          Replicates objects from
          <span class="font-mono text-xs">{{ sourceBucket }}{{ sourcePrefix ? `/${sourcePrefix.replace(/\/$/, '')}` : '' }}</span>
          on {{ sourceNodeLabel }} to another bucket in this realm.
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-4">
        <!-- Direction summary -->
        <div class="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
          <Badge :variant="pullMode ? 'outline' : 'accent'" class="text-[10px]">{{ sourceNodeLabel }}</Badge>
          <span class="min-w-0 truncate font-mono">{{ sourceBucket }}{{ sourcePrefix.trim() ? `/${sourcePrefix.trim().replace(/\/$/, '')}` : '' }}</span>
          <ArrowRight class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <Badge :variant="pullMode ? 'accent' : 'outline'" class="text-[10px]">{{ targetNodeId ? targetNodeLabel : 'target node' }}</Badge>
          <span class="min-w-0 truncate font-mono">{{ targetBucket.trim() || 'target-bucket' }}{{ targetPrefix.trim() ? `/${targetPrefix.trim().replace(/\/$/, '')}` : '' }}</span>
        </div>

        <div class="grid gap-3 sm:grid-cols-2">
          <label class="space-y-1 text-xs">
            <span class="font-medium text-foreground">Source prefix</span>
            <Input v-model="sourcePrefix" placeholder="whole bucket" class="h-8 font-mono text-xs" />
            <span class="block text-[11px] text-muted-foreground">Only keys under this prefix are synced. Leave empty for the whole bucket.</span>
          </label>
          <label class="space-y-1 text-xs">
            <span class="font-medium text-foreground">Target prefix</span>
            <Input v-model="targetPrefix" placeholder="bucket root" class="h-8 font-mono text-xs" />
            <span class="block text-[11px] text-muted-foreground">Synced keys are placed under this prefix at the target.</span>
          </label>
        </div>

        <div class="space-y-1 text-xs">
          <span class="font-medium text-foreground">Target node</span>
          <p v-if="pullMode" class="flex items-center gap-2">
            <Badge variant="accent" class="text-[10px]">{{ targetNodeLabel }}</Badge>
            <span class="text-muted-foreground">The connected node receives the data.</span>
          </p>
          <Select
            v-else
            :model-value="targetNodeId"
            :options="nodeOptions"
            placeholder="Select target node"
            aria-label="Target node"
            class="h-8 text-xs"
            @update:model-value="(v: string) => (targetNodeId = v)"
          />
        </div>

        <div class="space-y-1 text-xs">
          <span class="font-medium text-foreground">Target bucket</span>
          <!-- The picker input IS the bucket-name field: typing searches
               existing buckets (narrowed to the chosen node) while any name —
               matched or not — stays valid, because the backend auto-creates
               missing target buckets. -->
          <BucketSearchBox
            v-model="targetBucket"
            mode="picker"
            :filter-node-id="pullMode ? realmNodes.localNodeId.value : targetNodeId || null"
            allow-new
            placeholder="bucket-name"
            @select="pickSuggestion"
          />
          <p v-if="bucketInvalid" class="text-[11px] text-destructive">{{ bucketInvalid }}</p>
          <p v-else-if="targetBucket.trim() && targetNodeId" class="text-[11px] text-muted-foreground">
            If <span class="font-mono">{{ targetBucket.trim() }}</span> does not exist on {{ targetNodeLabel }} yet, it is created automatically.
          </p>
        </div>

        <fieldset class="space-y-2">
          <legend class="text-xs font-medium text-foreground">Mode</legend>
          <label
            v-for="option in MODE_OPTIONS"
            :key="option.value"
            class="flex items-start gap-2 text-sm"
          >
            <input
              v-model="mode"
              type="radio"
              :value="option.value"
              class="mt-1 h-3.5 w-3.5 shrink-0 accent-primary"
            />
            <span>
              <span class="text-xs font-medium text-foreground">{{ option.label }}</span>
              <span class="block text-[11px] text-muted-foreground">{{ option.description }}</span>
            </span>
          </label>
        </fieldset>

        <fieldset v-if="mode !== 'reference'" class="space-y-2">
          <legend class="text-xs font-medium text-foreground">Source references</legend>
          <label v-for="option in REFERENCE_HANDLING_OPTIONS" :key="option.value" class="flex items-start gap-2 text-sm">
            <input v-model="referenceHandling" type="radio" :value="option.value" class="mt-1 h-3.5 w-3.5 shrink-0 accent-primary" />
            <span>
              <span class="text-xs font-medium text-foreground">{{ option.label }}</span>
              <span class="block text-[11px] text-muted-foreground">{{ option.description }}</span>
            </span>
          </label>
        </fieldset>

        <label class="flex items-center justify-between gap-3 text-xs">
          <span>
            <span class="font-medium text-foreground">Replicate deletions</span>
            <span class="block text-[11px] text-muted-foreground">Deleting a source object also writes a delete marker at the target.</span>
          </span>
          <Switch :checked="replicateDeletes" @update:checked="(v: boolean) => (replicateDeletes = v)" />
        </label>

        <p v-if="sameEndpoint" class="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
          Source and target are the same bucket and prefix, pick a different node, bucket or prefix.
        </p>
        <p v-if="pullMode && !sourceApiBase" class="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
          {{ sourceNodeLabel }} does not publish an API URL, so the sync cannot be created from here. Create it from that node's portal instead.
        </p>
        <p v-if="error" class="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">{{ error }}</p>
      </div>

      <DialogFooter>
        <DialogClose><Button variant="outline">Cancel</Button></DialogClose>
        <Button :disabled="!canSubmit" @click="submit">
          <Loader2 v-if="busy" class="h-4 w-4 animate-spin" />
          {{ busy ? 'Creating…' : mode === 'once' ? 'Sync now' : 'Create sync' }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
