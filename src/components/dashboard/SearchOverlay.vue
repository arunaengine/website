<script lang="ts">
/**
 * Below the lg breakpoint the inline input is squeezed between the realm
 * switcher and the top-bar icons, so those widths use the compact trigger and
 * the full-width search panel instead.
 */
export const TOP_BAR_SEARCH_COLLAPSE_PX = 1024
</script>

<script setup lang="ts">
import Button from '@/components/ui/Button.vue'
import Badge from '@/components/ui/Badge.vue'
import Popover from '@/components/ui/Popover.vue'
import Select from '@/components/ui/Select.vue'
import Spinner from '@/components/ui/Spinner.vue'
import CoverageIcon from '@/components/search/CoverageIcon.vue'
import { useAruna } from '@/composables/useAruna'
import { useRealm } from '@/composables/useRealm'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { useSearchSettings } from '@/composables/useSearchSettings'
import { OBJECT_SEARCH_MODE_LABELS, useUnifiedSearch } from '@/composables/useUnifiedSearch'
import { truncateMiddle } from '@/lib/utils'
import { Search, Settings2, X } from '@lucide/vue'
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

const QUICK_KIND_LABELS: Record<QuickSection, string> = {
  datasets: 'Dataset',
  objects: 'Object',
  groups: 'Group',
  people: 'User',
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
const { objectSearchMode } = useSearchSettings()
const objectModeOptions = Object.entries(OBJECT_SEARCH_MODE_LABELS).map(([value, label]) => ({ value, label }))

// Quick search is server-backed only: the catalog is paged, so a client-side
// filter over it would silently answer from the first pages.
const {
  documents: quickDocuments,
  groups: quickGroups,
  users: quickUsers,
  objects: quickObjects,
  objectError: quickObjectError,
  objectSearched: quickObjectSearched,
  pending: quickPending,
  searched: quickSearched,
  error: quickError,
  complete: quickComplete,
  retry: retrySearch,
} = useUnifiedSearch(q, { limit: 5, includeObjects: true, objectMode: objectSearchMode })

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
    routeName: 'dataset',
    routeParams: { id: hit.document_id },
  })),
  ...quickObjects.value.map((hit): QuickItem => ({
    key: `o:${hit.issuer_node_id}:${hit.bucket}:${hit.key}`,
    section: 'objects',
    title: hit.key,
    subtitle: `${OBJECT_SEARCH_MODE_LABELS[hit.mode]} · Node: ${nodeDisplayName(hit.issuer_node_id)} · Group: ${truncateMiddle(hit.group_id)} · Bucket: ${hit.bucket}`,
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
    routeName: 'user',
    routeParams: { id: user.user_id },
  })),
])

// The previous matches stay listed while a new request runs, so they are dimmed
// rather than read as the answer to what was just typed.
const quickStale = computed(() => quickPending.value && items.value.length > 0)
// One icon carries the whole answer; the numbers live on the search page.
const quickCoverageShown = computed(() =>
  quickSearched.value || quickObjectSearched.value || Boolean(quickError.value),
)
const quickObjectErrorDetail = computed(() => {
  if (!quickObjectError.value) return ''
  const strict = objectSearchMode.value === 'distributed_strict'
    ? ' Strict mode did not fall back to best-effort.'
    : ''
  return `${OBJECT_SEARCH_MODE_LABELS[objectSearchMode.value]} unavailable.${strict} ${quickObjectError.value}`.trim()
})
// One line for the whole answer, so the flat list needs no section headers.
const quickSummary = computed(() =>
  ([
    ['datasets', quickDocuments.value.length],
    ['objects', quickObjects.value.length],
    ['groups', quickGroups.value.length],
    ['people', quickUsers.value.length],
  ] as Array<[QuickSection, number]>)
    .filter(([, count]) => count > 0)
    .map(([section, count]) => `${count} ${QUICK_KIND_LABELS[section].toLowerCase()}${count === 1 ? '' : 's'}`)
    .join(' · '),
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
  navigateAfterPanel(() => void router.push({ name: 'datasets', query: { q: term } }))
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
                aria-label="Search this realm, datasets and groups"
                role="combobox"
                aria-controls="quick-search-results"
                :aria-expanded="showResults"
                :aria-busy="quickPending"
                :aria-activedescendant="activeKey ? 'qs-' + activeKey : undefined"
                class="h-9 w-full rounded-md border border-input bg-field pl-8 pr-8 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:pr-16"
                :placeholder="`Search ${realm.shortName}, datasets, groups and users…`"
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
            <Popover v-if="authToken" align="end">
              <Button
                variant="ghost"
                size="icon"
                class="h-9 w-9 shrink-0"
                aria-label="Search settings"
                title="Search settings"
              >
                <Settings2 class="h-4 w-4" aria-hidden="true" />
              </Button>
              <template #content>
                <p class="mb-2 text-xs font-medium text-foreground">Object inventory mode</p>
                <Select
                  v-model="objectSearchMode"
                  :options="objectModeOptions"
                  aria-label="Object inventory search mode"
                  class="h-8 text-xs"
                />
                <p class="mt-2 text-[11px] text-muted-foreground">
                  How far data object search reaches across the realm's nodes, here and on the search page.
                </p>
              </template>
            </Popover>
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
            <p
              v-if="quickSummary"
              class="border-b border-border/70 px-3 py-1.5 text-[11px] text-muted-foreground transition-opacity"
              :class="quickStale ? 'opacity-40' : ''"
            >
              {{ quickSummary }}
            </p>
            <div
              id="quick-search-results"
              role="listbox"
              :aria-busy="quickPending"
              class="transition-opacity"
              :class="quickStale ? 'opacity-40' : ''"
            >
              <button
                v-for="item in items"
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
                  <div class="flex min-w-0 items-center gap-2">
                    <div class="min-w-0 flex-1 truncate font-medium text-foreground">
                      {{ item.title }}
                    </div>
                    <Badge variant="outline" size="sm" class="shrink-0">
                      {{ QUICK_KIND_LABELS[item.section] }}
                    </Badge>
                  </div>
                  <div v-if="item.subtitle" class="truncate text-xs text-muted-foreground">
                    {{ item.subtitle }}
                  </div>
                </div>
              </button>
            </div>
            <div v-if="quickPending && !items.length" class="px-3 py-2.5 text-xs text-muted-foreground">
              Searching…
            </div>
            <div v-if="q" class="border-t border-border bg-muted/30">
              <div
                class="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs font-medium text-primary hover:bg-muted"
              >
                <button
                  class="min-w-0 flex-1 truncate text-left"
                  @mousedown.prevent
                  @click="openSearchPage"
                >
                  See all results for "{{ q }}" in Search →
                </button>
                <div
                  v-if="quickCoverageShown"
                  role="status"
                  class="ml-auto flex shrink-0 items-center gap-1"
                >
                  <CoverageIcon compact :complete="quickComplete" @mousedown.prevent @click="openSearchPage" />
                  <Button
                    v-if="!quickComplete"
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
              </div>
              <p
                v-if="quickObjectError"
                role="status"
                :title="quickObjectErrorDetail"
                class="truncate border-t border-border/70 px-3 py-1.5 text-[10px] text-muted-foreground"
              >
                {{ quickObjectErrorDetail }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
