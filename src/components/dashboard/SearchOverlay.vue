<script lang="ts">
/**
 * Browser measurements found the inline input overlapping adjacent controls at
 * 414 px, while it and its wrapper both fit at 480 px. Widths below this value
 * therefore use the compact trigger and top search panel.
 */
export const TOP_BAR_SEARCH_COLLAPSE_PX = 480
</script>

<script setup lang="ts">
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Select from '@/components/ui/Select.vue'
import Spinner from '@/components/ui/Spinner.vue'
import ObjectCoverageStatus from '@/components/search/ObjectCoverageStatus.vue'
import { useAruna } from '@/composables/useAruna'
import { useRealm } from '@/composables/useRealm'
import { useRealmNodes } from '@/composables/useRealmNodes'
import {
  DEFAULT_OBJECT_SEARCH_MODE,
  OBJECT_SEARCH_MODE_LABELS,
  useUnifiedSearch,
} from '@/composables/useUnifiedSearch'
import { truncateMiddle } from '@/lib/utils'
import type { ObjectSearchMode } from '@/lib/api'
import { File, FileJson2, Search, UserRound, Users, X } from '@lucide/vue'
import { useMediaQuery } from '@vueuse/core'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

type QuickSection = 'datasets' | 'objects' | 'groups' | 'people'

interface QuickItem {
  key: string
  section: QuickSection
  title: string
  subtitle?: string
  routeName: string
  routeParams: Record<string, string>
  routeQuery?: Record<string, string>
}

const PANEL_HISTORY_KEY = '__arunaGlobalSearchPanel'
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

const q = ref('')
const showResults = ref(false)
const panelOpen = ref(false)
const activeIndex = ref(-1)
const triggerEl = ref<HTMLElement | null>(null)
const inputEl = ref<HTMLInputElement | null>(null)
const panelEl = ref<HTMLElement | null>(null)
const wrapperEl = ref<HTMLElement | null>(null)
const isNarrowSearch = useMediaQuery(`(max-width: ${TOP_BAR_SEARCH_COLLAPSE_PX - 0.02}px)`)
const { realm } = useRealm()
const { authToken } = useAruna()
const { displayName: nodeDisplayName, isLocalNode } = useRealmNodes()
const router = useRouter()
const quickObjectMode = ref<ObjectSearchMode>(DEFAULT_OBJECT_SEARCH_MODE)
const objectModeOptions = Object.entries(OBJECT_SEARCH_MODE_LABELS).map(([value, label]) => ({ value, label }))

// Quick search is server-backed only: the catalog is paged, so a client-side
// filter over it would silently answer from the first pages.
const {
  documents: quickDocuments,
  groups: quickGroups,
  users: quickUsers,
  objects: quickObjects,
  objectCoverage: quickObjectCoverage,
  objectError: quickObjectError,
  objectSearched: quickObjectSearched,
  pending: quickPending,
  searched: quickSearched,
  error: quickError,
  nodesQueried: quickNodesQueried,
  nodesFailed: quickNodesFailed,
  truncated: quickTruncated,
  retry: retrySearch,
} = useUnifiedSearch(q, { limit: 5, includeObjects: true, objectMode: quickObjectMode })

function objectParentPrefix(key: string): string | undefined {
  const separator = key.lastIndexOf('/')
  return separator > 0 ? key.slice(0, separator) : undefined
}

