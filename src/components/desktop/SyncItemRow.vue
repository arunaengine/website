<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, type RouteLocationRaw } from 'vue-router'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Notice from '@/components/ui/Notice.vue'
import Progress from '@/components/ui/Progress.vue'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { folderName, type DeviceTransfer, type TransferState } from '@/lib/deviceApi'
import { stateVariant } from '@/lib/stateBadge'
import { itemChip, type SyncItem } from '@/lib/syncStates'
import { formatBytes } from '@/lib/utils'
import { ArrowDownToLine, ArrowUpFromLine, FileText, FolderSync, Pause, Play } from '@lucide/vue'

const props = withDefaults(defineProps<{ item: SyncItem; busy?: boolean; compact?: boolean }>(), {
  busy: false,
  compact: false,
})
const emit = defineEmits<{ (event: 'sync'): void; (event: 'pause'): void }>()

const { displayName } = useRealmNodes()

const folder = computed(() => (props.item.kind === 'folder' ? props.item.folder : null))
const document = computed(() => (props.item.kind === 'document' ? props.item.document : null))
const chip = computed(() => itemChip(props.item))

const to = computed<RouteLocationRaw>(() =>
  props.item.kind === 'folder'
    ? { name: 'folder', params: { folderId: props.item.folder.folder_id } }
    : { name: 'dataset', params: { id: props.item.document.documentId } },
)

const title = computed(() => {
  const current = folder.value
  if (current) return folderName(current.root)
  const target = document.value
  if (!target) return ''
  return target.path.split('/').filter(Boolean).at(-1) ?? target.documentId
})

const subtitle = computed(() => {
  const target = document.value
  return target ? target.path || target.documentId : ''
})

// A refusal or a decision reads as a notice; everything else is a quiet line.
const noticeTone = computed<'error' | 'warning' | null>(() =>
  chip.value.variant === 'destructive' ? 'error' : chip.value.variant === 'warn' ? 'warning' : null,
)

const TRANSFER_LABEL: Record<TransferState, string> = {
  queued: 'Queued',
  running: 'Running',
  retrying: 'Retrying',
  failed: 'Failed',
  done: 'Done',
}

const transfers = computed(() => {
  if (props.item.kind !== 'folder') return []
  return [...(props.item.transfers ?? [])].sort((left, right) => {
    const leftRank = left.state === 'failed' ? 0 : 1
    const rightRank = right.state === 'failed' ? 0 : 1
    return leftRank - rightRank || left.path.localeCompare(right.path)
  })
})

const shownTransfers = computed(() => (props.compact ? [] : transfers.value.slice(0, 3)))

function remotePath(bucket: string, prefix: string): string {
  return prefix ? `${bucket}/${prefix}` : bucket
}

function percent(transfer: DeviceTransfer): number {
  if (!transfer.bytes_total || transfer.bytes_done === null) return 0
  return Math.min(100, Math.round((transfer.bytes_done / transfer.bytes_total) * 100))
}

function moved(transfer: DeviceTransfer): string {
  if (transfer.bytes_total === null) return ''
  return `${formatBytes(transfer.bytes_done ?? 0)} of ${formatBytes(transfer.bytes_total)}`
}
</script>

<template>
  <li :class="compact ? 'py-2.5' : 'px-5 py-3.5'">
    <div class="flex flex-wrap items-start gap-3">
      <FolderSync v-if="folder" class="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <FileText v-else class="mt-0.5 h-4 w-4 shrink-0 text-primary" />

      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-2">
          <RouterLink
            :to="to"
            class="min-w-0 truncate font-display text-sm font-semibold text-foreground hover:text-primary hover:underline"
            >{{ title }}</RouterLink
          >
          <Badge :variant="chip.variant" size="sm">{{ chip.label }}</Badge>
        </div>

        <p v-if="folder" class="mt-1 truncate text-[11px] text-muted-foreground" :title="folder.root">
          <span class="hash">{{ folder.root }}</span>
          →
          {{ displayName(folder.remote.node_id) }}
          <span class="hash">{{ folder.remote.node_id }}</span>
          · {{ remotePath(folder.remote.bucket, folder.remote.prefix) }}
        </p>
        <p v-else-if="document" class="hash mt-1 truncate">{{ subtitle }}</p>

        <Notice v-if="chip.detail && noticeTone" :tone="noticeTone" class="mt-1">{{ chip.detail }}</Notice>
        <p v-else-if="chip.detail" class="mt-1 text-[11px] leading-relaxed text-muted-foreground">
          {{ chip.detail }}
        </p>
      </div>

      <div v-if="folder && !compact" class="flex shrink-0 items-center gap-1.5">
        <Button variant="ghost" size="sm" :disabled="busy || folder.state === 'paused'" @click="emit('sync')">
          <FolderSync class="h-3.5 w-3.5" /> Sync now
        </Button>
        <Button variant="ghost" size="sm" :disabled="busy" @click="emit('pause')">
          <Play v-if="folder.state === 'paused'" class="h-3.5 w-3.5" />
          <Pause v-else class="h-3.5 w-3.5" />
          {{ folder.state === 'paused' ? 'Resume' : 'Pause' }}
        </Button>
      </div>
    </div>

    <div v-if="shownTransfers.length" class="mt-3 space-y-2 border-t border-border/70 pt-2.5">
      <div v-for="transfer in shownTransfers" :key="transfer.id" class="flex items-center gap-2 text-[11px]">
        <ArrowUpFromLine v-if="transfer.direction === 'upload'" class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <ArrowDownToLine v-else class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <span class="hash min-w-0 flex-1 truncate text-foreground">{{ transfer.path }}</span>
            <Badge :variant="stateVariant(transfer.state)" size="sm">{{ TRANSFER_LABEL[transfer.state] }}</Badge>
            <span class="text-muted-foreground">{{ moved(transfer) }}</span>
          </div>
          <p v-if="transfer.message" class="truncate text-destructive">{{ transfer.message }}</p>
        </div>
        <Progress
          :value="percent(transfer)"
          :indeterminate="transfer.bytes_total === null && transfer.state === 'running'"
          :label="`${transfer.path}: ${percent(transfer)}%`"
          class="h-1.5 w-28 shrink-0"
        />
      </div>
      <p v-if="transfers.length > shownTransfers.length" class="text-[11px] text-muted-foreground">
        and {{ transfers.length - shownTransfers.length }} more
      </p>
    </div>
  </li>
</template>
