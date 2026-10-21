<script setup lang="ts">
// Everything that copies data into or out of this bucket: syncs and staging jobs,
// each listed by its own source, with one Add menu. Linked storage lives in the group.
import { computed, ref, watch } from 'vue'
import AddDataDialog from '@/components/data/AddDataDialog.vue'
import SyncBucketDialog from '@/components/data/SyncBucketDialog.vue'
import StagingJobRows from '@/components/storage/StagingJobRows.vue'
import SyncsTab from '@/components/storage/SyncsTab.vue'
import Button from '@/components/ui/Button.vue'
import DropdownMenu from '@/components/ui/DropdownMenu.vue'
import DropdownMenuContent from '@/components/ui/DropdownMenuContent.vue'
import DropdownMenuItem from '@/components/ui/DropdownMenuItem.vue'
import DropdownMenuTrigger from '@/components/ui/DropdownMenuTrigger.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Notice from '@/components/ui/Notice.vue'
import OptionToggle from '@/components/ui/OptionToggle.vue'
import RefreshButton from '@/components/ui/RefreshButton.vue'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { usePortalFeatures } from '@/composables/usePortalFeatures'
import { featureEnabled } from '@/lib/config'
import { ArrowLeftRight, ChevronDown, CloudDownload, Plus } from '@lucide/vue'

const props = defineProps<{ bucket: string; nodeId: string | null; groupId: string | null }>()

const realmNodes = useRealmNodes()
const stagingEnabled = featureEnabled('stagingJobs')
const { shown } = usePortalFeatures()

const kind = ref('all')
const KINDS = [
  { value: 'all', label: 'All' },
  { value: 'syncs', label: 'Syncs' },
  { value: 'staging', label: 'Staging' },
]
// Syncs of a bucket on another node are the only kind this node can show; with one kind there is nothing to filter.
const filterable = computed(() => !props.nodeId && stagingEnabled)
const shows = (value: string) => kind.value === 'all' || kind.value === value

// Remounting the lists reloads them all at once.
const reloadKey = ref(0)
const counts = ref<Record<string, number | null>>({})
const allEmpty = computed(() => {
  const known = ['syncs', ...(props.nodeId || !stagingEnabled ? [] : ['staging'])]
  return known.every((key) => counts.value[key] === 0)
})

// Another bucket or scope starts with every count unknown again.
watch(
  () => [props.bucket, props.nodeId, props.groupId],
  () => (counts.value = {}),
)

function setCount(key: string, count: number | null) {
  counts.value = { ...counts.value, [key]: count }
}

function reload() {
  counts.value = {}
  reloadKey.value += 1
}

const syncOpen = ref(false)
const stagingOpen = ref(false)
</script>

<template>
  <div class="space-y-3">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="text-xs text-muted-foreground">
        Data copied into or out of this bucket. Only syncs you created are listed.
      </p>
      <div class="flex flex-wrap items-center gap-2">
        <OptionToggle
          v-if="filterable"
          v-model="kind"
          :options="KINDS"
          class="p-0 [&>button]:h-7"
          aria-label="Which transfers to show"
        />
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button variant="outline" size="sm">
              <Plus class="size-3.5" /> Add <ChevronDown class="size-3.5 opacity-70" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" class="w-72">
            <DropdownMenuItem class="items-start" @click="syncOpen = true">
              <ArrowLeftRight class="mt-0.5 h-3.5 w-3.5" />
              <span>
                <span class="block">Sync with another node</span>
                <span class="block text-xs text-muted-foreground">Copy files to or from another node.</span>
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem
              v-if="!nodeId && stagingEnabled && shown('connectors')"
              class="items-start"
              @click="stagingOpen = true"
            >
              <CloudDownload class="mt-0.5 h-3.5 w-3.5" />
              <span>
                <span class="block">Stage from a connector</span>
                <span class="block text-xs text-muted-foreground">Copy data in from outside storage.</span>
              </span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <RefreshButton :busy="false" sr-label="Reload the transfers" @click="reload" />
      </div>
    </div>

    <Notice v-if="nodeId" tone="info">
      This bucket is hosted on {{ realmNodes.displayName(nodeId) }}, so this node can only show
      the syncs you created for it.
    </Notice>

    <EmptyState
      v-if="kind === 'all' && allEmpty"
      title="Nothing is copied into or out of this bucket."
      description="Use Add to sync it with another node or stage data."
    />

    <SyncsTab
      v-if="shows('syncs')"
      :key="`syncs-${reloadKey}`"
      :bucket="bucket"
      :node-id="nodeId"
      embedded
      :quiet="kind === 'all'"
      @new-sync="syncOpen = true"
      @count="(count: number | null) => setCount('syncs', count)"
    />
    <StagingJobRows
      v-if="!nodeId && stagingEnabled && shows('staging')"
      :key="`staging-${reloadKey}`"
      :bucket="bucket"
      :quiet="kind === 'all'"
      @count="(count: number | null) => setCount('staging', count)"
    />

    <SyncBucketDialog
      v-model:open="syncOpen"
      :source-bucket="bucket"
      source-prefix=""
      :source-node-id="nodeId"
      @created="reload"
    />
    <AddDataDialog
      v-if="!nodeId && stagingEnabled"
      v-model:open="stagingOpen"
      :bucket="bucket"
      prefix=""
      :group-id="groupId"
      tab="connector"
      @staged="reload"
    />
  </div>
</template>
