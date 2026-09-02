<script setup lang="ts">
import Button from '@/components/ui/Button.vue'
import Badge from '@/components/ui/Badge.vue'
import Input from '@/components/ui/Input.vue'
import Notice from '@/components/ui/Notice.vue'
import Spinner from '@/components/ui/Spinner.vue'
import Select from '@/components/ui/Select.vue'
import Switch from '@/components/ui/Switch.vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DocsLink from '@/components/ui/DocsLink.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogClose from '@/components/ui/DialogClose.vue'
import BucketSearchBox from '@/components/data/BucketSearchBox.vue'
import { useAruna } from '@/composables/useAruna'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { ApiError, type BucketSearchHit, type CreateSyncRelationshipRequest, type SyncMode, type SyncReferenceHandling, type SyncRelationship } from '@/lib/api'
import { isWorkspaceBucket } from '@/lib/workspaces'
import { errorMessage } from '@/lib/utils'
import { computed, ref, watch } from 'vue'
import { ArrowRight } from '@lucide/vue'

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
const sourceUnreachable = computed(() => pullMode.value && !sourceApiBase.value)
const targetUnreachable = computed(
  () => Boolean(targetNodeId.value) && realmNodes.nodeById(targetNodeId.value)?.reachable === false,
)

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
    label: `${node.label}${node.isLocal ? ' (this node)' : ''}${node.reachable ? '' : ' (unreachable)'}`,
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
  { value: 'once', label: 'Once', description: 'Copies everything under the source now; it can be run again later.' },
  { value: 'continuous', label: 'Keep in sync', description: 'Copies what is there, then follows every new version.' },
  { value: 'reference', label: 'Reference', description: 'The target gets pointers to the source, not the data.' },
]
const REFERENCE_HANDLING_OPTIONS: Array<{ value: SyncReferenceHandling; label: string; description: string }> = [
  { value: 'materialize', label: 'Fetch the data and send it', description: 'The sender downloads that data first.' },
  { value: 'preserve', label: 'Send the pointer unchanged', description: 'The target points at the original data.' },
  { value: 'skip', label: 'Leave those objects out', description: 'Only objects holding their own data are synced.' },
]