const items = computed<QuickItem[]>(() => [
  ...quickDocuments.value.map((hit): QuickItem => ({
    key: `d:${hit.document_id}`,
    section: 'datasets',
    title: hit.title || hit.document_path,
    subtitle: hit.snippet ?? undefined,
    routeName: 'metadata-detail',
    routeParams: { id: hit.document_id },
  })),
  ...quickObjects.value.map((hit): QuickItem => ({
    key: `o:${hit.issuer_node_id}:${hit.bucket}:${hit.key}`,
    section: 'objects',
    title: hit.key,
    subtitle: `Object · ${OBJECT_SEARCH_MODE_LABELS[hit.mode]} · Node: ${nodeDisplayName(hit.issuer_node_id)} · Group: ${truncateMiddle(hit.group_id)} · Bucket: ${hit.bucket}`,
    routeName: 'bucket',
    routeParams: { bucketId: hit.bucket },
    routeQuery: {
      group: hit.group_id,
      ...(!isLocalNode(hit.issuer_node_id) ? { node: hit.issuer_node_id } : {}),
      ...(objectParentPrefix(hit.key) ? { prefix: objectParentPrefix(hit.key) as string } : {}),
    },
  })),
  ...quickGroups.value.map((group): QuickItem => ({
    key: `g:${group.group_id}`,
    section: 'groups',
    title: group.display_name,
    routeName: 'groups',
    routeParams: { id: group.group_id },
  })),
  ...quickUsers.value.map((user): QuickItem => ({
    key: `u:${user.user_id}`,
    section: 'people',
    title: user.name,
    routeName: 'user-profile',
    routeParams: { id: user.user_id },
  })),
])

// The previous matches stay listed while a new request runs, so they are dimmed
// rather than read as the answer to what was just typed.
const quickStale = computed(() => quickPending.value && items.value.length > 0)
const quickCoverage = computed<'Complete' | 'Partial' | 'Unavailable' | null>(() => {
  if (quickError.value) return 'Unavailable'
  if (!quickSearched.value) return null
  return quickNodesFailed.value > 0 || quickTruncated.value ? 'Partial' : 'Complete'
})
const quickCoverageDetail = computed(() => {
  if (quickCoverage.value === 'Unavailable') return quickError.value ?? 'Search is unavailable.'
  if (quickCoverage.value !== 'Partial') return 'All document nodes answered'
  const details: string[] = []
  if (quickNodesFailed.value > 0) {
    details.push(
      `${Math.max(0, quickNodesQueried.value - quickNodesFailed.value)} of ${quickNodesQueried.value} nodes answered`,
    )
  }
  if (quickTruncated.value) details.push('document results were truncated')
  return details.join('; ')
})

const quickObjectCoverageStatus = computed<'Complete' | 'Partial' | 'Unavailable' | null>(() => {
  if (quickObjectError.value) return 'Unavailable'
  if (!quickObjectSearched.value || !quickObjectCoverage.value) return null
  return quickObjectCoverage.value.complete && !quickObjectCoverage.value.truncated ? 'Complete' : 'Partial'
})
const quickObjectErrorDetail = computed(() => {
  if (!quickObjectError.value) return ''
  const strict = quickObjectMode.value === 'distributed_strict'
    ? ' Strict mode did not fall back to best-effort.'
    : ''
  return `${OBJECT_SEARCH_MODE_LABELS[quickObjectMode.value]} unavailable.${strict} ${quickObjectError.value}`.trim()
})

const SECTION_META: Array<{ id: QuickSection; label: string }> = [
  { id: 'datasets', label: 'Datasets' },
  { id: 'objects', label: 'Data objects' },
  { id: 'groups', label: 'Groups' },
  { id: 'people', label: 'People' },
]
const sections = computed(() =>
  SECTION_META
    .map((meta) => ({ ...meta, items: items.value.filter((item) => item.section === meta.id) }))
    .filter((section) =>
      section.items.length ||
      (section.id === 'objects' && (quickObjectSearched.value || Boolean(quickObjectError.value))),
    ),
)
const activeKey = computed(() => items.value[activeIndex.value]?.key ?? null)

watch(items, () => (activeIndex.value = -1))
watch(q, () => (activeIndex.value = -1))
watch(isNarrowSearch, (narrow) => {
  if (!narrow && panelOpen.value) requestPanelClose(false)
})

let ownsHistoryEntry = false
let restoreTriggerAfterClose = true
let afterClose: (() => void) | null = null

