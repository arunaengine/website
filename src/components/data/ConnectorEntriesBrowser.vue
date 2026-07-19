<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Button from '@/components/ui/Button.vue'
import Badge from '@/components/ui/Badge.vue'
import ObjectIcon from '@/components/data/ObjectIcon.vue'
import { isUnsupportedEndpoint, useAruna } from '@/composables/useAruna'
import { formatBytes, relativeTime } from '@/lib/utils'
import { ApiError, type ConnectorEntry } from '@/lib/api'
import { ChevronRight, Folder, Home, Loader2, RefreshCw } from '@lucide/vue'

// Remote listing of a source connector's entries (agreed contract:
// GET /groups/{gid}/connectors/{cid}/entries?path=&limit=). Optionally
// multi-selectable — files and whole folders — for staged imports. On a node
// without the endpoint it emits `unsupported` so the caller can fall back to a
// typed source path; a 502/504 from the node (the source itself refused or
// cannot serve a listing) emits `list-failed` instead, keeping the browser
// visible for retries while the caller surfaces a manual path input.
const props = defineProps<{
  groupId: string
  connectorId: string
  selectable?: boolean
}>()

const emit = defineEmits<{
  (e: 'add', selection: { files: ConnectorEntry[]; dirs: ConnectorEntry[] }): void
  (e: 'unsupported'): void
  (e: 'list-failed'): void
}>()

const { listConnectorEntries } = useAruna()

const path = ref('')
const entries = ref<ConnectorEntry[]>([])
const truncated = ref(false)
const loading = ref(false)
const error = ref<string | null>(null)
const unsupported = ref(false)
const gatewayError = ref<string | null>(null)
const selected = ref<Map<string, ConnectorEntry>>(new Map())
let seq = 0

async function load() {
  if (!props.groupId || !props.connectorId) return
  const mySeq = ++seq
  loading.value = true
  error.value = null
  gatewayError.value = null
  try {
    const response = await listConnectorEntries(props.groupId, props.connectorId, path.value || undefined, 500)
    if (mySeq !== seq) return
    entries.value = response.entries
    truncated.value = response.truncated
    unsupported.value = false
  } catch (err) {
    if (mySeq !== seq) return
    entries.value = []
    truncated.value = false
    if (isUnsupportedEndpoint(err)) {
      unsupported.value = true
      emit('unsupported')
    } else if (err instanceof ApiError && (err.status === 502 || err.status === 504)) {
      gatewayError.value = err.message
      emit('list-failed')
    } else {
      error.value = err instanceof Error ? err.message : String(err)
    }
  } finally {
    if (mySeq === seq) loading.value = false
  }
}

watch(
  () => [props.groupId, props.connectorId],
  () => {
    path.value = ''
    selected.value = new Map()
    void load()
  },
  { immediate: true },
)
watch(path, () => void load())

// Path segments only; the root is the breadcrumb's home icon.
const crumbs = computed(() => {
  const parts = path.value.split('/').filter(Boolean)
  const out: Array<{ label: string; path: string }> = []
  let acc = ''
  for (const part of parts) {
    acc = acc ? `${acc}/${part}` : part
    out.push({ label: part, path: acc })
  }
  return out
})

function open(entry: ConnectorEntry) {
  if (entry.kind !== 'dir') return
  path.value = entry.path.replace(/\/+$/, '')
}

function toggle(entry: ConnectorEntry, checked: boolean) {
  const next = new Map(selected.value)
  if (checked) next.set(entry.path, entry)
  else next.delete(entry.path)
  selected.value = next
}

const selectedList = computed(() => [...selected.value.values()])

function addSelected() {
  const files = selectedList.value.filter((entry) => entry.kind === 'file')
  const dirs = selectedList.value.filter((entry) => entry.kind === 'dir')
  if (!files.length && !dirs.length) return
  emit('add', { files, dirs })
  selected.value = new Map()
}

defineExpose({ reload: load })
</script>

