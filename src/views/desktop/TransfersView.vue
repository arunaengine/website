<script setup lang="ts">
// Bytes in motion on this machine: what the folder sync is moving for the node,
// and what this window is uploading through the browser. They are different
// machinery, so they stay two lists rather than one merged fiction.
import { computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Progress from '@/components/ui/Progress.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import PageHeader from '@/components/dashboard/PageHeader.vue'
import DeviceSurfaceState from '@/components/desktop/DeviceSurfaceState.vue'
import { useDeviceTransfers } from '@/composables/useDeviceTransfers'
import { useUploadQueue } from '@/composables/useUploadQueue'
import type { DeviceTransfer, TransferState } from '@/lib/deviceApi'
import { formatBytes, relativeTime } from '@/lib/utils'
import { ArrowDownToLine, ArrowUpFromLine, RefreshCw, Waves } from '@lucide/vue'

const { transfers, all, state, error, load } = useDeviceTransfers()
const { items, cancel, retry, clearFinished } = useUploadQueue()

const STATE_BADGE: Record<TransferState, 'secondary' | 'sky' | 'warn' | 'destructive' | 'success'> = {
  queued: 'secondary',
  running: 'sky',
  retrying: 'warn',
  failed: 'destructive',
  done: 'success',
}

const ordered = computed(() =>
  [...all.value].sort((a, b) => {
    const rank = (transfer: DeviceTransfer) => (transfer.state === 'failed' ? 0 : transfer.state === 'running' ? 1 : 2)
    return rank(a) - rank(b) || a.path.localeCompare(b.path)
  }),
)
const queueItems = computed(() => items.value)
const finishedCount = computed(
  () => queueItems.value.filter((item) => item.state === 'done' || item.state === 'canceled').length,
)

function percent(transfer: DeviceTransfer): number | null {
  if (!transfer.bytes_total || transfer.bytes_done === null) return null
  return Math.min(100, Math.round((transfer.bytes_done / transfer.bytes_total) * 100))
}

function moved(transfer: DeviceTransfer): string {
  if (transfer.bytes_total === null) return ''
  return `${formatBytes(transfer.bytes_done ?? 0)} of ${formatBytes(transfer.bytes_total)}`
}

onMounted(() => void load())
</script>

<template>
  <div>
    <PageHeader eyebrow="This computer" title="Transfers" description="What this computer is sending and receiving right now.">
      <template #actions>
        <Button variant="outline" size="sm" @click="load"><RefreshCw class="h-3.5 w-3.5" /> Refresh</Button>
      </template>
    </PageHeader>

    <div class="container space-y-6 py-5">
      <section class="space-y-3">
        <div class="flex items-baseline justify-between gap-3">
          <h2 class="font-display text-[15px] font-semibold text-foreground/85">Folder sync</h2>
          <span class="text-[11px] text-muted-foreground">{{ transfers.uploads.length }} up · {{ transfers.downloads.length }} down</span>
        </div>

        <DeviceSurfaceState :state="state" subject="its transfers" :error="error" @retry="load" />

        <div v-if="state === 'loading'" class="space-y-2">
          <Skeleton v-for="n in 2" :key="n" class="h-12" />
        </div>

        <EmptyState
          v-else-if="state === 'ready' && !ordered.length"
          title="Nothing in flight"
          description="Files move when a bound folder changes on either side."
        >
          <template #icon><Waves class="h-6 w-6" /></template>
        </EmptyState>

        <ul v-else-if="ordered.length" class="surface divide-y divide-border overflow-hidden">
          <li v-for="transfer in ordered" :key="transfer.id" class="flex items-center gap-3 px-4 py-2.5">
            <ArrowUpFromLine v-if="transfer.direction === 'upload'" class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <ArrowDownToLine v-else class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <span class="truncate font-mono text-[12px] text-foreground" :title="transfer.path">{{ transfer.path }}</span>
                <Badge :variant="STATE_BADGE[transfer.state]" class="text-[10px]">{{ transfer.state }}</Badge>
                <span v-if="transfer.attempts > 1" class="text-[10px] text-muted-foreground"
                  >attempt {{ transfer.attempts }}</span
                >
              </div>
              <p v-if="transfer.message" class="mt-0.5 text-[11px] text-destructive">{{ transfer.message }}</p>
              <p v-else-if="transfer.bucket" class="mt-0.5 font-mono text-[10px] text-muted-foreground">
                {{ transfer.bucket }}/{{ transfer.key }}
              </p>
            </div>
            <div class="w-40 shrink-0">
              <Progress
                v-if="percent(transfer) !== null"
                :value="percent(transfer)!"
                :label="`${transfer.path}: ${percent(transfer)}%`"
                class="h-1.5"
              />
              <span class="mt-1 block text-right text-[10px] text-muted-foreground">{{ moved(transfer) }}</span>
            </div>
            <span
              v-if="transfer.next_attempt_ms"
              class="hidden shrink-0 text-[10px] text-muted-foreground md:block"
              :title="'Next attempt'"
              >retry {{ relativeTime(new Date(transfer.next_attempt_ms).toISOString()) }}</span
            >
          </li>
        </ul>
      </section>

      <section class="space-y-3">
        <div class="flex items-baseline justify-between gap-3">
          <h2 class="font-display text-[15px] font-semibold text-foreground/85">Uploads from this window</h2>
          <Button v-if="finishedCount" variant="ghost" size="sm" @click="clearFinished">Clear finished</Button>
        </div>

        <EmptyState
          v-if="!queueItems.length"
          title="No uploads from this window"
          description="Files you drop into a bucket are uploaded here and their progress stays visible while the app is open."
        />

        <ul v-else class="surface divide-y divide-border overflow-hidden">
          <li v-for="item in queueItems" :key="item.id" class="flex items-center gap-3 px-4 py-2.5">
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <span class="truncate text-[12px] text-foreground" :title="item.key">{{ item.name }}</span>
                <Badge variant="outline" class="text-[10px]">{{ item.state }}</Badge>
              </div>
              <p class="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">{{ item.bucket }}/{{ item.key }}</p>
              <p v-if="item.error" class="mt-0.5 text-[11px] text-destructive">{{ item.error }}</p>
            </div>
            <div class="w-40 shrink-0">
              <Progress :value="item.progress" :label="`${item.name}: ${item.progress}%`" class="h-1.5" />
              <span class="mt-1 block text-right text-[10px] text-muted-foreground">{{ formatBytes(item.size) }}</span>
            </div>
            <Button
              v-if="item.state === 'queued' || item.state === 'uploading'"
              variant="ghost"
              size="sm"
              @click="cancel(item)"
              >Cancel</Button
            >
            <Button
              v-else-if="item.state === 'error' || item.state === 'canceled'"
              variant="ghost"
              size="sm"
              @click="retry(item)"
              >Retry</Button
            >
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>
