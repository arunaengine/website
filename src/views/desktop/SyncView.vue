<script setup lang="ts">
// What this device holds offline and what it still owes the realm. Documents
// first, because a document that will not publish is the owner's to fix; the
// folders below it are counted, not decided, here.
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import FilterChips from '@/components/ui/FilterChips.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import PageHeader from '@/components/dashboard/PageHeader.vue'
import DeviceSurfaceState from '@/components/desktop/DeviceSurfaceState.vue'
import { useDeviceSync } from '@/composables/useDeviceSync'
import type { DatasetSyncState, DocumentSyncState, SyncDocument } from '@/lib/deviceApi'
import { relativeTime } from '@/lib/utils'
import type { BadgeVariant } from '@/components/nodes/node-display'
import { CloudOff, FileText, FolderSync, RefreshCw } from '@lucide/vue'

const { status, state, loading, error, runError, running, needsOwner, runSync, load } = useDeviceSync()

const filter = ref('all')

onMounted(() => void load())

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

const DATASET_BADGE: Record<DatasetSyncState, BadgeVariant> = {
  synced: 'success',
  pending: 'sky',
  paused: 'secondary',
  error: 'destructive',
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

const nothingHeld = computed(
  () => state.value === 'ready' && !documents.value.length && !status.value.datasets.length,
)
</script>

<template>
  <div>
    <PageHeader
      eyebrow="This computer"
      title="Sync"
      description="What this computer keeps offline, and what it still owes the realm."
    >
      <template #breadcrumbs>
        <span>·</span>
        <Badge :variant="status.realmReachable ? 'success' : 'secondary'">{{
          status.realmReachable ? 'online' : 'offline'
        }}</Badge>
        <span>·</span>
        <span>last sync {{ lastSync }}</span>
      </template>
      <template #actions>
        <span class="text-xs text-muted-foreground">
          {{ status.pendingTotal }} {{ status.pendingTotal === 1 ? 'change' : 'changes' }} pending
        </span>
        <Button size="sm" :disabled="!canRun" @click="runSync">
          <RefreshCw class="h-3.5 w-3.5" /> {{ running ? 'Syncing' : 'Sync now' }}
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

      <template v-else-if="state === 'ready'">
        <section class="surface overflow-hidden">
          <header class="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
            <div class="flex items-center gap-2">
              <FileText class="h-4 w-4 text-primary" />
              <h2 class="font-display text-sm font-semibold text-aruna-navy">Documents</h2>
              <span v-if="needsOwner" class="text-[11px] font-medium text-amber-700 dark:text-amber-300"
                >{{ needsOwner }} waiting for you</span
              >
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

        <section class="surface overflow-hidden">
          <header class="flex items-center gap-2 border-b border-border px-5 py-3">
            <FolderSync class="h-4 w-4 text-primary" />
            <h2 class="font-display text-sm font-semibold text-aruna-navy">Datasets</h2>
          </header>

          <p v-if="!status.datasets.length" class="px-5 py-6 text-sm text-muted-foreground">
            No folder on this computer is synced yet.
          </p>
          <ul v-else class="divide-y divide-border/70">
            <li v-for="set in status.datasets" :key="set.folderId" class="flex flex-wrap items-center gap-2 px-5 py-3">
              <Badge :variant="DATASET_BADGE[set.state]" class="uppercase">{{ set.state }}</Badge>
              <RouterLink
                :to="{ name: 'folder', params: { folderId: set.folderId } }"
                class="min-w-0 truncate text-[13px] font-medium text-foreground hover:text-primary hover:underline"
                >{{ set.label || set.folderId }}</RouterLink
              >
              <span class="ml-auto flex flex-wrap items-center gap-x-4 text-[11px] text-muted-foreground">
                <span>{{ set.pendingUploads }} uploading</span>
                <span>{{ set.unsyncedFiles }} not synced</span>
                <RouterLink
                  v-if="set.conflicts"
                  :to="{ name: 'folder', params: { folderId: set.folderId } }"
                  class="font-medium text-amber-700 hover:underline dark:text-amber-300"
                  >{{ set.conflicts }} need your decision</RouterLink
                >
              </span>
            </li>
          </ul>
        </section>
      </template>
    </div>
  </div>
</template>
