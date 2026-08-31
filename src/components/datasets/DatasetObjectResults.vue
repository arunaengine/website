<script setup lang="ts">
// Realm object inventory hits for the active query, with the coverage the
// answer was assembled under.
import { ref } from 'vue'
import { RouterLink, type RouteLocationRaw } from 'vue-router'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Notice from '@/components/ui/Notice.vue'
import Select from '@/components/ui/Select.vue'
import Spinner from '@/components/ui/Spinner.vue'
import CoverageIcon from '@/components/search/CoverageIcon.vue'
import CoverageStatsModal from '@/components/search/CoverageStatsModal.vue'
import { useAruna } from '@/composables/useAruna'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { OBJECT_SEARCH_MODE_LABELS } from '@/composables/useUnifiedSearch'
import type { DatasetSearchState } from '@/composables/useDatasetSearch'
import { formatBytes, relativeTime, truncateMiddle } from '@/lib/utils'
import type { ObjectSearchHit } from '@/lib/api'
import { Boxes, Download } from '@lucide/vue'

const props = defineProps<{ state: DatasetSearchState }>()
const {
  objectSearchMode,
  objectResults,
  objectCursor,
  objectCoverage,
  objectError,
  objectSearched,
  objectRequestMs,
  objectsSearching,
  objectLoadingSection,
  objectInventoryPartial,
  objectCoverageShown,
  objectCoverageComplete,
} = props.state
const { loadMoreUnifiedSection, retryObjectSearch, downloadObjectResults } = props.state

const { currentUser } = useAruna()
const { displayName: nodeDisplayName, isLocalNode } = useRealmNodes()

const objectModeOptions = Object.entries(OBJECT_SEARCH_MODE_LABELS).map(([value, label]) => ({ value, label }))
const showCoverageStats = ref(false)

function objectParentPrefix(key: string): string | undefined {
  const separator = key.lastIndexOf('/')
  return separator > 0 ? key.slice(0, separator) : undefined
}

function objectHitRoute(hit: ObjectSearchHit): RouteLocationRaw {
  const parent = objectParentPrefix(hit.key)
  return {
    name: 'bucket',
    params: { bucketId: hit.bucket },
    query: {
      group: hit.group_id,
      ...(!isLocalNode(hit.issuer_node_id) ? { node: hit.issuer_node_id } : {}),
      ...(parent ? { prefix: parent } : {}),
    },
  }
}
</script>

