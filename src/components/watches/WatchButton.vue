<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import Button from '@/components/ui/Button.vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogClose from '@/components/ui/DialogClose.vue'
import DialogTrigger from '@/components/ui/DialogTrigger.vue'
import Notice from '@/components/ui/Notice.vue'
import NodeLabel from '@/components/ui/NodeLabel.vue'
import Tooltip from '@/components/ui/Tooltip.vue'
import { Eye, EyeOff } from '@lucide/vue'
import { useAruna } from '@/composables/useAruna'
import { useWatches } from '@/composables/useWatches'
import { ApiError } from '@/lib/api'
import {
  eventsFor,
  isSyncEventKind,
  parseWatchPath,
  watchEventLabel,
  WATCH_DELIVERY_NOTE,
  type WatchEventKind,
} from '@/lib/watches'
import { OFFLINE_WRITE_HINT, useConnectivity } from '@/lib/connectivity'
import { errorMessage, truncateMiddle } from '@/lib/utils'

// "Watch this" affordance for one canonical prefix. The surface decides the
// namespace and therefore the offered events: a bucket folder watches uploads
// and syncs out of it, a dataset path watches datasets created under it.
const props = defineProps<{
  surface: 'bucket' | 'dataset'
  pathPrefix: string
  resourceLabel: string
  // Owning group of the browsed folder or of the dataset; without it no prefix
  // can be built and the button says why instead of disappearing.
  groupId?: string | null
  size?: 'sm' | 'default'
}>()

const NO_SYNC_REASON = 'This folder is not the source of a sync'

const { available, creating, deletingIds, ensureLoaded, createWatch, deleteWatch, findWatch } =
  useWatches()
const { myGroups, discoverableGroups, listSyncRelationships } = useAruna()
const { writesDisabled } = useConnectivity()

const isData = computed(() => props.surface === 'bucket')
const primaryKind = computed<WatchEventKind>(() =>
  isData.value ? 'data_uploaded' : 'metadata_created',
)
const offered = computed(() => eventsFor(isData.value ? 's3' : 'meta'))
const parsed = computed(() => parseWatchPath(props.pathPrefix))

const open = ref(false)
const dialogError = ref<string | null>(null)
const selected = ref<WatchEventKind[]>([primaryKind.value])
const syncSource = ref(false)
const checkingSync = ref(false)

const existing = computed(() => findWatch(props.pathPrefix))
const watching = computed(() => Boolean(existing.value))
const busy = computed(
  () => creating.value || Boolean(existing.value && deletingIds.value.includes(existing.value.id)),
)

// Missing pieces are named rather than hidden: the folder needs a group and a
// resolvable endpoint node, the dataset a group and a catalog path.
const unavailableReason = computed(() => {
  if (props.pathPrefix) return null
  if (!props.groupId) {
    return isData.value
      ? 'Pick a group to watch this folder'
      : 'The group owning this dataset is not known yet'
  }
  return isData.value
    ? 'Uploads to this node cannot be watched from here'
    : 'This dataset has no catalog path to watch yet'
})

const groupName = computed(() => {
  const groupId = parsed.value?.groupId ?? props.groupId ?? ''
  if (!groupId) return 'this group'
  const known = [...myGroups.value, ...discoverableGroups.value].find((g) => g.id === groupId)
  return known?.name ?? truncateMiddle(groupId)
})

const scopeLabel = computed(() => {
  if (isData.value) return `${parsed.value?.bucket ?? ''}/${parsed.value?.prefix ?? ''}`
  return parsed.value?.prefix ?? ''
})

const title = computed(() => {
  if (isData.value) return watching.value ? 'Watching this folder' : 'Watch this folder'
  return watching.value ? 'Watching this path' : 'Watch this path'
})

const description = computed(() =>
  isData.value
    ? 'Get notified about new uploads under this folder, your own included. Delivery can lag a few seconds.'
    : 'Get notified when a new dataset is created under this path. It does not notify you about edits to this dataset.',
)

function reasonFor(kind: WatchEventKind): string | null {
  if (!isSyncEventKind(kind)) return null
  if (checkingSync.value) return 'Checking the syncs of this folder…'
  return syncSource.value ? null : NO_SYNC_REASON
}

onMounted(() => void ensureLoaded())

// Sync events fire under the source prefix only, so the two kinds stay
// disabled until this folder is known to be the source of a relationship.
async function checkSyncSource() {
  const bucket = parsed.value?.bucket
  if (!isData.value || !bucket) return
  checkingSync.value = true
  try {
    const relationships = await listSyncRelationships({ bucket, direction: 'out' })
    syncSource.value = relationships.outgoing.length > 0
  } catch {
    syncSource.value = false
  } finally {
    checkingSync.value = false
  }
}

function onOpenChange(value: boolean) {
  open.value = value
  if (!value) return
  dialogError.value = null
  selected.value = [primaryKind.value]
  if (isData.value && !watching.value) void checkSyncSource()
}

