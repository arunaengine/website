<script setup lang="ts">
import Button from '@/components/ui/Button.vue'
import PageHeader from '@/components/dashboard/PageHeader.vue'
import FederationPanel from '@/components/dashboard/FederationPanel.vue'
import NewDatasetDialog from '@/components/metadata/NewDatasetDialog.vue'
import { ArrowRight, Boxes, FileJson2, ListChecks, LogIn, Plus, Activity, Users } from 'lucide-vue-next'
import { RouterLink, useRouter } from 'vue-router'
import { computed, ref } from 'vue'
import { useAruna } from '@/composables/useAruna'
import { useAuth } from '@/composables/useAuth'
import { relativeTime } from '@/lib/utils'

const router = useRouter()
const { currentUser, metadata, profiles, nodes, groups, realm, nodeInfo, loading, error, authError, refresh } = useAruna()
const { signIn } = useAuth()
const showNewDataset = ref(false)

function onSignIn() {
  void signIn({ redirectTo: '/app' })
}

const onlineNodes = computed(() => nodes.value.filter((node) => node.status === 'healthy').length)

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
    label: 'Groups',
    value: groups.value.length,
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

const pageTitle = computed(() =>
  currentUser.value ? `Welcome back, ${currentUser.value.name.split(' ')[0]}.` : 'Aruna data portal',
)
const pageDescription = computed(() =>
  currentUser.value
    ? 'Live data from the local Aruna API. No demo records are shown.'
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
        <Button variant="outline" @click="refresh">Refresh</Button>
        <Button v-if="currentUser" variant="outline" @click="showNewDataset = true">
          <Plus class="h-4 w-4" /> New dataset
        </Button>
        <Button v-else @click="onSignIn"><LogIn class="h-4 w-4" /> Sign in</Button>
        <RouterLink to="/app/metadata">
          <Button :variant="currentUser ? 'default' : 'outline'">
            Open catalog <ArrowRight class="h-4 w-4" />
          </Button>
        </RouterLink>
      </template>
    </PageHeader>

    <div class="container max-w-[1100px] space-y-6 py-8">
      <div v-if="error || authError" class="surface border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-800 dark:text-amber-300">
        <div v-if="error">API error: {{ error }}</div>
        <div v-if="authError" class="flex flex-wrap items-center justify-between gap-2">
          <span>Your session is no longer valid: {{ authError }}</span>
          <Button size="sm" variant="outline" @click="onSignIn"><LogIn class="h-3.5 w-3.5" /> Sign in again</Button>
        </div>
      </div>

      <section class="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <div v-for="stat in stats" :key="stat.label" class="surface flex items-center gap-3.5 px-4 py-4">
          <div :class="['grid h-9 w-9 shrink-0 place-items-center rounded-lg', stat.tone]">
            <component :is="stat.icon" class="h-[17px] w-[17px]" />
          </div>
          <div class="min-w-0">
            <div class="truncate font-display text-xl font-bold leading-tight text-foreground">{{ stat.value }}</div>
            <div class="mt-0.5 truncate text-[11px] text-muted-foreground">{{ stat.label }}</div>
          </div>
        </div>
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
          <ul class="divide-y divide-border">
            <li v-for="doc in recentMetadata" :key="doc.ulid">
              <RouterLink :to="{ name: 'metadata-detail', params: { id: doc.ulid } }" class="block px-5 py-3 hover:bg-muted/40">
                <div class="flex items-center justify-between gap-3">
                  <span class="truncate text-sm font-medium text-foreground">{{ doc.title }}</span>
                  <span class="shrink-0 text-[11px] text-muted-foreground">{{ relativeTime(doc.updatedAt) }}</span>
                </div>
                <p class="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{{ doc.description || doc.ulid }}</p>
              </RouterLink>
            </li>
            <li v-if="!recentMetadata.length" class="px-5 py-8 text-center text-xs text-muted-foreground">
              {{ loading ? 'Loading metadata…' : 'No visible metadata documents.' }}
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
          </section>

          <section class="surface p-5">
            <div class="flex items-center gap-2">
              <Boxes class="h-4 w-4 text-primary" />
              <h2 class="font-display text-sm font-semibold text-aruna-navy">Buckets</h2>
            </div>
            <p class="mt-2 text-xs text-muted-foreground">
              Bucket/object browsing is disabled until the S3 ListObjectsV2 and browser CORS work is available. This UI does not invent bucket records.
            </p>
            <RouterLink to="/app/buckets" class="mt-3 inline-flex text-xs font-medium text-primary hover:underline">Open S3 status</RouterLink>
          </section>
        </div>
      </section>

      <FederationPanel :nodes="nodes" :primary-id="nodeInfo?.node.peer_id" />
    </div>

    <NewDatasetDialog
      v-model:open="showNewDataset"
      @created="(doc) => router.push({ name: 'metadata-detail', params: { id: doc.ulid } })"
    />
  </div>
</template>
