<script setup lang="ts">
import Button from '@/components/ui/Button.vue'
import PageHeader from '@/components/dashboard/PageHeader.vue'
import FederationPanel from '@/components/dashboard/FederationPanel.vue'
import GroupQuotaCards from '@/components/dashboard/GroupQuotaCards.vue'
import NewDatasetDialog from '@/components/metadata/NewDatasetDialog.vue'
import ProfileChip from '@/components/metadata/ProfileChip.vue'
import StatCard from '@/components/ui/StatCard.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { ArrowRight, Boxes, Database, FileJson2, Files, FolderOpen, ListChecks, Plus, Activity, Users } from '@lucide/vue'
import { RouterLink, useRouter } from 'vue-router'
import { computed, ref, watch } from 'vue'
import { useAruna } from '@/composables/useAruna'
import { useAuth } from '@/composables/useAuth'
import { useDocumentVisibility, useIntervalFn } from '@vueuse/core'
import { useNotifications } from '@/composables/useNotifications'
import { storedReferencedHint } from '@/lib/quota'
import { formatBytes, formatNumber, relativeTime } from '@/lib/utils'

const router = useRouter()
const { currentUser, metadata, profiles, nodes, myGroups, discoverableGroups, realm, nodeInfo, realmInfo, usageInfo, bootstrapped, refresh, loadInfo } = useAruna()
const { authPending } = useAuth()
const { dashboardRevision } = useNotifications()
const showNewDataset = ref(false)
const refreshing = ref(false)
const quotaRevision = ref(0)
let refreshQueued = false

async function refreshDashboard() {
  if (refreshing.value) {
    refreshQueued = true
    return
  }
  refreshing.value = true
  try {
    do {
      refreshQueued = false
      await refresh()
    } while (refreshQueued)
  } finally {
    refreshing.value = false
    quotaRevision.value++
  }
}

watch(dashboardRevision, () => void refreshDashboard(), { immediate: true })

// Node heartbeats republish every 60s but never bump the SSE revision; poll
// the light info endpoints so the federation panel stays current.
const visibility = useDocumentVisibility()
useIntervalFn(() => {
  if (visibility.value === 'visible' && !refreshing.value) void loadInfo()
}, 30_000)

const onlineNodes = computed(() => nodes.value.filter((node) => node.status === 'healthy').length)

// Honest realm figure: the sum of documents each node reports holding (replicas
// included), shown only once at least one node publishes the count.
const docsHeld = computed(() => {
  const reporting = (realmInfo.value?.nodes ?? []).filter(
    (node) => node.info?.utilization.documents_held !== undefined,
  )
  if (!reporting.length) return null
  const total = reporting.reduce((sum, node) => sum + (node.info?.utilization.documents_held ?? 0), 0)
  return { total, nodes: reporting.length }
})

const stats = computed(() => [
  {
    label: 'Metadata documents',
    value: metadata.value.length,
    icon: FileJson2,
    tone: 'bg-aruna-royal/15 text-aruna-royal dark:text-aruna-tagline',
  },
  {
    label: 'Profiles',
    value: profiles.value.length,
    icon: ListChecks,
    tone: 'bg-aruna-sky/15 text-aruna-sky',
  },
  {
    label: 'Realm groups',
    value: myGroups.value.length + discoverableGroups.value.length,
    icon: Users,
    tone: 'bg-aruna-aqua/15 text-aruna-aqua',
  },
  {
    label: 'Nodes online',
    value: `${onlineNodes.value} / ${nodes.value.length}`,
    icon: Activity,
    tone: 'bg-aruna-tagline/15 text-aruna-tagline',
  },
])

const recentMetadata = computed(() =>
  [...metadata.value].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5),
)

// While a stored session restores, keep the copy neutral instead of flashing
// the guest greeting and its sign-in hint.
const pageTitle = computed(() =>
  currentUser.value
    ? `Welcome back, ${currentUser.value.name.split(' ')[0]}.`
    : authPending.value
      ? 'Welcome back.'
      : 'Aruna data portal',
)
const pageDescription = computed(() =>
  currentUser.value || authPending.value
    ? 'Live data from the local Aruna API.'
    : 'You are browsing public data as a guest. Sign in to create datasets and manage your groups.',
)
</script>

