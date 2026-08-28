<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Progress from '@/components/ui/Progress.vue'
import { folderName, type DeviceTransfer } from '@/lib/deviceApi'
import { itemChip, type SyncItem } from '@/lib/syncStates'
import { formatBytes } from '@/lib/utils'
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  FileText,
  FolderSync,
  Pause,
  Play,
  RefreshCw,
} from '@lucide/vue'

const props = withDefaults(defineProps<{ item: SyncItem; busy?: boolean }>(), { busy: false })
const emit = defineEmits<{ (event: 'sync'): void; (event: 'pause'): void }>()

const folder = computed(() => (props.item.kind === 'folder' ? props.item.folder : null))
const document = computed(() => (props.item.kind === 'document' ? props.item.document : null))
const chip = computed(() => itemChip(props.item))

const transfers = computed(() => {
  if (props.item.kind !== 'folder') return []
  return [...(props.item.transfers ?? [])].sort((left, right) => {
    const leftRank = left.state === 'failed' ? 0 : 1
    const rightRank = right.state === 'failed' ? 0 : 1
    return leftRank - rightRank || left.path.localeCompare(right.path)
  })
})

const shownTransfers = computed(() => transfers.value.slice(0, 3))

function documentName(path: string, id: string): string {
  return path.split('/').filter(Boolean).at(-1) ?? id
}

function nodeShortId(nodeId: string): string {
  return nodeId.length > 12 ? nodeId.slice(0, 8) : nodeId
}

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
  <li class="px-5 py-3.5">
    <div class="flex flex-wrap items-start gap-3">
      <FolderSync v-if="folder" class="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <FileText v-else class="mt-0.5 h-4 w-4 shrink-0 text-primary" />

      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-2">
          <RouterLink
            v-if="folder"
            :to="{ name: 'folder', params: { folderId: folder.folder_id } }"
            class="min-w-0 truncate font-display text-sm font-semibold text-foreground hover:text-primary hover:underline"
          >{{ folderName(folder.root) }}</RouterLink>
          <RouterLink
            v-else-if="document"
            :to="{ name: 'dataset', params: { id: document.documentId } }"
            class="min-w-0 truncate font-display text-sm font-semibold text-foreground hover:text-primary hover:underline"
          >{{ documentName(document.path, document.documentId) }}</RouterLink>
          <Badge :variant="chip.variant" class="text-[10px]">{{ chip.label }}</Badge>
        </div>

        <p v-if="folder" class="mt-1 truncate font-mono text-[11px] text-muted-foreground" :title="folder.root">
          {{ folder.root }} -&gt; {{ nodeShortId(folder.remote.node_id) }} ·
          {{ remotePath(folder.remote.bucket, folder.remote.prefix) }}
        </p>
        <p v-else-if="document" class="mt-1 truncate font-mono text-[11px] text-muted-foreground">
          {{ document.path || document.documentId }}
        </p>
        <p
          v-if="chip.detail"
          :class="[
            'mt-1 text-[11px] leading-relaxed',
            chip.variant === 'destructive'
              ? 'text-destructive'
              : chip.variant === 'warn'
                ? 'text-amber-700 dark:text-amber-300'
                : 'text-muted-foreground',
          ]"
        >
          {{ chip.detail }}
        </p>
      </div>

      <div class="flex shrink-0 items-center gap-1.5">
        <template v-if="folder">
          <Button
            variant="ghost"
            size="sm"
            :disabled="busy || folder.state === 'paused'"
            @click="emit('sync')"
          >
            <RefreshCw class="h-3.5 w-3.5" /> Sync now
          </Button>
          <Button variant="ghost" size="sm" :disabled="busy" @click="emit('pause')">
            <Play v-if="folder.state === 'paused'" class="h-3.5 w-3.5" />
            <Pause v-else class="h-3.5 w-3.5" />
            {{ folder.state === 'paused' ? 'Resume' : 'Pause' }}
          </Button>
          <RouterLink :to="{ name: 'folder', params: { folderId: folder.folder_id } }">
            <Button variant="outline" size="sm">Open</Button>
          </RouterLink>
        </template>
        <RouterLink v-else-if="document" :to="{ name: 'dataset', params: { id: document.documentId } }">
          <Button variant="outline" size="sm">Open</Button>
        </RouterLink>
      </div>
    </div>

    <div v-if="shownTransfers.length" class="mt-3 space-y-2 border-t border-border/70 pt-2.5">
      <div v-for="transfer in shownTransfers" :key="transfer.id" class="flex items-center gap-2 text-[11px]">
        <ArrowUpFromLine v-if="transfer.direction === 'upload'" class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <ArrowDownToLine v-else class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <span class="min-w-0 flex-1 truncate font-mono text-foreground">{{ transfer.path }}</span>
            <span :class="transfer.state === 'failed' ? 'text-destructive' : 'text-muted-foreground'">
              {{ transfer.state }}
            </span>
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
