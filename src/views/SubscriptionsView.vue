<script setup lang="ts">
import PageHeader from '@/components/dashboard/PageHeader.vue'
import Button from '@/components/ui/Button.vue'
import Badge from '@/components/ui/Badge.vue'
import Select from '@/components/ui/Select.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import NotFoundView from '@/views/NotFoundView.vue'
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { useAruna } from '@/composables/useAruna'
import { useSubscriptions } from '@/composables/useSubscriptions'
import { reportGlobalError } from '@/composables/useGlobalErrors'
import { featureEnabled } from '@/lib/config'
import { OFFLINE_WRITE_HINT, useConnectivity } from '@/lib/connectivity'
import { relativeTime, truncateMiddle } from '@/lib/utils'
import type { GroupSubscription } from '@/lib/api'
import { ArrowLeft, LoaderCircle, Plus, RefreshCw, Rss, Trash2 } from '@lucide/vue'

const enabled = featureEnabled('subscriptions')
const { bootstrapped, currentUser, nodeInfo, myGroups, discoverableGroups } = useAruna()
const {
  subscriptions,
  subscriptionsLoaded,
  subscriptionsError,
  busy,
  unsubscribingIds,
  subscribedGroupIds,
  loadSubscriptions,
  ensureSubscriptionsLoaded,
  subscribe,
  unsubscribe,
} = useSubscriptions()
const { writesDisabled } = useConnectivity()

const selectedGroupId = ref('')
const subscribeError = ref<string | null>(null)

// Group name lookup for rendering rows and the subscribe Select.
const groupsById = computed(() => {
  const map = new Map<string, string>()
  for (const g of [...myGroups.value, ...discoverableGroups.value]) map.set(g.id, g.name)
  return map
})

// Candidate groups to subscribe to: any known group not already subscribed.
const candidateOptions = computed(() =>
  [...myGroups.value, ...discoverableGroups.value]
    .filter((g) => !subscribedGroupIds.value.has(g.id))
    .map((g) => ({ value: g.id, label: g.name })),
)

function groupName(sub: GroupSubscription): string {
  return groupsById.value.get(sub.group_id) ?? sub.group_display_name ?? truncateMiddle(sub.group_id)
}

async function onSubscribe() {
  if (!selectedGroupId.value) return
  subscribeError.value = null
  try {
    await subscribe(selectedGroupId.value)
    selectedGroupId.value = ''
  } catch (err) {
    subscribeError.value = err instanceof Error ? err.message : String(err)
  }
}

async function onUnsubscribe(sub: GroupSubscription) {
  try {
    await unsubscribe(sub.group_id)
  } catch (err) {
    reportGlobalError(err instanceof Error ? err.message : String(err))
  }
}

if (enabled) {
  onMounted(() => void ensureSubscriptionsLoaded())
  // Account switch without a reload: refetch for the new identity (#248 pattern).
  watch(currentUser, () => void ensureSubscriptionsLoaded())
}
</script>

