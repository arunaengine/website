<script setup lang="ts">
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Select from '@/components/ui/Select.vue'
import Spinner from '@/components/ui/Spinner.vue'
import BucketSearchBox from '@/components/data/BucketSearchBox.vue'
import ObjectBrowserPanel from '@/components/data/ObjectBrowserPanel.vue'
import { stateVariant } from '@/lib/stateBadge'
import { OFFLINE_WRITE_HINT, useConnectivity } from '@/lib/connectivity'
import { ArrowLeftRight, X } from '@lucide/vue'
import { OTHER_MODE_OPTIONS, type OtherBuckets, type OtherMode } from './useOtherBuckets'

const props = defineProps<{ imports: OtherBuckets; bucket: string; prefix: string }>()
const emit = defineEmits<{ (e: 'created'): void }>()

const { writesDisabled } = useConnectivity()
const {
  realmNodes,
  sourceBucket,
  sourceNodeId,
  sourceSearch,
  otherDefaultMode,
  otherRows,
  otherBusy,
  otherPendingCount,
  pickSearchHit,
  addOtherSelection,
  removeOtherRow,
  otherTargetPrefix,
} = props.imports

async function createOtherRelationships() {
  if (await props.imports.createOtherRelationships()) emit('created')
}
</script>

<template>
  <p class="text-[11px] text-muted-foreground">
    Import objects from another bucket, local or on another realm node. "Copy (once)" duplicates the
    selection into <span class="font-mono">{{ bucket }}/{{ prefix }}</span> now; "Reference" exposes it
    there without copying the data.
  </p>

  <div>
    <label class="text-xs font-medium text-foreground">Source bucket</label>
    <div class="mt-1">
      <BucketSearchBox
        v-model="sourceSearch"
        mode="picker"
        :exclude-local-bucket="bucket"
        placeholder="Find a bucket on any node…"
        @select="pickSearchHit"
      />
    </div>
  </div>

  <template v-if="sourceBucket">
    <div class="flex flex-wrap items-center gap-2 text-xs">
      <span class="font-medium text-foreground">Browsing</span>
      <span class="font-mono">{{ sourceBucket }}</span>
      <Badge v-if="sourceNodeId" variant="outline" size="sm" :title="sourceNodeId">
        on {{ realmNodes.displayName(sourceNodeId) }}
      </Badge>
      <div class="ml-auto flex items-center gap-1.5">
        <label class="text-[11px] text-muted-foreground">Add as</label>
        <Select v-model="otherDefaultMode" :options="OTHER_MODE_OPTIONS" class="h-8 w-36 text-xs" />
      </div>
    </div>
    <ObjectBrowserPanel :bucket="sourceBucket" :node-id="sourceNodeId" selectable @add="addOtherSelection" />
  </template>

  <section v-if="otherRows.length" class="overflow-hidden rounded-md border border-border">
    <header class="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/20 px-3 py-2">
      <div class="flex items-center gap-2">
        <ArrowLeftRight class="h-4 w-4 text-primary" />
        <h3 class="text-sm font-semibold text-foreground">Imports</h3>
        <Badge variant="outline">{{ otherRows.length }}</Badge>
      </div>
      <Button
        size="sm"
        :disabled="!otherPendingCount || otherBusy || writesDisabled"
        :title="writesDisabled ? OFFLINE_WRITE_HINT : undefined"
        @click="createOtherRelationships"
      >
        <Spinner v-if="otherBusy" label="Importing" class="text-current" />
        Import {{ otherPendingCount || '' }}
      </Button>
    </header>
    <ul class="divide-y divide-border">
      <li v-for="row in otherRows" :key="row.id" class="space-y-1 px-3 py-2">
        <div class="flex items-center gap-2 text-xs">
          <Badge v-if="row.isPrefix" variant="outline" size="sm" class="shrink-0 uppercase">folder</Badge>
          <span class="min-w-0 truncate font-mono" :title="`${row.bucket}/${row.sourcePrefix}`">
            {{ row.bucket }}/{{ row.sourcePrefix }}
          </span>
          <Badge v-if="row.nodeId" variant="outline" size="sm" class="shrink-0" :title="row.nodeId">
            on {{ realmNodes.displayName(row.nodeId) }}
          </Badge>
          <div class="ml-auto flex shrink-0 items-center gap-1.5">
            <Select
              v-if="row.state === 'ready' || row.state === 'error'"
              :model-value="row.mode"
              :options="OTHER_MODE_OPTIONS"
              class="h-7 w-32 text-xs"
              :aria-label="`Import mode for ${row.sourcePrefix}`"
              @update:model-value="(v: string) => (row.mode = v as OtherMode)"
            />
            <Badge v-else variant="outline" size="sm">{{ row.mode === 'once' ? 'Copy (once)' : 'Reference' }}</Badge>
            <Spinner v-if="row.state === 'creating'" label="Creating the import" class="text-primary" />
            <Badge v-else-if="row.state === 'done'" :variant="stateVariant('done')" size="sm" class="uppercase">done</Badge>
            <Badge v-else-if="row.state === 'error'" :variant="stateVariant('failed')" size="sm" class="uppercase">failed</Badge>
            <Button
              v-if="row.state !== 'creating'"
              variant="ghost"
              size="icon-sm"
              aria-label="Remove import"
              @click="removeOtherRow(row.id)"
            >
              <X class="size-3.5" />
            </Button>
          </div>
        </div>
        <p class="truncate text-[10px] text-muted-foreground" :title="`${bucket}/${otherTargetPrefix(row)}`">
          into {{ bucket }}/{{ otherTargetPrefix(row) }}
        </p>
        <p v-if="row.error" class="text-[10px] text-destructive">{{ row.error }}</p>
      </li>
    </ul>
    <p class="border-t border-border px-3 py-1.5 text-[10px] text-muted-foreground">
      Each import becomes a sync relationship; created ones appear under the bucket's sync status.
    </p>
  </section>
</template>
