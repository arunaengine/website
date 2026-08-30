<script setup lang="ts">
import DetailDialog from '@/components/ui/DetailDialog.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogClose from '@/components/ui/DialogClose.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Select from '@/components/ui/Select.vue'
import Badge from '@/components/ui/Badge.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Notice from '@/components/ui/Notice.vue'
import Spinner from '@/components/ui/Spinner.vue'
import Progress from '@/components/ui/Progress.vue'
import { useAruna } from '@/composables/useAruna'
import { useBuilderBasket, type BuilderRow } from '@/composables/useBuilderBasket'
import { assessQuota, quotaCountedBytes, type QuotaAssessment } from '@/lib/quota'
import { formatBytes } from '@/lib/utils'
import { stateVariant, toneVariant } from '@/lib/stateBadge'
import type { UsageResponse } from '@/lib/api'
import { OFFLINE_WRITE_HINT, useConnectivity } from '@/lib/connectivity'
import { ref } from 'vue'
import { AlertTriangle, CloudDownload, FolderInput, Upload, X } from '@lucide/vue'
import { STRATEGY_OPTIONS } from './useConnectorSource'

const props = defineProps<{
  open: boolean
  bucket: string
  prefix: string
  groupId: string | null
  basket: ReturnType<typeof useBuilderBasket>
  existingKeys: ReadonlySet<string>
}>()
const emit = defineEmits<{
  (e: 'update:open', v: boolean): void
  (e: 'staged'): void
}>()

const { getGroupUsage } = useAruna()
const { writesDisabled } = useConnectivity()
const basket = props.basket

// A ready/blocked row whose target key is already listed would overwrite it.
function rowOverwrites(row: BuilderRow): boolean {
  if (row.state !== 'ready' && row.state !== 'blocked') return false
  return props.existingKeys.has(row.targetKey.trim())
}

// ── Quota precheck (advisory, never blocks) ─────────────────────────────────
let cachedUsage: { groupId: string; at: number; usage: UsageResponse } | null = null
async function groupUsageFresh(groupId: string): Promise<UsageResponse | null> {
  if (cachedUsage && cachedUsage.groupId === groupId && Date.now() - cachedUsage.at < 30_000) {
    return cachedUsage.usage
  }
  try {
    const usage = await getGroupUsage(groupId)
    cachedUsage = { groupId, at: Date.now(), usage }
    return usage
  } catch {
    return null
  }
}

const precheck = ref<{ totalBytes: number; projected: QuotaAssessment; current: QuotaAssessment } | null>(null)

async function submitAll() {
  if (!basket.canSubmit.value) return
  const uploadBytes = basket.rows.value
    .filter((row) => row.state === 'ready' && row.sourceKind === 'upload')
    .reduce((sum, row) => sum + (row.size ?? 0), 0)
  if (uploadBytes > 0 && props.groupId) {
    const usage = await groupUsageFresh(props.groupId)
    const quota = usage?.quota
    if (usage && quota && quota.quota_bytes != null) {
      const used = quotaCountedBytes(usage)
      const projected = assessQuota(quota, used + uploadBytes)
      if (projected.state === 'over-quota' || projected.state === 'over-ceiling') {
        precheck.value = { totalBytes: uploadBytes, projected, current: assessQuota(quota, used) }
        return
      }
    }
  }
  await runSubmit()
}

async function confirmPrecheckSubmit() {
  precheck.value = null
  await runSubmit()
}

async function runSubmit() {
  await basket.submit()
  emit('staged')
}

// ── Basket table ────────────────────────────────────────────────────────────
const kindLabel: Record<BuilderRow['sourceKind'], string> = {
  internal: 'Internal',
  connector: 'Connector',
  upload: 'Upload',
}
function rowVariant(state: BuilderRow['state']) {
  if (state === 'blocked') return toneVariant('attention')
  if (state === 'submitting') return toneVariant('progress')
  return stateVariant(state)
}
function rowEditable(row: BuilderRow): boolean {
  return row.state === 'ready' || row.state === 'blocked'
}
</script>

