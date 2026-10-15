<script setup lang="ts">
// Everything that copies data into or out of this bucket: syncs, linked folders
// and staging jobs, each listed by its own source, with one Add menu.
import { computed, ref } from 'vue'
import AddDataDialog from '@/components/data/AddDataDialog.vue'
import SyncBucketDialog from '@/components/data/SyncBucketDialog.vue'
import LinkedFolderRows from '@/components/storage/LinkedFolderRows.vue'
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
import { featureEnabled } from '@/lib/config'
import { ArrowLeftRight, ChevronDown, CloudDownload, Link2, Plus } from '@lucide/vue'

const props = defineProps<{ bucket: string; nodeId: string | null; groupId: string | null }>()

const realmNodes = useRealmNodes()
const stagingEnabled = featureEnabled('stagingJobs')

const kind = ref('all')
const KINDS = [
  { value: 'all', label: 'All' },
  { value: 'syncs', label: 'Syncs' },
  { value: 'linked', label: 'Linked folders' },
  { value: 'staging', label: 'Staging' },
]
// Syncs of a bucket on another node are the only kind this node can show.
const kinds = computed(() => (props.nodeId ? KINDS.slice(0, 2) : stagingEnabled ? KINDS : KINDS.slice(0, 3)))
const shows = (value: string) => kind.value === 'all' || kind.value === value

// Remounting the lists reloads them all at once.
const reloadKey = ref(0)
const counts = ref<Record<string, number | null>>({})
const linkAvailable = ref(false)
const allEmpty = computed(() => {
  const known = ['syncs', ...(props.nodeId ? [] : ['linked', ...(stagingEnabled ? ['staging'] : [])])]
  return known.every((key) => counts.value[key] === 0)
})

function setCount(key: string, count: number | null) {
  counts.value = { ...counts.value, [key]: count }
}

function reload() {
  counts.value = {}
  reloadKey.value += 1
}

const syncOpen = ref(false)
const stagingOpen = ref(false)
const linkedRows = ref<InstanceType<typeof LinkedFolderRows> | null>(null)

function addLink() {
  linkedRows.value?.open(null)
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="text-xs text-muted-foreground">Data copied into or out of this bucket.</p>
      <div class="flex flex-wrap items-center gap-2">
        <OptionToggle v-model="kind" :options="kinds" aria-label="Which transfers to show" />
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
            <DropdownMenuItem v-if="!nodeId" class="items-start" :disabled="!linkAvailable" @click="addLink">
              <Link2 class="mt-0.5 h-3.5 w-3.5" />
              <span>
                <span class="block">Link a storage folder</span>
                <span class="block text-xs text-muted-foreground">
                  {{ linkAvailable ? 'Keep a folder of your storage the same.' : 'Only group admins can link storage.' }}
                </span>
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem v-if="!nodeId && stagingEnabled" class="items-start" @click="stagingOpen = true">
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
      description="Use Add to sync it with another node, link a storage folder or stage data."
    />

    <SyncsTab
      v-if="shows('syncs')"
      :key="`syncs-${reloadKey}`"
      :bucket="bucket"
      :node-id="nodeId"
      embedded
      :quiet="kind === 'all'"
      @new-sync="syncOpen = true"
      @count="(count: number) => setCount('syncs', count)"
    />
    <!-- Kept mounted while hidden: its dialog serves the Add menu. -->
    <div v-if="!nodeId" v-show="shows('linked')">
      <LinkedFolderRows
        ref="linkedRows"
        :key="`linked-${reloadKey}`"
        :bucket="bucket"
        :group-id="groupId"
        :quiet="kind === 'all'"
        @available="(value: boolean) => (linkAvailable = value)"
        @count="(count: number) => setCount('linked', count)"
      />
    </div>
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