// One selectable card per option, in the shape of the placement editor's controls.
function optionClass(selected: boolean): string[] {
  return [
    'rounded-md border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    selected ? 'border-primary/50 bg-primary/[0.08]' : 'border-border hover:bg-muted/50',
  ]
}

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
      error.value = errorMessage(err)
    }
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <Dialog :open="props.open" @update:open="(v: boolean) => emit('update:open', v)">
    <DialogContent class="max-w-2xl">
      <DialogHeader>
        <DialogTitle>{{ pullMode ? 'Sync to this node' : 'Sync bucket' }}</DialogTitle>
        <DialogDescription>
          A sync writes a second, independently owned copy into another bucket.
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-5">
        <div class="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
          <Badge :variant="pullMode ? 'outline' : 'accent'" size="sm">{{ sourceNodeLabel }}</Badge>
          <Badge v-if="sourceUnreachable" variant="warn" size="sm">Realm unreachable</Badge>
          <span class="min-w-0 truncate font-mono">{{ sourceBucket }}{{ sourcePrefix.trim() ? `/${sourcePrefix.trim().replace(/\/$/, '')}` : '' }}</span>
          <ArrowRight class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <Badge :variant="pullMode ? 'accent' : 'outline'" size="sm">{{ targetNodeId ? targetNodeLabel : 'target node' }}</Badge>
          <Badge v-if="targetUnreachable" variant="warn" size="sm">Realm unreachable</Badge>
          <span class="min-w-0 truncate font-mono">{{ targetBucket.trim() || 'target-bucket' }}{{ targetPrefix.trim() ? `/${targetPrefix.trim().replace(/\/$/, '')}` : '' }}</span>
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <div>
            <span class="text-xs font-medium text-foreground">Target node</span>
            <p v-if="pullMode" class="mt-1 flex h-8 items-center gap-2 text-xs">
              <Badge variant="accent" size="sm">{{ targetNodeLabel }}</Badge>
              <span class="text-muted-foreground">The connected node receives the data.</span>
            </p>
            <Select
              v-else
              :model-value="targetNodeId"
              :options="nodeOptions"
              placeholder="Pick a node"
              aria-label="Target node"
              class="mt-1 h-8 text-xs"
              @update:model-value="(v: string) => (targetNodeId = v)"
            />
          </div>
          <div>
            <span class="text-xs font-medium text-foreground">Target bucket</span>
            <!-- The picker input IS the bucket-name field: typing searches
                 existing buckets (narrowed to the chosen node) while any name,
                 matched or not, stays valid, because the backend auto-creates
                 missing target buckets. -->
            <div class="mt-1">
              <BucketSearchBox
                v-model="targetBucket"
                mode="picker"
                :filter-node-id="pullMode ? realmNodes.localNodeId.value : targetNodeId || null"
                allow-new
                placeholder="bucket-name"
                @select="pickSuggestion"
              />
            </div>
            <p v-if="bucketInvalid" class="mt-1 text-[11px] text-destructive">{{ bucketInvalid }}</p>
            <p v-else-if="targetBucket.trim() && targetNodeId" class="mt-1 text-[11px] text-muted-foreground">
              Created on {{ targetNodeLabel }} if it does not exist yet.
            </p>
          </div>
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <div>
            <label for="sync-source-prefix" class="text-xs font-medium text-foreground">Source prefix</label>
            <Input id="sync-source-prefix" v-model="sourcePrefix" placeholder="whole bucket" class="mt-1 h-8 font-mono text-xs" />
            <p class="mt-1 text-[11px] text-muted-foreground">
              Only keys under it are synced; empty means the whole bucket.
            </p>
          </div>
          <div>
            <label for="sync-target-prefix" class="text-xs font-medium text-foreground">Target prefix</label>
            <Input id="sync-target-prefix" v-model="targetPrefix" placeholder="bucket root" class="mt-1 h-8 font-mono text-xs" />
            <p class="mt-1 text-[11px] text-muted-foreground">
              Synced keys land under it at the target; empty means the root.
            </p>
          </div>
        </div>

        <div>
          <span class="text-xs font-medium text-foreground">Mode</span>
          <div class="mt-1 grid gap-2 sm:grid-cols-3" role="group" aria-label="Mode">
            <button
              v-for="option in MODE_OPTIONS"
              :key="option.value"
              type="button"
              :aria-pressed="mode === option.value"
              :class="optionClass(mode === option.value)"
              @click="mode = option.value"
            >
              <span class="block text-[13px] font-medium text-foreground">{{ option.label }}</span>
              <span class="mt-0.5 block text-[11px] text-muted-foreground">{{ option.description }}</span>
            </button>
          </div>
        </div>

        <div v-if="mode !== 'reference'">
          <p class="text-xs font-medium text-foreground">
            When a source object points at data elsewhere
            <DocsLink icon topic="where-data-lives" section="Syncs" class="ml-0.5" />
          </p>
          <div
            class="mt-1 grid gap-2 sm:grid-cols-3"
            role="group"
            aria-label="When a source object points at data elsewhere"
          >
            <button
              v-for="option in REFERENCE_HANDLING_OPTIONS"
              :key="option.value"
              type="button"
              :aria-pressed="referenceHandling === option.value"
              :class="optionClass(referenceHandling === option.value)"
              @click="referenceHandling = option.value"
            >
              <span class="block text-[13px] font-medium text-foreground">{{ option.label }}</span>
              <span class="mt-0.5 block text-[11px] text-muted-foreground">{{ option.description }}</span>
            </button>
          </div>
        </div>

        <label class="flex items-center justify-between gap-3 text-xs">
          <span>
            <span class="font-medium text-foreground">Replicate deletions</span>
            <span class="block text-[11px] text-muted-foreground">
              Deleting a source object also writes a delete marker at the target.
            </span>
          </span>
          <Switch :checked="replicateDeletes" @update:checked="(v: boolean) => (replicateDeletes = v)" />
        </label>

        <Notice v-if="sameEndpoint" tone="warning">
          Source and target are the same bucket and prefix; pick a different node, bucket or prefix.
        </Notice>
        <Notice v-if="sourceUnreachable" tone="warning">
          {{ sourceNodeLabel }} does not publish an API URL, so the sync cannot be created from here.
          Create it from that node's portal instead.
        </Notice>
        <Notice v-if="error" tone="error">{{ error }}</Notice>
      </div>

      <DialogFooter>
        <DialogClose as-child><Button variant="outline">Cancel</Button></DialogClose>
        <Button :disabled="!canSubmit" @click="submit">
          <Spinner v-if="busy" label="Creating the sync" class="text-current" />
          {{ busy ? 'Creating…' : mode === 'once' ? 'Sync now' : 'Create sync' }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