<template>
  <div>
    <div v-if="unsupported" class="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
      Browsing connector contents is not supported by this node yet.
    </div>
    <template v-else>
      <div class="flex items-center justify-between gap-2 pb-2">
        <nav class="flex min-w-0 flex-1 flex-wrap items-center gap-0.5 text-xs" aria-label="Connector path">
          <button
            type="button"
            class="rounded p-1 transition-colors hover:bg-muted"
            :class="crumbs.length ? 'text-muted-foreground' : 'text-foreground'"
            title="Connector root"
            aria-label="Go to connector root"
            @click="path = ''"
          >
            <Home class="h-3.5 w-3.5" />
          </button>
          <template v-for="(crumb, index) in crumbs" :key="crumb.path">
            <ChevronRight class="h-3 w-3 shrink-0 text-muted-foreground" />
            <button
              type="button"
              class="max-w-[10rem] truncate rounded px-1 py-0.5 font-mono transition-colors hover:bg-muted"
              :class="index === crumbs.length - 1 ? 'text-foreground' : 'text-muted-foreground'"
              @click="path = crumb.path"
            >
              {{ crumb.label }}
            </button>
          </template>
        </nav>
        <Button variant="ghost" size="sm" class="h-6 shrink-0 px-1.5 text-[10px]" :disabled="loading" @click="load">
          <RefreshCw class="h-3 w-3" :class="loading ? 'animate-spin' : ''" /> Reload
        </Button>
      </div>

      <div class="overflow-hidden rounded-md border border-border">
        <p v-if="error" class="border-b border-border px-3 py-2 text-xs text-destructive">{{ error }}</p>
        <div
          v-if="gatewayError"
          class="border-b border-border bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300"
        >
          The node reached the source, but listing failed: {{ gatewayError }}. Retry the browser or enter a path manually.
        </div>
        <div class="max-h-[260px] overflow-y-auto">
          <div v-if="loading && !entries.length" class="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
            <Loader2 class="h-3.5 w-3.5 animate-spin" /> Listing…
          </div>
          <table v-else class="w-full text-sm">
            <tbody>
              <tr v-for="entry in entries" :key="entry.path" class="border-t border-border first:border-t-0 hover:bg-muted/30">
                <td v-if="selectable" class="w-8 px-2 py-1.5">
                  <input
                    type="checkbox"
                    class="h-3.5 w-3.5 rounded border-border accent-primary"
                    :checked="selected.has(entry.path)"
                    :aria-label="`Select ${entry.name}`"
                    @change="toggle(entry, ($event.target as HTMLInputElement).checked)"
                  />
                </td>
                <td class="px-2 py-1.5">
                  <button
                    v-if="entry.kind === 'dir'"
                    type="button"
                    class="flex items-center gap-2 text-left text-xs text-foreground hover:underline"
                    @click="open(entry)"
                  >
                    <Folder class="h-4 w-4 shrink-0 text-primary" /> {{ entry.name }}/
                  </button>
                  <span v-else class="flex items-center gap-2 text-xs">
                    <ObjectIcon :name="entry.name" class="h-4 w-4" /> <span class="truncate">{{ entry.name }}</span>
                  </span>
                </td>
                <td class="px-2 py-1.5 text-right font-mono text-[11px] text-muted-foreground">
                  {{ entry.kind === 'file' && entry.size !== undefined ? formatBytes(entry.size) : '-' }}
                </td>
                <td class="px-2 py-1.5 text-right text-[11px] text-muted-foreground">
                  {{ entry.modified_ms ? relativeTime(new Date(entry.modified_ms).toISOString()) : '-' }}
                </td>
              </tr>
              <tr v-if="!loading && !entries.length && !gatewayError">
                <td :colspan="selectable ? 4 : 3" class="px-3 py-6 text-center text-xs text-muted-foreground">This folder is empty.</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-if="truncated" class="border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">
          Listing truncated, open a folder to narrow it down.
        </div>
      </div>

      <div v-if="selectable" class="mt-2 flex items-center justify-between gap-2">
        <span class="text-[11px] text-muted-foreground">
          {{ selectedList.length ? `${selectedList.length} selected` : 'Select files or folders to import.' }}
        </span>
        <Button size="sm" :disabled="!selectedList.length" @click="addSelected">
          Add {{ selectedList.length || '' }} to basket
          <Badge v-if="selectedList.some((entry) => entry.kind === 'dir')" variant="outline" class="ml-1 text-[10px]">incl. folders</Badge>
        </Button>
      </div>
    </template>
  </div>
</template>