<template>
  <div>
    <PageHeader
      :title="pageTitle"
      :description="pageDescription"
    >
      <template #actions>
        <Button variant="outline" :disabled="refreshing" @click="refreshDashboard">Refresh</Button>
        <Button v-if="currentUser" variant="outline" @click="showNewDataset = true">
          <Plus class="h-4 w-4" /> New dataset
        </Button>
        <RouterLink to="/app/metadata">
          <Button :variant="currentUser ? 'default' : 'outline'">
            Open catalog <ArrowRight class="h-4 w-4" />
          </Button>
        </RouterLink>
      </template>
    </PageHeader>

    <div class="container space-y-6 py-8">
      <section class="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <template v-if="!bootstrapped">
          <Skeleton v-for="n in 4" :key="n" class="h-16" />
        </template>
        <template v-else>
          <div v-for="stat in stats" :key="stat.label" class="surface flex items-center gap-3.5 px-4 py-4">
            <div :class="['grid h-9 w-9 shrink-0 place-items-center rounded-lg', stat.tone]">
              <component :is="stat.icon" class="h-[17px] w-[17px]" />
            </div>
            <div class="min-w-0">
              <div class="truncate font-display text-xl font-bold leading-tight text-foreground">{{ stat.value }}</div>
              <div class="mt-0.5 truncate text-[11px] text-muted-foreground">{{ stat.label }}</div>
            </div>
          </div>
        </template>
      </section>

      <section v-if="!bootstrapped || usageInfo" class="grid gap-3.5 sm:grid-cols-3">
        <template v-if="usageInfo">
          <StatCard
            label="Objects"
            :value="formatNumber(usageInfo.objects)"
            :icon="Files"
            :hint="storedReferencedHint(usageInfo)"
          />
          <StatCard
            label="Stored data"
            :value="formatBytes(usageInfo.stored_bytes)"
            :icon="Database"
            hint="Aggregate blob storage on this node"
          />
          <StatCard
            label="Buckets"
            :value="formatNumber(usageInfo.buckets)"
            :icon="FolderOpen"
            hint="Node-reported total; may include per-run system workspaces (ws-…)"
          />
        </template>
        <template v-else>
          <Skeleton v-for="n in 3" :key="n" class="h-[108px]" />
        </template>
      </section>

      <section v-if="currentUser && myGroups.length">
        <GroupQuotaCards :refresh-revision="quotaRevision" />
      </section>

      <section class="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <div class="surface overflow-hidden">
          <header class="flex items-center justify-between border-b border-border px-5 py-4">
            <div class="flex items-center gap-2">
              <FileJson2 class="h-4 w-4 text-primary" />
              <h2 class="font-display text-sm font-semibold text-aruna-navy">Recent metadata</h2>
            </div>
            <RouterLink to="/app/metadata" class="text-xs font-medium text-primary hover:underline">Catalog</RouterLink>
          </header>
          <ul v-if="!bootstrapped" class="divide-y divide-border">
            <li v-for="n in 4" :key="n" class="px-5 py-3.5">
              <Skeleton class="h-4 w-2/3" />
              <Skeleton class="mt-2 h-3 w-1/2" />
            </li>
          </ul>
          <ul v-else class="divide-y divide-border">
            <li v-for="doc in recentMetadata" :key="doc.ulid">
              <RouterLink :to="{ name: 'metadata-detail', params: { id: doc.ulid } }" class="block px-5 py-3 hover:bg-muted/40">
                <div class="flex items-center justify-between gap-3">
                  <span class="truncate text-sm font-medium text-foreground">{{ doc.title }}</span>
                  <span class="shrink-0 text-[11px] text-muted-foreground">{{ relativeTime(doc.updatedAt) }}</span>
                </div>
                <p class="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{{ doc.description || doc.ulid }}</p>
                <div class="mt-1.5">
                  <ProfileChip :doc="doc" />
                </div>
              </RouterLink>
            </li>
            <li v-if="!recentMetadata.length" class="px-5 py-8 text-center text-xs text-muted-foreground">
              No visible metadata documents yet.
            </li>
          </ul>
        </div>

        <div class="space-y-5">
          <section class="surface p-5">
            <div class="flex items-center gap-2">
              <Activity class="h-4 w-4 text-primary" />
              <h2 class="font-display text-sm font-semibold text-aruna-navy">Realm</h2>
            </div>
            <div class="mt-3 text-sm font-medium text-foreground">{{ realm.name }}</div>
            <div class="mt-1 break-all font-mono text-[11px] text-muted-foreground">{{ realm.id }}</div>
            <div
              v-if="docsHeld"
              class="mt-3 border-t border-border pt-3 text-xs text-muted-foreground"
              :title="`Summed across ${docsHeld.nodes} reporting node${docsHeld.nodes === 1 ? '' : 's'}; replicas included`"
            >
              <span class="font-semibold text-foreground">{{ formatNumber(docsHeld.total) }}</span> documents held
            </div>
          </section>

          <section class="surface p-5">
            <div class="flex items-center gap-2">
              <Boxes class="h-4 w-4 text-primary" />
              <h2 class="font-display text-sm font-semibold text-aruna-navy">Buckets</h2>
            </div>
            <p class="mt-2 text-xs text-muted-foreground">
              Browse buckets, upload objects and mint credentials in the data manager. The same buckets are served by the node's S3 API, so any S3 client works too.
            </p>
            <RouterLink to="/app/buckets" class="mt-3 inline-flex text-xs font-medium text-primary hover:underline">Open data manager</RouterLink>
          </section>
        </div>
      </section>

      <FederationPanel
        :nodes="realmInfo?.nodes ?? []"
        :replication-factor="realmInfo?.metadata_replication.default_replication_factor ?? 1"
        :local-peer-id="nodeInfo?.node.peer_id"
      />
    </div>

    <NewDatasetDialog
      v-model:open="showNewDataset"
      @created="(doc) => router.push({ name: 'metadata-detail', params: { id: doc.ulid } })"
    />
  </div>
</template>