<template>
  <DetailDialog :open="props.open" @update:open="(v: boolean) => emit('update:open', v)">
    <template #header>
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <Upload class="h-4 w-4 text-primary" /> Add data
        </DialogTitle>
        <DialogDescription>
          Collect local files, connector sources and objects from other buckets, then add them to
          <span class="font-mono text-xs">{{ bucket }}/{{ prefix }}</span>.
        </DialogDescription>
      </DialogHeader>
    </template>

    <div class="space-y-4">
      <slot />

      <!-- Basket -->
      <section class="overflow-hidden rounded-md border border-border">
        <header class="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/20 px-3 py-2">
          <div class="flex items-center gap-2">
            <FolderInput class="h-4 w-4 text-primary" />
            <h3 class="text-sm font-semibold text-foreground">Basket</h3>
            <Badge variant="outline">{{ basket.summary.value.total }}</Badge>
          </div>
          <div class="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span v-if="basket.summary.value.ready">{{ basket.summary.value.ready }} ready</span>
            <span v-if="basket.summary.value.blocked" class="text-amber-700 dark:text-amber-400">{{ basket.summary.value.blocked }} blocked</span>
            <span v-if="basket.summary.value.submitting" class="text-primary">{{ basket.summary.value.submitting }} running</span>
            <span v-if="basket.summary.value.done" class="text-emerald-700 dark:text-emerald-400">{{ basket.summary.value.done }} done</span>
            <span v-if="basket.summary.value.error" class="text-destructive">{{ basket.summary.value.error }} failed</span>
            <Button v-if="basket.summary.value.done" variant="ghost" size="sm" @click="basket.clearDone">Clear done</Button>
          </div>
        </header>
        <EmptyState
          v-if="!basket.rows.value.length"
          compact
          title="The basket is empty."
          description="Add files or connector sources from the tabs above."
        />
        <table v-else class="w-full text-sm">
          <thead class="bg-muted/50 text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th class="px-3 py-1.5 text-left font-semibold">Source</th>
              <th class="px-3 py-1.5 text-left font-semibold">Target key</th>
              <th class="px-3 py-1.5 text-left font-semibold">State</th>
              <th class="px-3 py-1.5"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in basket.rows.value" :key="row.id" class="border-t border-border align-top">
              <td class="px-3 py-2">
                <div class="flex items-center gap-2">
                  <Badge variant="secondary" size="sm" class="uppercase">{{ kindLabel[row.sourceKind] }}</Badge>
                  <Badge v-if="row.isPrefix" variant="outline" size="sm" class="uppercase">folder</Badge>
                  <span class="min-w-0 truncate font-mono text-xs" :title="row.source">{{ row.source }}</span>
                </div>
                <Select
                  v-if="row.strategy && rowEditable(row)"
                  :model-value="row.strategy"
                  :options="STRATEGY_OPTIONS"
                  class="mt-1 h-7 w-56 text-[10px]"
                  :aria-label="`Staging strategy for ${row.source}`"
                  @update:model-value="(value: string) => (row.strategy = value as 'snapshot' | 'reference')"
                />
                <span v-else-if="row.strategy" class="text-[10px] text-muted-foreground">{{ row.strategy }}</span>
                <span v-else-if="row.size !== null" class="text-[10px] text-muted-foreground">{{ formatBytes(row.size) }}</span>
              </td>
              <td class="px-3 py-2">
                <Input
                  :model-value="row.targetKey"
                  :disabled="!rowEditable(row)"
                  class="h-8 font-mono text-xs"
                  @update:model-value="(v: string | number) => basket.editKey(row.id, String(v))"
                />
                <p v-if="rowOverwrites(row)" class="mt-1 flex items-center gap-1 text-[10px] text-amber-700 dark:text-amber-400">
                  <AlertTriangle class="h-3 w-3 shrink-0" /> Overwrites existing object
                </p>
              </td>
              <td class="px-3 py-2">
                <div class="flex items-center gap-2">
                  <Spinner v-if="row.state === 'submitting'" label="Adding" class="text-primary" />
                  <Badge :variant="rowVariant(row.state)" size="sm" class="uppercase">{{ row.state === 'submitting' ? 'adding' : row.state }}</Badge>
                  <Progress
                    v-if="row.state === 'submitting'"
                    :value="row.progress"
                    :indeterminate="row.sourceKind !== 'upload' && row.progressTotal == null"
                    :warn="101"
                    :critical="101"
                    class="h-1.5 w-16"
                  />
                </div>
                <p v-if="row.state === 'submitting' && row.phase" class="mt-1 text-[10px] text-muted-foreground">
                  {{ row.phase }}
                  <template v-if="row.progressTotal != null">
                    · {{ row.progressUnit === 'bytes' ? formatBytes(row.progressCurrent ?? 0) : row.progressCurrent }}
                    / {{ row.progressUnit === 'bytes' ? formatBytes(row.progressTotal) : row.progressTotal }}
                  </template>
                  <span v-if="row.currentPath" class="block truncate font-mono" :title="row.currentPath">{{ row.currentPath }}</span>
                </p>
                <p v-if="row.blockedReason && row.state === 'blocked'" class="mt-1 text-[10px] text-amber-700 dark:text-amber-400">{{ row.blockedReason }}</p>
                <p v-if="row.error" class="mt-1 text-[10px] text-destructive">{{ row.error }}</p>
              </td>
              <td class="px-3 py-2">
                <div class="flex items-center justify-end gap-1">
                  <Button
                    v-if="row.state === 'error' || row.state === 'blocked'"
                    variant="ghost"
                    size="sm"
                    class="h-6 px-2"
                    @click="basket.retryRow(row.id)"
                  >Retry</Button>
                  <Button variant="ghost" size="icon-sm" aria-label="Remove" @click="basket.removeRow(row.id)"><X class="size-3.5" /></Button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <!-- Advisory quota precheck (same rules as the old toolbar upload). -->
      <Notice v-if="precheck" tone="warning">
        <p
          v-if="precheck.projected.state === 'over-ceiling'"
          class="text-destructive"
        >
          These uploads add <strong>{{ formatBytes(precheck.totalBytes) }}</strong> to a group already using
          <strong>{{ formatBytes(precheck.current.usedBytes) }}</strong>, past the hard cap of
          <strong>{{ formatBytes(precheck.projected.ceilingBytes ?? 0) }}</strong>; the node rejects writes above it with <code>QuotaExceeded</code>.
        </p>
        <p v-else>
          These uploads add <strong>{{ formatBytes(precheck.totalBytes) }}</strong> to a group already using
          <strong>{{ formatBytes(precheck.current.usedBytes) }}</strong>, past the quota of
          <strong>{{ formatBytes(precheck.projected.quotaBytes ?? 0) }}</strong> into the grace headroom.
        </p>
        <p class="mt-1 text-muted-foreground">Counters on remote nodes can lag, so these numbers are approximate. The check is advisory; you can still continue.</p>
        <div class="mt-2 flex items-center gap-2">
          <Button size="sm" @click="confirmPrecheckSubmit">Add anyway</Button>
          <Button variant="ghost" size="sm" @click="precheck = null">Cancel</Button>
        </div>
      </Notice>
    </div>

    <template #footer>
      <DialogFooter class="sm:justify-between">
        <DialogClose as-child><Button variant="outline">Close</Button></DialogClose>
        <Button
          :disabled="!basket.canSubmit.value || writesDisabled"
          :title="writesDisabled ? OFFLINE_WRITE_HINT : undefined"
          @click="submitAll"
        >
          <Spinner v-if="basket.busy.value" label="Adding" class="text-current" /><CloudDownload v-else class="h-4 w-4" />
          Add {{ basket.summary.value.ready || '' }}
        </Button>
      </DialogFooter>
    </template>

    <slot name="dialogs" />
  </DetailDialog>
</template>
