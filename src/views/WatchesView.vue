<script setup lang="ts">
import PageHeader from '@/components/dashboard/PageHeader.vue'
import Button from '@/components/ui/Button.vue'
import RefreshButton from '@/components/ui/RefreshButton.vue'
import IconTile from '@/components/ui/IconTile.vue'
import SectionHeading from '@/components/ui/SectionHeading.vue'
import StatusPill from '@/components/ui/StatusPill.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import ListShell from '@/components/ui/ListShell.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import NodeLabel from '@/components/ui/NodeLabel.vue'
import { computed, onMounted, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { useAruna } from '@/composables/useAruna'
import { useWatches } from '@/composables/useWatches'
import { reportGlobalError } from '@/composables/useGlobalErrors'
import { useRefresh } from '@/composables/useRefresh'
import { OFFLINE_WRITE_HINT, useConnectivity } from '@/lib/connectivity'
import { parseWatchPath, watchEventLabel, WATCH_DELIVERY_NOTE } from '@/lib/watches'
import { errorMessage, relativeTime, truncateMiddle } from '@/lib/utils'
import type { ApiWatch } from '@/lib/api'
import { Eye, EyeOff, FileJson2, Folder, Trash2 } from '@lucide/vue'

const { bootstrapped, currentUser, myGroups, discoverableGroups } = useAruna()
const { available, watches, listLoaded, listLoading, listError, deletingIds, loadWatches, ensureLoaded, deleteWatch } =
  useWatches()
const { writesDisabled } = useConnectivity()

const { busy: refreshBusy, refresh: onRefresh } = useRefresh(loadWatches)
const spinning = computed(() => refreshBusy.value || listLoading.value)

const groupsById = computed(() => {
  const map = new Map<string, string>()
  for (const g of [...myGroups.value, ...discoverableGroups.value]) map.set(g.id, g.name)
  return map
})

const rows = computed(() =>
  watches.value.map((w) => {
    const info = parseWatchPath(w.path_prefix)
    return {
      w,
      info,
      // Absent field: the backend still filters unauthorized watches out.
      authorized: w.authorized !== false,
      groupName: info ? (groupsById.value.get(info.groupId) ?? truncateMiddle(info.groupId)) : undefined,
    }
  }),
)

async function onDelete(w: ApiWatch) {
  try {
    await deleteWatch(w.id)
  } catch (err) {
    reportGlobalError(`Could not remove watch: ${errorMessage(err)}`)
  }
}

function timeOf(w: ApiWatch): string {
  return relativeTime(new Date(w.created_at_ms).toISOString())
}

// Only what the shell models; being signed out or unsupported is answered above
// it, and the first load is still 'loading' before it lands.
const shellState = computed<'loading' | 'error' | 'empty' | 'ready'>(() => {
  if (listError.value) return 'error'
  if (!listLoaded.value) return 'loading'
  return watches.value.length ? 'ready' : 'empty'
})

onMounted(() => void ensureLoaded())
// Account switch without a reload: refetch for the new identity.
watch(currentUser, () => void ensureLoaded())
</script>

<template>
  <div>
    <PageHeader title="Watched resources" :crumbs="[{ label: 'Watched resources' }]" :description="WATCH_DELIVERY_NOTE" :docs="{ topic: 'portal-tour', section: 'The top bar' }">
      <template #actions>
        <RefreshButton :busy="spinning" @click="onRefresh" />
      </template>
    </PageHeader>

    <div class="w-full space-y-6 px-4 py-6 sm:px-6">
      <template v-if="!bootstrapped">
        <Skeleton class="h-20" />
        <Skeleton class="h-40" />
      </template>

      <EmptyState
        v-else-if="!currentUser"
        title="Sign in to manage your watches"
        description="Watches belong to your account and follow you across devices."
      />

      <EmptyState
        v-else-if="!available"
        title="Watches are not available"
        description="This node does not serve watch subscriptions for your session."
      />

      <section v-else aria-labelledby="watches-heading">
        <SectionHeading
          id="watches-heading"
          title="Your watches"
          :icon="Eye"
          info="A data watch covers a bucket folder on one node and everything uploaded below it. A dataset watch tells you when a new dataset appears under a catalog path. Up to 50 per account."
        >
          <template #actions>
            <span v-if="watches.length" class="text-sm text-muted-foreground"><b class="font-medium text-foreground">{{ watches.length }}</b> of 50</span>
          </template>
        </SectionHeading>
        <ListShell
          :state="shellState"
          :error="listError || undefined"
          :rows="2"
          empty-title="No watches yet"
          empty-description="Use the Watch button on a dataset or on a bucket folder under Data to follow it."
          @retry="loadWatches"
        >
          <template #icon><Eye class="h-6 w-6" /></template>

          <ul class="divide-y divide-border-subtle">
            <li v-for="{ w, info, authorized, groupName } in rows" :key="w.id" class="flex flex-wrap items-center gap-3 px-5 py-3">
              <!-- An unauthorized row withholds its details, so it can only be deleted. -->
              <IconTile :icon="!authorized ? EyeOff : info?.namespace === 'meta' ? FileJson2 : Folder" :tone="authorized ? 'muted' : 'warn'" size="sm" />
              <div v-if="!authorized" class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="truncate text-sm font-medium text-foreground">No longer delivering: read access was removed</span>
                  <StatusPill state="Stopped" tone="attention" />
                </div>
                <p class="mt-0.5 text-xs text-muted-foreground">
                  Delete it to free one of your 50 watches.
                </p>
              </div>
              <div v-else class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2">
                  <RouterLink
                    v-if="info?.link"
                    :to="info.link"
                    class="truncate text-sm font-medium text-foreground hover:text-primary hover:underline"
                    :title="w.path_prefix"
                  >{{ info.label }}</RouterLink>
                  <span v-else class="truncate text-sm font-medium text-foreground" :title="w.path_prefix">{{ info?.label ?? w.path_prefix }}</span>
                </div>
                <p class="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                  <span>
                    <span v-for="(event, i) in w.events" :key="event">{{ i ? ', ' : '' }}{{ watchEventLabel(event) }}</span>
                    <span v-if="groupName"> · {{ groupName }}</span>
                  </span>
                  <!-- Data watches are node-scoped: the same bucket on another node is a different watch. -->
                  <template v-if="info?.nodeId">
                    <span>· on</span>
                    <RouterLink :to="{ name: 'node', params: { nodeId: info.nodeId } }" class="hover:underline"><NodeLabel :node-id="info.nodeId" size="sm" /></RouterLink>
                  </template>
                  <span>· created {{ timeOf(w) }}</span>
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                :disabled="deletingIds.includes(w.id) || writesDisabled"
                :title="writesDisabled ? OFFLINE_WRITE_HINT : undefined"
                :aria-label="authorized ? `Stop watching ${info?.label ?? w.path_prefix}` : 'Delete the watch that stopped delivering'"
                @click="onDelete(w)"
              >
                <Trash2 class="h-4 w-4" /> {{ authorized ? 'Stop watching' : 'Delete' }}
              </Button>
            </li>
          </ul>
        </ListShell>
      </section>
    </div>
  </div>
</template>
