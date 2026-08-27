<script setup lang="ts">
// One section for everything this computer syncs: the folders bound to the
// realm, the documents it keeps offline, and the bytes in motion right now.
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import FilterChips from '@/components/ui/FilterChips.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import Tabs from '@/components/ui/Tabs.vue'
import TabsList from '@/components/ui/TabsList.vue'
import TabsTrigger from '@/components/ui/TabsTrigger.vue'
import TabsContent from '@/components/ui/TabsContent.vue'
import PageHeader from '@/components/dashboard/PageHeader.vue'
import BindFolderDialog from '@/components/desktop/BindFolderDialog.vue'
import DeviceSurfaceState from '@/components/desktop/DeviceSurfaceState.vue'
import DeviceTransfersPanel from '@/components/desktop/DeviceTransfersPanel.vue'
import FoldersPanel from '@/components/desktop/FoldersPanel.vue'
import { useDeviceSync } from '@/composables/useDeviceSync'
import { useRefresh } from '@/composables/useRefresh'
import { useSyncedFolders } from '@/composables/useSyncedFolders'
import type { DocumentSyncState, SyncDocument } from '@/lib/deviceApi'
import { relativeTime } from '@/lib/utils'
import type { BadgeVariant } from '@/components/nodes/node-display'
import { CloudOff, FileText, Plus, RefreshCw } from '@lucide/vue'

const { status, state, loading, error, runError, running, runSync, load } = useDeviceSync()
const { load: loadFolders, needsYouTotal } = useSyncedFolders()

const route = useRoute()
const router = useRouter()
const filter = ref('all')
const showBind = ref(false)

const TABS = ['folders', 'documents', 'transfers']

const tab = computed(() => {
  const asked = route.query.tab
  return typeof asked === 'string' && TABS.includes(asked) ? asked : 'folders'
})

function setTab(next: string): void {
  void router.replace({ name: 'sync', query: next === 'folders' ? {} : { tab: next } })
}

onMounted(() => void load())

async function reload(): Promise<void> {
  await Promise.all([load(), loadFolders()])
}

const { busy: refreshBusy, refresh: onRefresh } = useRefresh(reload)
const spinning = computed(() => refreshBusy.value || loading.value)

const DOC_BADGE: Record<DocumentSyncState, BadgeVariant> = {
  synced: 'success',
  pending: 'sky',
  publishing: 'sky',
  invalid: 'warn',
  failed: 'destructive',
  local_only: 'outline',
}

const DOC_LABEL: Record<DocumentSyncState, string> = {
  synced: 'synced',
  pending: 'pending',
  publishing: 'publishing',
  invalid: 'invalid',
  failed: 'failed',
  local_only: 'local only',
}

function attention(doc: SyncDocument): boolean {
  return doc.state === 'invalid' || doc.state === 'failed'
}

function pending(doc: SyncDocument): boolean {
  return doc.state === 'pending' || doc.state === 'publishing'
}

// Why a document is stuck. Findings stand in for a node that named no error:
// the document is held back, and the realm keeps serving the last valid one.
function reason(doc: SyncDocument): string {
  if (doc.lastError) return doc.lastError
  const findings = doc.validationFindings
  const noun = findings === 1 ? 'validation finding' : 'validation findings'
  return `${findings} ${noun}; the last valid version is shown until this is fixed`
}

const documents = computed(() => status.value.documents)

const chips = computed(() => [
  { value: 'all', label: 'All', count: documents.value.length },
  { value: 'attention', label: 'Needs attention', count: documents.value.filter(attention).length },
  { value: 'pending', label: 'Pending', count: documents.value.filter(pending).length },
  { value: 'synced', label: 'Synced', count: documents.value.filter((doc) => doc.state === 'synced').length },
])

const shown = computed(() => {
  switch (filter.value) {
    case 'attention':
      return documents.value.filter(attention)
    case 'pending':
      return documents.value.filter(pending)
    case 'synced':
      return documents.value.filter((doc) => doc.state === 'synced')
    default:
      return documents.value
  }
})

const lastSync = computed(() =>
  status.value.lastSyncMs ? relativeTime(new Date(status.value.lastSyncMs).toISOString()) : 'never',
)

const canRun = computed(() => state.value === 'ready' && status.value.realmReachable && !running.value)

const nothingHeld = computed(() => state.value === 'ready' && !documents.value.length)
</script>