function finishPanelClose() {
  panelOpen.value = false
  showResults.value = false
  const shouldRestoreTrigger = restoreTriggerAfterClose
  const callback = afterClose
  restoreTriggerAfterClose = true
  afterClose = null
  void nextTick(() => {
    if (shouldRestoreTrigger) triggerEl.value?.focus()
    callback?.()
  })
}

function onPopState() {
  if (!panelOpen.value) return
  ownsHistoryEntry = false
  finishPanelClose()
}

async function openPanel(event: MouseEvent) {
  triggerEl.value = event.currentTarget as HTMLElement
  if (panelOpen.value) return
  const state = window.history.state
  window.history.pushState(
    { ...(state && typeof state === 'object' ? state : {}), [PANEL_HISTORY_KEY]: true },
    '',
  )
  ownsHistoryEntry = true
  panelOpen.value = true
  showResults.value = true
  await nextTick()
  inputEl.value?.focus()
}

function requestPanelClose(restoreTrigger = true, callback: (() => void) | null = null) {
  if (!panelOpen.value) {
    callback?.()
    return
  }
  restoreTriggerAfterClose = restoreTrigger
  afterClose = callback
  if (ownsHistoryEntry) {
    ownsHistoryEntry = false
    window.history.back()
  } else {
    finishPanelClose()
  }
}

function navigateAfterPanel(callback: () => void) {
  if (panelOpen.value) requestPanelClose(false, callback)
  else callback()
}

function openItem(item: QuickItem) {
  showResults.value = false
  q.value = ''
  navigateAfterPanel(() => void router.push({
    name: item.routeName,
    params: item.routeParams,
    query: item.routeQuery,
  }))
}

function openSearchPage() {
  const term = q.value
  showResults.value = false
  q.value = ''
  navigateAfterPanel(() => void router.push({ name: 'search', query: { q: term } }))
}

function onInputKeydown(event: KeyboardEvent) {
  const list = items.value
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    showResults.value = true
    activeIndex.value = list.length ? (activeIndex.value + 1) % list.length : -1
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    activeIndex.value = list.length ? (activeIndex.value - 1 + list.length) % list.length : -1
  } else if (event.key === 'Enter') {
    const item = list[activeIndex.value]
    if (item) openItem(item)
    else if (q.value.trim()) openSearchPage()
  } else if (event.key === 'Escape') {
    showResults.value = false
  }
}

function onPanelKeydown(event: KeyboardEvent) {
  if (!isNarrowSearch.value || !panelOpen.value) return
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    requestPanelClose()
    return
  }
  if (event.key !== 'Tab') return

  const focusable = Array.from(panelEl.value?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [])
  if (!focusable.length) {
    event.preventDefault()
    return
  }
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  const active = document.activeElement
  if (!panelEl.value?.contains(active)) {
    event.preventDefault()
    const fallback = event.shiftKey ? last : first
    fallback.focus()
  } else if (event.shiftKey && active === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && active === last) {
    event.preventDefault()
    first.focus()
  }
}

// Hide results only when focus leaves the whole search wrapper (input plus the
// result buttons), so keyboard users can Tab into a result.
function onSearchFocusOut(event: FocusEvent) {
  const next = event.relatedTarget as Node | null
  const portaledSelect = (next as Element | null)?.closest?.(
    '[data-radix-popper-content-wrapper], [role="listbox"]',
  )
  if (!next || (!wrapperEl.value?.contains(next) && !portaledSelect)) showResults.value = false
}

onMounted(() => window.addEventListener('popstate', onPopState))
onBeforeUnmount(() => {
  window.removeEventListener('popstate', onPopState)
  // Unmounting while open (a route change closes the layout) would otherwise
  // strand the pushed entry and make the next Back a no-op.
  if (ownsHistoryEntry) {
    ownsHistoryEntry = false
    window.history.back()
  }
})
</script>