<template>
  <NotFoundView v-if="!enabled" />
  <div v-else>
    <PageHeader
      title="Subscriptions"
      description="Follow groups' metadata on this node as read-only leases, so browsing, search and SPARQL keep working offline."
    >
      <template #actions>
        <Button variant="ghost" size="sm" @click="loadSubscriptions"><RefreshCw class="h-4 w-4" /> Refresh</Button>
        <RouterLink :to="{ name: 'settings' }">
          <Button variant="outline" size="sm"><ArrowLeft class="h-4 w-4" /> Settings</Button>
        </RouterLink>
      </template>
    </PageHeader>

    <div class="container max-w-[900px] space-y-6 py-8">
      <template v-if="!bootstrapped">
        <Skeleton class="h-20" />
        <Skeleton class="h-40" />
      </template>

      <div v-else-if="!currentUser" class="surface px-5 py-10 text-center">
        <p class="text-sm font-medium text-foreground">Sign in to manage this device's subscriptions.</p>
        <p class="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          Subscriptions are leases held for your identity on the node serving this portal.
        </p>
      </div>

      <template v-else>
        <ErrorPanel v-if="subscriptionsError" :message="subscriptionsError" @retry="loadSubscriptions" />

        <!-- Lease context strip. -->
        <div class="surface px-5 py-4 text-sm text-muted-foreground">
          <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>Serving node</span>
            <span class="font-mono text-xs text-foreground">{{ truncateMiddle(nodeInfo?.node.peer_id ?? '') || 'unknown' }}</span>
          </div>
          <p class="mt-2">
            Leases live on the node serving this portal. Leased copies are read-only and never count toward the
            realm's replication factor.
          </p>
        </div>

        <!-- Subscribe row. -->
        <div class="surface space-y-2 px-5 py-4">
          <label class="text-xs font-medium text-foreground">Subscribe to a group</label>
          <div class="flex flex-wrap items-center gap-2">
            <Select
              v-model="selectedGroupId"
              :options="candidateOptions"
              placeholder="Select a group"
              class="min-w-[16rem] flex-1"
            />
            <Button
              size="sm"
              :disabled="busy || !selectedGroupId || writesDisabled"
              :title="writesDisabled ? OFFLINE_WRITE_HINT : undefined"
              @click="onSubscribe"
            >
              <Plus class="h-4 w-4" /> Subscribe
            </Button>
          </div>
          <p v-if="subscribeError" class="text-xs text-destructive">{{ subscribeError }}</p>
        </div>

        <!-- Subscription list. -->
        <div class="surface overflow-hidden">
          <div class="flex items-center justify-between border-b border-border px-5 py-3">
            <h2 class="text-sm font-semibold text-foreground">Subscribed groups</h2>
            <Badge variant="outline">{{ subscriptions.length }}</Badge>
          </div>

          <EmptyState
            v-if="subscriptionsLoaded && !subscriptionsError && subscriptions.length === 0"
            title="No subscriptions yet"
            description="Subscribe to a group above to keep its metadata available on this device."
          >
            <template #icon><Rss class="h-6 w-6" /></template>
          </EmptyState>

          <ul v-else class="divide-y divide-border">
            <li v-for="sub in subscriptions" :key="sub.group_id" class="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <span class="truncate text-sm font-medium text-foreground">{{ groupName(sub) }}</span>
                  <Badge v-if="sub.state === 'pending'" variant="outline">pending</Badge>
                  <Badge v-else-if="sub.state === 'syncing'" variant="warn">
                    <LoaderCircle class="mr-1 h-3 w-3 animate-spin" /> syncing
                  </Badge>
                  <Badge v-else-if="sub.state === 'synced'" variant="success">synced</Badge>
                  <Badge v-else variant="destructive">sync error</Badge>
                </div>
                <p class="truncate font-mono text-[11px] text-muted-foreground">{{ sub.group_id }}</p>
                <p class="font-mono text-[11px] text-muted-foreground">
                  {{ sub.documents_synced }} / {{ sub.documents_total ?? '?' }} docs
                  <span v-if="sub.last_synced_at_ms"> · synced {{ relativeTime(new Date(sub.last_synced_at_ms).toISOString()) }}</span>
                  <span v-else> · never synced</span>
                </p>
                <p v-if="sub.state === 'error' && sub.error" class="text-xs text-destructive">{{ sub.error }}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                class="text-destructive hover:text-destructive"
                :disabled="unsubscribingIds.includes(sub.group_id) || writesDisabled"
                :title="writesDisabled ? OFFLINE_WRITE_HINT : undefined"
                @click="onUnsubscribe(sub)"
              >
                <Trash2 class="h-4 w-4" /> Unsubscribe
              </Button>
            </li>
          </ul>
        </div>

        <p class="text-xs text-muted-foreground">
          While offline, subscribed metadata stays browsable and queryable on this node; subscribing and
          unsubscribing need connectivity.
        </p>
      </template>
    </div>
  </div>
</template>