<template>
  <div>
    <PageHeader
      eyebrow="This computer"
      title="Sync"
      description="What this computer keeps in step with the realm, and what it still owes it."
    >
      <template #breadcrumbs>
        <span>·</span>
        <Badge :variant="status.realmReachable ? 'success' : 'secondary'">{{
          status.realmReachable ? 'Realm reachable' : 'Realm not answering'
        }}</Badge>
        <span>·</span>
        <span>last sync {{ lastSync }}</span>
      </template>
      <template #actions>
        <span class="text-xs text-muted-foreground">
          {{ status.pendingTotal }} {{ status.pendingTotal === 1 ? 'change' : 'changes' }} pending
        </span>
        <Button variant="outline" size="sm" :disabled="spinning" :aria-busy="spinning" @click="onRefresh">
          <RefreshCw class="h-3.5 w-3.5" :class="spinning ? 'animate-spin' : ''" /> Refresh
        </Button>
        <Button variant="outline" size="sm" @click="showBind = true"><Plus class="h-4 w-4" /> Bind a folder</Button>
        <Button size="sm" :disabled="!canRun" :aria-busy="running" @click="runSync">
          <RefreshCw class="h-3.5 w-3.5" :class="running ? 'animate-spin' : ''" /> {{ running ? 'Syncing' : 'Sync now' }}
        </Button>
      </template>
    </PageHeader>

    <div class="container space-y-5 py-5">
      <p
        v-if="runError"
        class="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
      >
        {{ runError }}
      </p>

      <p
        v-else-if="state === 'ready' && !status.realmReachable"
        class="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
      >
        <CloudOff class="h-3.5 w-3.5 shrink-0" />
        The realm cannot be reached. Your edits are kept here and go out on their own once it answers.
      </p>

      <Tabs :model-value="tab" @update:model-value="setTab">
        <TabsList>
          <TabsTrigger value="folders">
            Folders
            <span v-if="needsYouTotal" class="ml-1.5 text-[11px] text-amber-700 dark:text-amber-300"
              >{{ needsYouTotal }}</span
            >
          </TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="transfers">Transfers</TabsTrigger>
        </TabsList>

        <TabsContent value="folders">
          <FoldersPanel @bind="showBind = true" />
        </TabsContent>

        <TabsContent value="documents" class="space-y-4">
          <DeviceSurfaceState :state="state" subject="its sync status" :error="error" @retry="load" />

          <div v-if="loading && state !== 'offline'" class="space-y-3">
            <Skeleton v-for="n in 2" :key="n" class="h-28" />
          </div>

          <EmptyState
            v-else-if="nothingHeld"
            title="Nothing is kept on this computer yet"
            description="A document becomes available offline when you create it here, edit it here, or select it for offline use on its page."
          >
            <template #icon><FileText class="h-6 w-6" /></template>
          </EmptyState>

          <section v-else-if="state === 'ready'" class="surface overflow-hidden">
            <header class="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
              <div class="flex items-center gap-2">
                <FileText class="h-4 w-4 text-primary" />
                <h2 class="font-display text-sm font-semibold text-aruna-navy">Documents</h2>
              </div>
              <FilterChips v-model="filter" :options="chips" aria-label="Filter documents by sync state" />
            </header>

            <p v-if="!shown.length" class="px-5 py-6 text-sm text-muted-foreground">
              No document is in this state.
            </p>
            <ul v-else class="divide-y divide-border/70">
              <li v-for="doc in shown" :key="doc.documentId" class="px-5 py-3">
                <div class="flex flex-wrap items-center gap-2">
                  <Badge :variant="DOC_BADGE[doc.state]" class="uppercase">{{ DOC_LABEL[doc.state] }}</Badge>
                  <RouterLink
                    :to="{ name: 'metadata-detail', params: { id: doc.documentId } }"
                    class="min-w-0 truncate font-mono text-[12px] text-foreground hover:text-primary hover:underline"
                    >{{ doc.path || doc.documentId }}</RouterLink
                  >
                  <span v-if="doc.pendingEdits" class="ml-auto text-[11px] text-muted-foreground">
                    {{ doc.pendingEdits }} {{ doc.pendingEdits === 1 ? 'edit' : 'edits' }} waiting
                  </span>
                </div>
                <p
                  v-if="doc.state === 'invalid' || doc.state === 'failed'"
                  :class="[
                    'mt-1 text-[11px]',
                    doc.state === 'failed' ? 'text-destructive' : 'text-amber-700 dark:text-amber-300',
                  ]"
                >
                  {{ reason(doc) }}
                </p>
              </li>
            </ul>
          </section>
        </TabsContent>

        <TabsContent value="transfers">
          <DeviceTransfersPanel />
        </TabsContent>
      </Tabs>
    </div>

    <BindFolderDialog v-model:open="showBind" @bound="loadFolders" />
  </div>
</template>