<template>
  <Button
    v-if="isNarrowSearch"
    v-show="!panelOpen"
    variant="outline"
    size="icon"
    class="mr-auto h-9 w-9 shrink-0"
    aria-label="Open global search"
    aria-haspopup="dialog"
    :aria-expanded="panelOpen"
    title="Search"
    @click="openPanel"
  >
    <Search class="h-4 w-4" aria-hidden="true" />
  </Button>

  <Teleport to="body" :disabled="!isNarrowSearch">
    <div
      v-if="!isNarrowSearch || panelOpen"
      :class="
        isNarrowSearch
          ? 'fixed inset-0 z-50 bg-background/80 backdrop-blur-sm'
          : 'relative min-w-0 max-w-xl flex-1'
      "
      @click.self="requestPanelClose()"
    >
      <div
        ref="panelEl"
        :role="isNarrowSearch ? 'dialog' : undefined"
        :aria-modal="isNarrowSearch ? 'true' : undefined"
        :aria-label="isNarrowSearch ? 'Global search' : undefined"
        :class="
          isNarrowSearch
            ? 'w-full border-b border-border/80 bg-background/95 shadow-xl backdrop-blur-xl'
            : 'contents'
        "
        @keydown="onPanelKeydown"
      >
        <div
          ref="wrapperEl"
          class="relative"
          :class="isNarrowSearch ? 'mx-auto w-full max-w-[1400px] p-3' : ''"
          @focusout="onSearchFocusOut"
        >
          <div class="flex items-center gap-2">
            <div class="relative min-w-0 flex-1">
              <Search
                class="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                ref="inputEl"
                v-model="q"
                aria-label="Search this realm, metadata and groups"
                role="combobox"
                aria-controls="quick-search-results"
                :aria-expanded="showResults"
                :aria-busy="quickPending"
                :aria-activedescendant="activeKey ? 'qs-' + activeKey : undefined"
                class="h-9 w-full rounded-md border border-input bg-field pl-8 pr-8 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:pr-16"
                :placeholder="`Search ${realm.shortName}, datasets, groups and people…`"
                @focus="showResults = true"
                @keydown="onInputKeydown"
              />
              <Spinner
                v-if="quickPending"
                label="Searching…"
                class="absolute right-2 top-1/2 -translate-y-1/2 text-primary sm:right-11"
              />
              <kbd
                aria-hidden="true"
                class="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 items-center gap-1 rounded border border-border bg-muted/70 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline-flex"
              >
                ⌘K
              </kbd>
            </div>
            <Button
              v-if="isNarrowSearch"
              variant="ghost"
              size="icon"
              class="h-9 w-9 shrink-0"
              aria-label="Close global search"
              @click="requestPanelClose()"
            >
              <X class="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>

          <div
            v-if="showResults && (items.length || q)"
            :class="[
              'left-0 right-0 z-40 rounded-md border border-border bg-popover shadow-xl',
              isNarrowSearch
                ? 'mt-3 max-h-[calc(100dvh-4.75rem)] overflow-y-auto'
                : 'absolute top-11 overflow-hidden',
            ]"
          >
            <div
              v-if="authToken && q.trim().length >= 2"
              class="flex items-center justify-between gap-2 border-b border-border/70 px-3 py-1.5"
            >
              <span class="text-[10px] font-medium text-muted-foreground">Object inventory mode</span>
              <Select
                v-model="quickObjectMode"
                :options="objectModeOptions"
                aria-label="Object inventory search mode"
                class="h-7 w-auto text-[10px]"
              />
            </div>
            <div
              v-if="quickCoverage"
              role="status"
              class="flex items-center gap-2 border-b border-border/70 px-3 py-1.5 text-[10px] text-muted-foreground"
            >
              <Badge
                :variant="
                  quickCoverage === 'Complete' ? 'success' : quickCoverage === 'Partial' ? 'warn' : 'destructive'
                "
                class="px-1.5 py-0 text-[9px] uppercase"
              >
                {{ quickCoverage }}
              </Badge>
              <span class="min-w-0 flex-1 truncate" :title="quickCoverageDetail">{{ quickCoverageDetail }}</span>
              <Button
                v-if="quickCoverage !== 'Complete'"
                variant="ghost"
                size="sm"
                class="h-8 shrink-0 px-2 text-[10px]"
                :disabled="quickPending"
                @mousedown.prevent
                @click="retrySearch"
              >
                Retry
              </Button>
            </div>
            <div id="quick-search-results" role="listbox" :aria-busy="quickPending">
              <div
                v-for="section in sections"
                :key="section.id"
                role="group"
                :aria-label="section.label"
                class="transition-opacity"
                :class="quickStale ? 'opacity-40' : ''"
              >
                <div
                  class="flex items-center gap-1.5 border-b border-border/70 bg-muted/30 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  <FileJson2 v-if="section.id === 'datasets'" class="h-3 w-3" aria-hidden="true" />
                  <File v-else-if="section.id === 'objects'" class="h-3 w-3" aria-hidden="true" />
                  <Users v-else-if="section.id === 'groups'" class="h-3 w-3" aria-hidden="true" />
                  <UserRound v-else class="h-3 w-3" aria-hidden="true" />
                  {{ section.label }}
                </div>
                <div
                  v-if="section.id === 'objects' && quickObjectCoverageStatus"
                  role="status"
                  class="border-b border-border/70 bg-muted/20 px-3 py-2 text-[10px] text-muted-foreground"
                >
                  <ObjectCoverageStatus :coverage="quickObjectCoverage" :status="quickObjectCoverageStatus" compact>
                    <span v-if="quickObjectError" class="min-w-0 flex-1">{{ quickObjectErrorDetail }}</span>
                    <span v-else-if="quickObjectCoverageStatus === 'Partial'" class="min-w-0 flex-1">Partial object inventory.</span>
                    <Button
                      v-if="quickObjectCoverageStatus !== 'Complete'"
                      variant="ghost"
                      size="sm"
                      class="h-7 shrink-0 px-2 text-[10px]"
                      :disabled="quickPending"
                      @mousedown.prevent
                      @click="retrySearch"
                    >
                      Retry
                    </Button>
                  </ObjectCoverageStatus>
                </div>
                <button
                  v-for="item in section.items"
                  :id="'qs-' + item.key"
                  :key="item.key"
                  role="option"
                  :aria-selected="activeKey === item.key"
                  :class="[
                    'flex w-full items-start gap-3 border-b border-border/70 px-3 py-2.5 text-left text-sm last:border-0 hover:bg-muted',
                    activeKey === item.key ? 'bg-muted' : '',
                  ]"
                  @mousedown.prevent
                  @click="openItem(item)"
                >
                  <div class="flex-1 overflow-hidden">
                    <div class="truncate font-medium text-foreground">{{ item.title }}</div>
                    <div v-if="item.subtitle" class="truncate text-xs text-muted-foreground">{{ item.subtitle }}</div>
                  </div>
                </button>
                <p
                  v-if="section.id === 'objects' && quickObjectSearched && !section.items.length && !quickPending && !quickObjectError"
                  class="border-b border-border/70 px-3 py-2.5 text-xs text-muted-foreground"
                >
                  {{ quickObjectCoverageStatus === 'Partial'
                    ? 'No visible live object was returned. Coverage is incomplete.'
                    : 'No visible live object matched this query.' }}
                </p>
              </div>
            </div>
            <div v-if="quickPending && !items.length" class="px-3 py-2.5 text-xs text-muted-foreground">
              Searching…
            </div>
            <button
              v-if="q"
              class="flex w-full items-center gap-2 border-t border-border bg-muted/30 px-3 py-2.5 text-left text-xs font-medium text-primary hover:bg-muted"
              @mousedown.prevent
              @click="openSearchPage"
            >
              See all results for "{{ q }}" in Search →
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
