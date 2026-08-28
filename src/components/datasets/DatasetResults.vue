<script setup lang="ts">
// Server-backed full-text search (aruna#258): active whenever q is non-empty.
// Datasets stay the primary result set; objects, groups, buckets and users
// render as extra sections like the top-bar quick search.
import { RouterLink, type RouteLocationRaw } from 'vue-router'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Notice from '@/components/ui/Notice.vue'
import Spinner from '@/components/ui/Spinner.vue'
import DatasetHits from '@/components/datasets/DatasetHits.vue'
import DatasetObjectResults from '@/components/datasets/DatasetObjectResults.vue'
import { useAruna } from '@/composables/useAruna'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { KIND_OPTIONS, type DatasetSearchState } from '@/composables/useDatasetSearch'
import { shortUserId, truncateMiddle } from '@/lib/utils'
import type { BucketSearchHit } from '@/lib/api'
import { AlertTriangle, Boxes, UserRound, Users } from '@lucide/vue'

const props = defineProps<{ state: DatasetSearchState }>()
const {
  partial,
  nodesQueried,
  nodesFailed,
  textQuery,
  kindFilter,
  groupMatches,
  bucketResults,
  bucketNodesQueried,
  bucketNodesFailed,
  bucketsSearching,
  bucketsError,
  bucketsPartial,
  peopleResults,
  peopleSearching,
} = props.state
const { retrySearch, showKind } = props.state

const { realm, currentUser } = useAruna()
const { displayName: nodeDisplayName, isLocalNode } = useRealmNodes()

function bucketHitRoute(hit: BucketSearchHit): RouteLocationRaw {
  return {
    name: 'bucket',
    params: { bucketId: hit.bucket },
    query: isLocalNode(hit.node_id) ? {} : { node: hit.node_id },
  }
}
</script>