<template>
  <section :aria-busy="objectsSearching || objectLoadingSection === 'objects'">
    <div class="mb-3 flex flex-wrap items-center gap-2">
      <Boxes class="h-4 w-4 text-primary" />
      <h2 class="font-display text-sm font-semibold text-aruna-navy">Data objects</h2>
      <Spinner v-if="objectsSearching" show-label label="Searching…" />
      <CoverageIcon
        v-if="objectCoverageShown"
        :complete="objectCoverageComplete"
        @click="showCoverageStats = true"
      />
      <div class="ml-auto flex flex-wrap items-center gap-2">
        <Select
          v-model="objectSearchMode"
          :options="objectModeOptions"
          aria-label="Object inventory search mode"
          class="h-8 w-auto text-[11px]"
        />
        <Button v-if="objectResults.length && objectCoverage" variant="outline" size="sm" @click="downloadObjectResults">
          <Download class="h-3.5 w-3.5" />
          {{ objectInventoryPartial ? 'Export with manifest' : 'Export JSON' }}
        </Button>
      </div>
    </div>

    <!-- Object inventory coverage is intentionally before every hit. -->
    <Notice
      v-if="objectCoverageShown && !objectCoverageComplete"
      :tone="objectError ? 'error' : 'warning'"
      class="mb-3 flex flex-wrap items-center gap-2 px-4 py-3"
    >
      <div class="min-w-0 flex-1 space-y-1.5">
        <p v-if="objectInventoryPartial" class="font-medium">Partial object inventory. Coverage is incomplete, so missing objects cannot be treated as absent.</p>
        <template v-if="!objectCoverage">
          <p v-if="objectSearchMode === 'distributed_strict'">Distributed strict was unavailable. Strict mode did not fall back to best-effort.</p>
          <p>{{ objectError }}</p>
        </template>
      </div>
      <Button variant="outline" size="sm" :disabled="objectsSearching" @click="retryObjectSearch">Retry</Button>
    </Notice>

    <CoverageStatsModal
      v-model:open="showCoverageStats"
      :coverage="objectCoverage"
      :error="objectError"
      :request-ms="objectRequestMs"
    />

    <div v-if="objectResults.length" class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <RouterLink
        v-for="hit in objectResults"
        :key="`${hit.issuer_node_id}:${hit.bucket}:${hit.key}`"
        :to="objectHitRoute(hit)"
        class="surface flex min-w-0 flex-col gap-3 p-4 transition-shadow hover:shadow-md"
      >
        <div class="flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary" size="sm" class="uppercase">Object</Badge>
          <Badge variant="outline" size="sm">{{ OBJECT_SEARCH_MODE_LABELS[hit.mode] }}</Badge>
        </div>
        <p class="break-all font-mono text-xs font-medium text-foreground">{{ hit.key }}</p>
        <dl class="grid gap-1 text-[11px] text-muted-foreground">
          <div class="flex gap-1"><dt class="font-medium text-foreground/80">Node:</dt><dd :title="hit.issuer_node_id">{{ nodeDisplayName(hit.issuer_node_id) }}</dd></div>
          <div class="flex gap-1"><dt class="font-medium text-foreground/80">Group:</dt><dd class="truncate" :title="hit.group_id">{{ truncateMiddle(hit.group_id) }}</dd></div>
          <div class="flex gap-1"><dt class="font-medium text-foreground/80">Bucket:</dt><dd class="font-mono">{{ hit.bucket }}</dd></div>
          <div v-if="hit.content_w3id" class="min-w-0">
            <dt class="font-medium text-foreground/80">Content identity:</dt>
            <dd class="break-all font-mono" :title="hit.content_w3id">{{ hit.content_w3id }}</dd>
          </div>
          <div v-if="hit.checksum" class="min-w-0">
            <dt class="font-medium text-foreground/80">Checksum:</dt>
            <dd class="break-all font-mono">{{ hit.checksum.algorithm }}:{{ hit.checksum.value }}</dd>
          </div>
        </dl>
        <div class="mt-auto flex flex-wrap items-center justify-between gap-2 text-[10px] text-muted-foreground">
          <span v-if="hit.size !== null && hit.size !== undefined">{{ formatBytes(hit.size) }}</span>
          <span v-if="hit.updated_at" :title="hit.updated_at">Updated {{ relativeTime(hit.updated_at) }}</span>
          <span class="font-medium text-primary">Open in Data</span>
        </div>
      </RouterLink>
    </div>

    <div v-if="objectCursor" class="mt-3 flex justify-center">
      <Button variant="outline" size="sm" :disabled="objectLoadingSection === 'objects'" :aria-busy="objectLoadingSection === 'objects'" @click="loadMoreUnifiedSection('objects')">
        <Spinner v-if="objectLoadingSection === 'objects'" label="Loading more objects" class="text-current" />
        {{ objectLoadingSection === 'objects' ? 'Loading…' : 'Load more objects' }}
      </Button>
    </div>
    <EmptyState
      v-else-if="currentUser && objectSearched && !objectsSearching && !objectResults.length && !objectError"
      title="No matching data objects"
      :description="objectInventoryPartial
        ? 'No permission-visible live object was returned. Coverage is incomplete.'
        : 'No permission-visible live object matched this query.'"
    />
    <EmptyState
      v-else-if="!currentUser"
      title="Sign in to search data objects"
      description="Realm object inventory search requires an authenticated session."
    />
  </section>
</template>
