<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ChevronRight, File, Folder } from '@lucide/vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { ApiError, listGroupDataPaths, type DataPathEntry } from '@/lib/api'
import { useAruna } from '@/composables/useAruna'

// Lazy data-path browser: each level fetches GET /groups/{id}/data-paths for its
// own prefix, so expanding a folder loads exactly one page of that folder. An
// empty `prefix` lists the group's buckets; nested levels pass a folder's
// permission path (trailing-slash normalized) as the prefix.
const props = defineProps<{
  groupId: string
  // Group scope prefix (/{realm}/g/{group}/) used to derive role-path suffixes.
  pathPrefix: string
  prefix?: string
  selected?: string[]
  depth?: number
}>()

const emit = defineEmits<{ (e: 'select', suffix: string): void }>()

const { apiBaseUrl, authToken } = useAruna()

const PAGE_SIZE = 200

const loading = ref(true)
const loadingMore = ref(false)
const error = ref<string | null>(null)
// 'forbidden' = non-member (403/401); 'unavailable' = endpoint absent (404/405).
const status = ref<'ok' | 'forbidden' | 'unavailable'>('ok')
const entries = ref<DataPathEntry[]>([])
const nextToken = ref<string | null>(null)
const expanded = ref(new Set<string>())

function suffixOf(path: string): string {
  return path.startsWith(props.pathPrefix) ? path.slice(props.pathPrefix.length) : path
}

function subtreeSuffix(path: string): string {
  return `${suffixOf(path).replace(/\/+$/, '')}/**`
}

function expandPrefix(path: string): string {
  return path.endsWith('/') ? path : `${path}/`
}

function nameOf(path: string): string {
  return path.replace(/\/+$/, '').split('/').pop() ?? path
}

async function load(append: boolean) {
  if (append) loadingMore.value = true
  else loading.value = true
  error.value = null
  try {
    const page = await listGroupDataPaths(
      props.groupId,
      {
        prefix: props.prefix,
        delimiter: '/',
        continuationToken: append ? (nextToken.value ?? undefined) : undefined,
        limit: PAGE_SIZE,
      },
      { baseUrl: apiBaseUrl.value, token: authToken.value },
    )
    entries.value = append ? [...entries.value, ...page.entries] : page.entries
    nextToken.value = page.continuation_token ?? null
    status.value = 'ok'
  } catch (err) {
    if (err instanceof ApiError && (err.status === 403 || err.status === 401)) status.value = 'forbidden'
    else if (err instanceof ApiError && (err.status === 404 || err.status === 405)) status.value = 'unavailable'
    else error.value = err instanceof Error ? err.message : String(err)
  } finally {
    loading.value = false
    loadingMore.value = false
  }
}

function toggle(path: string) {
  const next = new Set(expanded.value)
  if (next.has(path)) next.delete(path)
  else next.add(path)
  expanded.value = next
}

onMounted(() => void load(false))
</script>

<template>
  <div>
    <div v-if="loading && !entries.length" class="space-y-1.5">
      <Skeleton class="h-5" />
      <Skeleton class="h-5" />
    </div>
    <p v-else-if="status === 'forbidden'" class="text-[11px] text-muted-foreground">
      Only group members can browse files; use a quick scope above.
    </p>
    <p v-else-if="status === 'unavailable'" class="text-[11px] text-muted-foreground">
      File browsing is not available on this node; use a quick scope above.
    </p>
    <p v-else-if="error" class="text-xs text-destructive">{{ error }}</p>
    <p v-else-if="!entries.length" class="text-[11px] text-muted-foreground">
      {{ prefix ? 'This folder is empty.' : 'This group has no buckets yet; use a quick scope above.' }}
    </p>
    <ul v-else class="space-y-0.5">
      <li v-for="entry in entries" :key="entry.permission_path">
        <template v-if="entry.kind === 'folder'">
          <div class="group flex items-center gap-1">
            <button
              type="button"
              class="flex min-w-0 items-center gap-1.5 rounded px-1.5 py-1 text-xs text-foreground hover:bg-muted"
              :aria-expanded="expanded.has(entry.permission_path)"
              @click="toggle(entry.permission_path)"
            >
              <ChevronRight :class="['h-3 w-3 shrink-0 transition-transform', expanded.has(entry.permission_path) && 'rotate-90']" />
              <Folder class="h-3.5 w-3.5 shrink-0 text-primary/70" />
              <span class="truncate font-mono">{{ nameOf(entry.permission_path) }}/</span>
            </button>
            <button
              type="button"
              :class="[
                'rounded px-1.5 py-0.5 text-[10px] transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100',
                selected?.includes(subtreeSuffix(entry.permission_path)) ? 'text-primary opacity-100' : 'text-muted-foreground opacity-0',
              ]"
              :title="`Select this folder, includes everything inside (${subtreeSuffix(entry.permission_path)})`"
              @click="emit('select', subtreeSuffix(entry.permission_path))"
            >
              select folder
            </button>
          </div>
          <div v-if="expanded.has(entry.permission_path)" class="ml-3.5 border-l border-border/60 pl-2">
            <DataPathTree
              :group-id="groupId"
              :path-prefix="pathPrefix"
              :prefix="expandPrefix(entry.permission_path)"
              :selected="selected"
              :depth="(depth ?? 0) + 1"
              @select="emit('select', $event)"
            />
          </div>
        </template>
        <button
          v-else
          type="button"
          :class="[
            'flex min-w-0 items-center gap-1.5 rounded px-1.5 py-1 text-xs hover:bg-muted hover:text-foreground',
            selected?.includes(suffixOf(entry.permission_path)) ? 'text-primary' : 'text-muted-foreground',
          ]"
          :title="`Select only this file (${suffixOf(entry.permission_path)})`"
          @click="emit('select', suffixOf(entry.permission_path))"
        >
          <span class="w-3 shrink-0" />
          <File class="h-3.5 w-3.5 shrink-0" />
          <span class="truncate font-mono">{{ nameOf(entry.permission_path) }}</span>
        </button>
      </li>
      <li v-if="nextToken">
        <button
          type="button"
          class="rounded px-1.5 py-1 text-[11px] font-medium text-primary hover:bg-muted disabled:opacity-60"
          :disabled="loadingMore"
          @click="load(true)"
        >
          {{ loadingMore ? 'Loading…' : 'Show more' }}
        </button>
      </li>
    </ul>
  </div>
</template>
