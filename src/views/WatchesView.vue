<script setup lang="ts">
import PageHeader from '@/components/dashboard/PageHeader.vue'
import Button from '@/components/ui/Button.vue'
import RefreshButton from '@/components/ui/RefreshButton.vue'
import Badge from '@/components/ui/Badge.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { computed, onMounted, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { useAruna } from '@/composables/useAruna'
import { useWatches } from '@/composables/useWatches'
import { reportGlobalError } from '@/composables/useGlobalErrors'
import { useRefresh } from '@/composables/useRefresh'
import { OFFLINE_WRITE_HINT, useConnectivity } from '@/lib/connectivity'
import { parseWatchPath, watchEventLabel } from '@/lib/watches'
import { errorMessage, relativeTime, truncateMiddle } from '@/lib/utils'
import type { ApiWatch } from '@/lib/api'
import { ArrowLeft, Eye, Trash2 } from '@lucide/vue'

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

onMounted(() => void ensureLoaded())
// Account switch without a reload: refetch for the new identity.
watch(currentUser, () => void ensureLoaded())
</script>

<template>
  <div>
    <PageHeader
      title="Watched resources"
      description="Watches deliver a notification when data is uploaded or metadata is created under a path you follow."
    >
      <template #actions>
        <RefreshButton :busy="spinning" @click="onRefresh" />
        <Button variant="outline" size="sm" as-child>
          <RouterLink :to="{ name: 'settings' }"><ArrowLeft class="h-4 w-4" /> Settings</RouterLink>
        </Button>
      </template>
    </PageHeader>

    <div class="container space-y-6 py-8">
      <template v-if="!bootstrapped">
        <Skeleton class="h-20" />
        <Skeleton class="h-40" />
      </template>

      <EmptyState
        v-else-if="!currentUser"
        title="Sign in to manage your watches."
        description="Watches belong to your account and follow you across devices."
      />

      <EmptyState
        v-else-if="!available"
        title="Watches are not available."
        description="This node's backend does not serve watch subscriptions for your session."
      />

      <template v-else>
        <ErrorPanel v-if="listError" :message="listError" @retry="loadWatches" />

        <div class="surface overflow-hidden">
          <div class="flex items-center justify-between border-b border-border px-5 py-3">
            <h2 class="text-sm font-semibold text-foreground">Active watches</h2>
            <Badge variant="outline">{{ watches.length }}</Badge>
          </div>

          <div v-if="listLoading && !watches.length" class="space-y-2 p-4">
            <Skeleton class="h-12 w-full" />
            <Skeleton class="h-12 w-full" />
          </div>

          <EmptyState
            v-else-if="listLoaded && !listError && watches.length === 0"
            title="No watches yet"
            description="Use the Watch button on a metadata document or an object-browser prefix to follow it."
          >
            <template #icon><Eye class="h-6 w-6" /></template>
          </EmptyState>

          <ul v-else class="divide-y divide-border">
            <li v-for="{ w, info, groupName } in rows" :key="w.id" class="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" size="sm" class="uppercase">{{ info?.namespace === 'meta' ? 'metadata' : info?.namespace === 's3' ? 'data' : 'watch' }}</Badge>
                  <RouterLink
                    v-if="info?.link"
                    :to="info.link"
                    class="truncate text-sm font-medium text-foreground hover:text-primary hover:underline"
                    :title="w.path_prefix"
                  >{{ info.label }}</RouterLink>
                  <span v-else class="truncate text-sm font-medium text-foreground" :title="w.path_prefix">{{ info?.label ?? w.path_prefix }}</span>
                  <!-- Optional per-watch health from newer backends. -->
                  <Badge
                    v-if="w.health === 'needs_attention'"
                    variant="warn"
                    size="sm"
                    class="uppercase"
                    title="This watch may not be delivering events, remove and re-create it if notifications stay silent."
                  >needs attention</Badge>
                </div>
                <p class="mt-0.5 text-[11px] text-muted-foreground">
                  <span v-for="(event, i) in w.events" :key="event">{{ i ? ', ' : '' }}{{ watchEventLabel(event) }}</span>
                  <span v-if="groupName"> · {{ groupName }}</span>
                  · created {{ timeOf(w) }}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                class="text-destructive hover:text-destructive"
                :disabled="deletingIds.includes(w.id) || writesDisabled"
                :title="writesDisabled ? OFFLINE_WRITE_HINT : undefined"
                :aria-label="`Remove watch on ${info?.label ?? w.path_prefix}`"
                @click="onDelete(w)"
              >
                <Trash2 class="h-4 w-4" /> Remove
              </Button>
            </li>
          </ul>
        </div>

        <!-- What each watch kind actually covers. -->
        <div class="surface-muted space-y-1.5 px-4 py-3 text-[11px] leading-relaxed text-muted-foreground">
          <p><span class="font-medium text-foreground">Data watches</span> cover a bucket folder: every object uploaded under it, your own uploads included, across all folders below, triggers a notification; never just a single object.</p>
          <p><span class="font-medium text-foreground">Metadata watches</span> cover a catalog path: you are notified when a new metadata document (dataset, profile, run record) is created under it.</p>
          <p>Events arrive in the notification bell; delivery can lag a few seconds. Each account can hold up to 50 watches; hover a watch to see its technical path.</p>
        </div>
      </template>
    </div>
  </div>
</template>