<template>
  <!-- Partial-result banner: served today via nodes_queried/nodes_failed, so it is
       NOT gated behind the cursor flag. Shows even when zero hits came back. -->
  <Notice v-if="partial" tone="warning" class="flex flex-wrap items-center gap-2 px-4 py-2.5">
    <AlertTriangle class="h-4 w-4" />
    <span>Partial results, {{ nodesQueried - nodesFailed }} of {{ nodesQueried }} nodes answered; matches on failed nodes are missing.</span>
    <Button variant="outline" size="sm" class="ml-auto" @click="retrySearch">Retry</Button>
  </Notice>

  <!-- Entity-kind chips: metadata stays the primary result set; groups and
       people render as extra sections like the top-bar quick search. -->
  <div v-if="textQuery" class="flex flex-wrap items-center gap-1.5" role="group" aria-label="Result types">
    <button
      v-for="kind in KIND_OPTIONS"
      :key="kind.id"
      type="button"
      :class="[
        'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
        kindFilter === kind.id
          ? 'border-primary/50 bg-primary/10 text-primary'
          : 'border-border text-muted-foreground hover:text-foreground',
      ]"
      @click="kindFilter = kind.id"
    >
      {{ kind.label }}
    </button>
  </div>

  <DatasetObjectResults v-if="showKind('objects') && textQuery" :state="state" />

  <section v-if="showKind('groups') && groupMatches.length">
    <div class="mb-3 flex items-center gap-2">
      <Users class="h-4 w-4 text-primary" />
      <h2 class="font-display text-sm font-semibold text-aruna-navy">Groups</h2>
      <span class="text-xs text-muted-foreground">{{ groupMatches.length }}</span>
    </div>
    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <RouterLink
        v-for="group in groupMatches"
        :key="group.id"
        :to="{ name: 'group', params: { id: group.id } }"
        class="surface flex flex-col gap-1 p-4 transition-shadow hover:shadow-md"
      >
        <div class="text-sm font-medium text-foreground">{{ group.name }}</div>
        <p class="line-clamp-2 text-xs text-muted-foreground">{{ group.description || 'No description.' }}</p>
      </RouterLink>
    </div>
  </section>

  <section v-if="showKind('buckets') && (bucketResults.length || bucketsSearching || bucketsError)" :aria-busy="bucketsSearching">
    <div class="mb-3 flex flex-wrap items-center gap-2">
      <Boxes class="h-4 w-4 text-primary" />
      <h2 class="font-display text-sm font-semibold text-aruna-navy">Buckets</h2>
      <Spinner v-if="bucketsSearching" show-label label="Searching…" />
      <span v-else class="text-xs text-muted-foreground">{{ bucketResults.length }}</span>
      <span v-if="bucketsPartial && !bucketsSearching" role="status" class="flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-400">
        <AlertTriangle class="h-3.5 w-3.5" />
        {{ bucketNodesQueried - bucketNodesFailed }} of {{ bucketNodesQueried }} nodes answered
      </span>
    </div>
    <p v-if="bucketsError" class="mb-3 text-xs text-destructive">{{ bucketsError }}</p>
    <div class="flex flex-wrap gap-2 transition-opacity" :class="bucketsSearching && bucketResults.length ? 'opacity-40' : ''">
      <RouterLink
        v-for="hit in bucketResults"
        :key="hit.arn"
        :to="bucketHitRoute(hit)"
        class="surface inline-flex items-center gap-2 px-3 py-2 text-sm transition-shadow hover:shadow-md"
      >
        <Boxes class="h-3.5 w-3.5 text-primary/70" />
        <span class="font-mono text-xs font-medium text-foreground">{{ hit.bucket }}</span>
        <Badge :variant="isLocalNode(hit.node_id) ? 'accent' : 'outline'" size="sm" :title="hit.node_id">
          {{ isLocalNode(hit.node_id) ? 'this node' : nodeDisplayName(hit.node_id) }}
        </Badge>
        <span class="text-[10px] text-muted-foreground" :title="hit.group_id">
          Group: {{ hit.group_name || truncateMiddle(hit.group_id) }}
        </span>
      </RouterLink>
    </div>
  </section>

  <section v-if="showKind('people') && (peopleResults.length || peopleSearching)" :aria-busy="peopleSearching">
    <div class="mb-3 flex items-center gap-2">
      <UserRound class="h-4 w-4 text-primary" />
      <h2 class="font-display text-sm font-semibold text-aruna-navy">Users</h2>
      <Spinner v-if="peopleSearching" show-label label="Searching…" />
      <span v-else class="text-xs text-muted-foreground">{{ peopleResults.length }}</span>
    </div>
    <div class="flex flex-wrap gap-2 transition-opacity" :class="peopleSearching && peopleResults.length ? 'opacity-40' : ''">
      <RouterLink
        v-for="hit in peopleResults"
        :key="hit.user_id"
        :to="{ name: 'user', params: { id: hit.user_id } }"
        class="surface inline-flex items-center gap-2 px-3 py-2 text-sm transition-shadow hover:shadow-md"
      >
        <UserRound class="h-3.5 w-3.5 text-primary/70" />
        <span class="font-medium text-foreground">{{ hit.name }}</span>
        <span class="font-mono text-[10px] text-muted-foreground" :title="hit.user_id">{{ shortUserId(hit.user_id) }}</span>
      </RouterLink>
    </div>
  </section>

  <EmptyState
    v-if="textQuery && kindFilter === 'buckets' && !bucketsSearching && !bucketResults.length && !bucketsError"
    title="No matching buckets"
    :description="currentUser ? `No bucket on the realm's nodes matched “${textQuery}”.` : 'Sign in to search for buckets.'"
  />
  <EmptyState
    v-else-if="textQuery && kindFilter === 'groups' && !groupMatches.length"
    title="No matching groups"
    :description="`No loaded group in ${realm.shortName} matched “${textQuery}”.`"
  />
  <EmptyState
    v-else-if="textQuery && kindFilter === 'people' && !peopleSearching && !peopleResults.length"
    title="No matching users"
    :description="currentUser ? `No user in ${realm.shortName} matched “${textQuery}”.` : 'Sign in to search for users.'"
  />

  <DatasetHits v-if="showKind('datasets')" :state="state" />
</template>