async function onCreate() {
  if (!selected.value.length) return
  dialogError.value = null
  try {
    await createWatch(props.pathPrefix, selected.value)
    open.value = false
  } catch (err) {
    dialogError.value =
      err instanceof ApiError && err.status === 403
        ? 'You need read access to watch this'
        : errorMessage(err)
  }
}

async function onDelete() {
  const id = existing.value?.id
  if (!id) return
  dialogError.value = null
  try {
    await deleteWatch(id)
    open.value = false
  } catch (err) {
    dialogError.value = errorMessage(err)
  }
}
</script>

<template>
  <Tooltip v-if="available && unavailableReason" :label="unavailableReason">
    <span class="inline-flex">
      <Button variant="outline" :size="size ?? 'default'" disabled :title="unavailableReason">
        <Eye class="h-4 w-4" /> Watch
      </Button>
    </span>
  </Tooltip>

  <Dialog v-else-if="available" :open="open" @update:open="onOpenChange">
    <DialogTrigger as-child>
      <Button
        variant="outline"
        :size="size ?? 'default'"
        :aria-pressed="watching"
        :title="watching ? `You are watching this ${isData ? 'folder' : 'path'}` : title"
      >
        <component :is="watching ? EyeOff : Eye" class="h-4 w-4" :class="watching ? 'text-primary' : ''" />
        {{ watching ? 'Watching' : 'Watch' }}
      </Button>
    </DialogTrigger>
    <DialogContent class="max-w-md">
      <DialogHeader>
        <DialogTitle>{{ title }}</DialogTitle>
        <DialogDescription>{{ description }}</DialogDescription>
      </DialogHeader>

      <div class="space-y-3">
        <!-- Human identity first; the canonical path is a technical detail. -->
        <div class="surface-muted px-3 py-2.5">
          <div class="text-[11px] uppercase tracking-wider text-muted-foreground">
            {{ isData ? 'Watched folder' : 'Watched path' }}
          </div>
          <div class="mt-1 truncate text-sm font-medium text-foreground" :title="resourceLabel">{{ resourceLabel }}</div>
          <p class="mt-1 flex flex-wrap items-center gap-1 text-[11px] leading-relaxed text-muted-foreground">
            <template v-if="isData">
              <span>New uploads to {{ scopeLabel }} on</span>
              <NodeLabel v-if="parsed?.nodeId" :node-id="parsed.nodeId" size="sm" />
              <span v-else>this node</span>
            </template>
            <span v-else-if="scopeLabel">New datasets under {{ groupName }} / {{ scopeLabel }}</span>
            <span v-else>New datasets anywhere in {{ groupName }}</span>
          </p>
          <details class="mt-1.5">
            <summary class="cursor-pointer select-none text-[11px] text-muted-foreground/80 hover:text-foreground">Technical path</summary>
            <code class="mt-1 block break-all font-mono text-[11px] text-muted-foreground">{{ pathPrefix }}</code>
          </details>
        </div>

        <fieldset v-if="!watching">
          <legend class="text-xs font-medium text-foreground">Events</legend>
          <div class="mt-2 space-y-2">
            <label
              v-for="info in offered"
              :key="info.kind"
              class="flex items-start gap-2 text-sm"
              :class="reasonFor(info.kind) ? 'opacity-60' : ''"
            >
              <input
                v-model="selected"
                type="checkbox"
                :value="info.kind"
                :disabled="Boolean(reasonFor(info.kind))"
                class="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-border accent-primary"
              />
              <span>
                <span class="font-medium text-foreground">{{ info.label }}</span>
                <span class="block text-xs text-muted-foreground">{{ info.description }}</span>
                <span v-if="reasonFor(info.kind)" class="block text-xs text-muted-foreground">{{ reasonFor(info.kind) }}</span>
              </span>
            </label>
          </div>
        </fieldset>

        <p v-else class="text-sm text-muted-foreground">
          Watching <span class="font-medium text-foreground">{{ resourceLabel }}</span> for
          {{ (existing?.events ?? []).map(watchEventLabel).join(', ').toLowerCase() }}.
        </p>

        <Notice v-if="dialogError" tone="error">{{ dialogError }}</Notice>
        <Notice tone="info">{{ WATCH_DELIVERY_NOTE }}</Notice>
      </div>

      <DialogFooter>
        <DialogClose as-child><Button variant="outline">Cancel</Button></DialogClose>
        <Button
          v-if="watching"
          variant="destructive"
          :disabled="busy || writesDisabled"
          :title="writesDisabled ? OFFLINE_WRITE_HINT : undefined"
          @click="onDelete"
        >
          {{ busy ? 'Removing…' : 'Stop watching' }}
        </Button>
        <Button
          v-else
          :disabled="busy || !selected.length || writesDisabled"
          :title="writesDisabled ? OFFLINE_WRITE_HINT : undefined"
          @click="onCreate"
        >
          {{ busy ? 'Creating…' : 'Watch' }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
