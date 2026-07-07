<script setup lang="ts">
import PageHeader from '@/components/dashboard/PageHeader.vue'
import Button from '@/components/ui/Button.vue'
import Badge from '@/components/ui/Badge.vue'
import Select from '@/components/ui/Select.vue'
import Textarea from '@/components/ui/Textarea.vue'
import KBD from '@/components/ui/KBD.vue'
import Tabs from '@/components/ui/Tabs.vue'
import TabsList from '@/components/ui/TabsList.vue'
import TabsTrigger from '@/components/ui/TabsTrigger.vue'
import TabsContent from '@/components/ui/TabsContent.vue'
import DropdownMenu from '@/components/ui/DropdownMenu.vue'
import DropdownMenuTrigger from '@/components/ui/DropdownMenuTrigger.vue'
import DropdownMenuContent from '@/components/ui/DropdownMenuContent.vue'
import DropdownMenuItem from '@/components/ui/DropdownMenuItem.vue'
import DropdownMenuSeparator from '@/components/ui/DropdownMenuSeparator.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import {
  SquareTerminal,
  Compass,
  Play,
  LoaderCircle,
  History,
  Eraser,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  CircleX,
  ExternalLink,
  Braces,
  TableProperties,
} from '@lucide/vue'
import { useAruna, readableIri } from '@/composables/useAruna'
import { ApiError, type SparqlResponse, type SparqlQueryMode } from '@/lib/api'
import {
  DEFAULT_SELECT_LIMIT,
  EXAMPLE_QUERIES,
  ensureSelectLimit,
  orderColumns,
  parseQuerySlice,
  parseSparqlTerm,
  withQuerySlice,
  loadQueryHistory,
  pushQueryHistory,
  clearQueryHistory,
  type ExampleQuery,
  type QueryHistoryEntry,
} from '@/lib/sparql'
import { formatNumber, relativeTime, truncateMiddle } from '@/lib/utils'

const route = useRoute()
const router = useRouter()
const { metadata, runSparqlQuery } = useAruna()

const sparql = ref<string>(EXAMPLE_QUERIES[0].query)
const scope = ref<'realm' | 'document'>('realm')
const documentId = ref<string>('')
const mode = ref<SparqlQueryMode>('distributed')
const running = ref(false)
const result = ref<SparqlResponse | null>(null)
// The exact text/scope/mode that produced `result` (columns/paging derive from
// them, not from the live editor content).
const ranQuery = ref('')
const ranScopeLabel = ref('')
const ranMode = ref<SparqlQueryMode>('distributed')
const tookMs = ref(0)
const error = ref<string | null>(null)
const errorStatus = ref<number | null>(null)
const resultsView = ref<'table' | 'json'>('table')
const history = ref<QueryHistoryEntry[]>(loadQueryHistory())

// Deep link: /app/query?document=<id> preselects the single-document scope.
if (typeof route.query.document === 'string' && route.query.document) {
  scope.value = 'document'
  documentId.value = route.query.document
}
// Mirror the scope selection back into the URL so console links stay shareable.
watch([scope, documentId], () => {
  void router.replace({
    query: {
      ...route.query,
      document: scope.value === 'document' && documentId.value ? documentId.value : undefined,
    },
  })
})

const SCOPE_OPTIONS = [
  { value: 'realm', label: 'Whole realm' },
  { value: 'document', label: 'Single document' },
]
const MODE_OPTIONS = [
  { value: 'distributed', label: 'All nodes — merged, best effort' },
  { value: 'local', label: 'This node only — exact paging' },
]

// Catalog documents, plus a synthetic option when the selected id is not in the
// loaded catalog (private doc, projection lag, deep link) so the selection never
// silently disappears — the backend enforces access and surfaces 403/404.
const documentOptions = computed(() => {
  const options = metadata.value.map((doc) => ({ value: doc.ulid, label: doc.title || doc.ulid }))
  if (documentId.value && !options.some((o) => o.value === documentId.value)) {
    options.unshift({ value: documentId.value, label: truncateMiddle(documentId.value) })
  }
  return options
})

const canRun = computed(
  () => !running.value && Boolean(sparql.value.trim()) && !(scope.value === 'document' && !documentId.value),
)

async function runQuery() {
  if (running.value) return
  if (scope.value === 'document' && !documentId.value) return
  // Visible client-side guardrail: inject LIMIT 100 into SELECTs without one.
  sparql.value = ensureSelectLimit(sparql.value)
  const query = sparql.value
  running.value = true
  error.value = null
  errorStatus.value = null
  const started = performance.now()
  try {
    const scopeKey = scope.value === 'document' ? documentId.value : 'realm'
    const response = await runSparqlQuery(query, {
      documentId: scope.value === 'document' ? documentId.value : undefined,
      mode: mode.value,
    })
    tookMs.value = Math.max(1, Math.round(performance.now() - started))
    result.value = response
    ranQuery.value = query
    ranScopeLabel.value = scopeKey === 'realm' ? 'realm' : truncateMiddle(scopeKey)
    ranMode.value = mode.value
    resultsView.value = 'table'
    history.value = pushQueryHistory({ query, scope: scopeKey, mode: mode.value, at: Date.now() })
  } catch (err) {
    result.value = null
    error.value = err instanceof Error ? err.message : String(err)
    errorStatus.value = err instanceof ApiError ? err.status : null
  } finally {
    running.value = false
  }
}

const errorHint = computed(() => {
  if (!error.value) return ''
  // DoD path for future backend cap/timeout guardrails (rendered verbatim above).
  if (/limit|cap|row|timeout|too (?:many|large|long)|budget/i.test(error.value)) {
    return 'The server rejected or truncated this query. Page through large result sets instead: add or lower LIMIT and use OFFSET — the Prev/Next controls below rewrite them for you.'
  }
  if (errorStatus.value === 400) {
    return 'Only SELECT and ASK query forms are accepted, and any PREFIX you use must be declared in the query.'
  }
  if (errorStatus.value === 503 && scope.value === 'document') {
    return 'The document graph is still being prepared — try again in a moment.'
  }
  if (errorStatus.value === 401 || errorStatus.value === 403) {
    return 'This document is not public. Sign in with an account that can read it.'
  }
  return ''
})

// ---- result shaping (avoid discriminated-union narrowing in the template) ----

interface RenderCell {
  kind: 'link' | 'external' | 'literal' | 'blank' | 'unbound'
  text: string
  title: string
  href: string
  documentId: string
  suffix: string
}

function renderCell(raw: string | undefined): RenderCell {
  const term = parseSparqlTerm(raw)
  switch (term.type) {
    case 'iri':
      if (term.documentId) {
        return { kind: 'link', text: term.value, title: term.value, href: '', documentId: term.documentId, suffix: '' }
      }
      // Graph content is user-authored, so only http(s) IRIs become clickable
      // anchors — a hostile document could otherwise plant javascript:/data:
      // IRIs that rel="noopener" does not neutralize. Everything else renders
      // as an inert monospace literal with the full IRI preserved.
      if (/^https?:\/\//i.test(term.value)) {
        return { kind: 'external', text: term.value, title: term.value, href: term.value, documentId: '', suffix: '' }
      }
      return { kind: 'literal', text: term.value, title: term.value, href: '', documentId: '', suffix: '' }
    case 'literal':
      return {
        kind: 'literal',
        text: term.value,
        title: raw ?? term.value,
        href: '',
        documentId: '',
        suffix: term.lang ? `@${term.lang}` : term.datatype ? readableIri(term.datatype) : '',
      }
    case 'blank':
      return { kind: 'blank', text: term.value, title: term.value, href: '', documentId: '', suffix: '' }
    default:
      return { kind: 'unbound', text: '—', title: '', href: '', documentId: '', suffix: '' }
  }
}

const isSolutions = computed(() => result.value?.kind === 'Solutions')
const solutionRows = computed(() => (result.value?.kind === 'Solutions' ? result.value.value : null))
const booleanValue = computed<boolean | null>(() =>
  result.value?.kind === 'Boolean' ? result.value.value : null,
)
const nodesQueried = computed(() => result.value?.nodes_queried ?? 0)
const nodesFailed = computed(() => result.value?.nodes_failed ?? 0)
const columns = computed(() => (solutionRows.value ? orderColumns(ranQuery.value, solutionRows.value) : []))
const tableRows = computed<RenderCell[][]>(() => {
  const rows = solutionRows.value
  if (!rows) return []
  const cols = columns.value
  return rows.map((row) => cols.map((col) => renderCell(row[col])))
})
const rowCount = computed(() => solutionRows.value?.length ?? 0)

// ---- paging (rewrites LIMIT/OFFSET inside the query — no second cursor) ----

const slice = computed(() => parseQuerySlice(ranQuery.value))
const pageLabel = computed(() => {
  const { limit, offset } = slice.value
  if (limit === null) return ''
  return offset % limit === 0 ? `page ${offset / limit + 1}` : `rows ${offset + 1}–${offset + limit}`
})
const canPrev = computed(() => slice.value.offset > 0)
const canNext = computed(() => {
  const { limit } = slice.value
  return limit !== null && rowCount.value >= limit
})

function goPage(direction: 1 | -1) {
  const { limit, offset } = slice.value
  const effective = limit ?? DEFAULT_SELECT_LIMIT
  const next = Math.max(0, offset + direction * effective)
  if (next === offset) return
  // Paging rewrites LIMIT/OFFSET inside the query itself — there is no second cursor system (issue #259).
  sparql.value = withQuerySlice(ranQuery.value, effective, next)
  void runQuery()
}

// ---- toolbar actions ----

function applyExample(example: ExampleQuery) {
  sparql.value = example.query
}

function applyHistory(entry: QueryHistoryEntry) {
  sparql.value = entry.query
  mode.value = entry.mode
  if (entry.scope === 'realm') {
    scope.value = 'realm'
  } else {
    scope.value = 'document'
    documentId.value = entry.scope
  }
}

function clearHistory() {
  clearQueryHistory()
  history.value = []
}

function firstLine(query: string): string {
  const line = query.split('\n').map((l) => l.trim()).find(Boolean) ?? query
  return line.length > 60 ? `${line.slice(0, 60)}…` : line
}
</script>

<template>
  <div>
    <PageHeader
      title="Query console"
      description="Run SPARQL SELECT or ASK queries against the realm's metadata graphs — signed out you see public graphs only."
    >
      <template #actions>
        <RouterLink :to="{ name: 'search' }">
          <Button variant="outline"><Compass class="h-4 w-4" /> Discover</Button>
        </RouterLink>
      </template>
    </PageHeader>

    <div class="container space-y-6 py-8">
      <section class="surface space-y-3 p-4">
        <div class="flex flex-wrap items-end gap-3">
          <label class="flex flex-col gap-1 text-[11px] text-muted-foreground">
            <span>Scope</span>
            <Select
              :model-value="scope"
              :options="SCOPE_OPTIONS"
              class="w-48"
              @update:model-value="(v: string) => (scope = v as 'realm' | 'document')"
            />
          </label>
          <label v-if="scope === 'document'" class="flex flex-col gap-1 text-[11px] text-muted-foreground">
            <span>Document</span>
            <Select
              v-model="documentId"
              :options="documentOptions"
              placeholder="Choose a document"
              class="w-72 max-w-full"
            />
          </label>
          <label class="flex flex-col gap-1 text-[11px] text-muted-foreground">
            <span>Mode</span>
            <Select
              :model-value="mode"
              :options="MODE_OPTIONS"
              class="w-64"
              @update:model-value="(v: string) => (mode = v as SparqlQueryMode)"
            />
          </label>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button variant="outline" size="sm"><Sparkles class="h-3.5 w-3.5" /> Examples</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem
                v-for="example in EXAMPLE_QUERIES"
                :key="example.label"
                @select="applyExample(example)"
              >
                {{ example.label }}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button variant="outline" size="sm"><History class="h-3.5 w-3.5" /> History</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" class="w-80 max-w-[calc(100vw-2rem)]">
              <template v-if="history.length">
                <DropdownMenuItem
                  v-for="(entry, index) in history"
                  :key="index"
                  class="flex-col items-start gap-0.5"
                  @select="applyHistory(entry)"
                >
                  <span class="w-full truncate font-mono text-xs">{{ firstLine(entry.query) }}</span>
                  <span class="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <Badge variant="outline" class="text-[9px]">
                      {{ entry.scope === 'realm' ? 'realm' : truncateMiddle(entry.scope) }}
                    </Badge>
                    {{ relativeTime(new Date(entry.at).toISOString()) }}
                  </span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem @select="clearHistory"><Eraser class="h-3.5 w-3.5" /> Clear history</DropdownMenuItem>
              </template>
              <DropdownMenuItem v-else disabled>No queries yet</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button class="ml-auto" :disabled="!canRun" @click="runQuery">
            <template v-if="running"><LoaderCircle class="h-4 w-4 animate-spin" /> Running…</template>
            <template v-else><Play class="h-4 w-4" /> Run <KBD class="ml-1">Ctrl/⌘ ↵</KBD></template>
          </Button>
        </div>

        <Textarea
          v-model="sparql"
          :rows="12"
          spellcheck="false"
          class="text-[12.5px]"
          @keydown.ctrl.enter.prevent="runQuery()"
          @keydown.meta.enter.prevent="runQuery()"
        />
        <p class="text-[11px] text-muted-foreground">
          Only SELECT and ASK are accepted. Queries must declare their own PREFIXes. A LIMIT 100 is added to SELECT queries that have none.
        </p>

        <div v-if="error">
          <ErrorPanel :message="error" retry-label="" />
          <p v-if="errorHint" class="mt-2 text-xs text-muted-foreground">{{ errorHint }}</p>
        </div>
      </section>

      <section v-if="result" class="surface overflow-hidden">
        <Tabs
          :model-value="resultsView"
          @update:model-value="(v: string) => (resultsView = v as 'table' | 'json')"
        >
          <header
            class="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-muted/20 px-4 py-2.5 text-[11px] text-muted-foreground"
          >
            <Badge variant="secondary" class="uppercase">{{ isSolutions ? 'SELECT' : 'ASK' }}</Badge>
            <span v-if="isSolutions">{{ formatNumber(rowCount) }} rows</span>
            <span>{{ tookMs }} ms</span>
            <span class="font-mono">scope: {{ ranScopeLabel }}</span>
            <span>mode: {{ ranMode }}</span>
            <Badge v-if="nodesFailed > 0" variant="warn">
              partial — {{ nodesFailed }}/{{ nodesQueried }} nodes failed
            </Badge>
            <TabsList class="ml-auto">
              <TabsTrigger value="table"><TableProperties class="mr-1 h-3.5 w-3.5" /> Table</TabsTrigger>
              <TabsTrigger value="json"><Braces class="mr-1 h-3.5 w-3.5" /> Raw JSON</TabsTrigger>
            </TabsList>
          </header>

          <TabsContent value="table" class="mt-0">
            <div v-if="booleanValue !== null" class="flex flex-col items-center gap-2 px-4 py-10 text-center">
              <CircleCheck v-if="booleanValue" class="h-8 w-8 text-emerald-500" />
              <CircleX v-else class="h-8 w-8 text-muted-foreground" />
              <p class="text-lg font-semibold text-foreground">{{ booleanValue ? 'true' : 'false' }}</p>
              <p class="text-xs text-muted-foreground">ASK result</p>
            </div>
            <div v-else class="max-h-[480px] overflow-auto scrollbar-thin">
              <table class="w-full text-left">
                <thead
                  class="sticky top-0 z-10 bg-background text-[11px] uppercase tracking-wider text-muted-foreground"
                >
                  <tr>
                    <th v-for="column in columns" :key="column" class="px-3 py-2 font-semibold">{{ column }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(row, index) in tableRows" :key="index" class="border-t border-border">
                    <td
                      v-for="(cell, ci) in row"
                      :key="ci"
                      class="px-3 py-1.5 align-top font-mono text-[11.5px] text-foreground/80"
                    >
                      <RouterLink
                        v-if="cell.kind === 'link'"
                        :to="{ name: 'metadata-detail', params: { id: cell.documentId } }"
                        class="inline-block max-w-[28rem] truncate align-bottom text-primary hover:underline"
                        :title="cell.title"
                      >
                        {{ cell.text }}
                      </RouterLink>
                      <a
                        v-else-if="cell.kind === 'external'"
                        :href="cell.href"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="inline-flex max-w-[28rem] items-center gap-1 align-bottom text-primary hover:underline"
                        :title="cell.title"
                      >
                        <span class="truncate">{{ cell.text }}</span>
                        <ExternalLink class="h-3 w-3 shrink-0" />
                      </a>
                      <span v-else-if="cell.kind === 'literal'" :title="cell.title">
                        <span class="inline-block max-w-[28rem] truncate align-bottom">{{ cell.text }}</span>
                        <span v-if="cell.suffix" class="ml-1 text-muted-foreground">{{ cell.suffix }}</span>
                      </span>
                      <span v-else-if="cell.kind === 'blank'" class="text-muted-foreground">{{ cell.text }}</span>
                      <span v-else class="text-muted-foreground">—</span>
                    </td>
                  </tr>
                  <tr v-if="!tableRows.length">
                    <td
                      :colspan="Math.max(1, columns.length)"
                      class="px-3 py-6 text-center text-xs text-muted-foreground"
                    >
                      No rows returned. If you paged past the end, go back a page.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </TabsContent>

          <TabsContent value="json" class="mt-0">
            <pre
              class="max-h-[480px] overflow-auto scrollbar-thin p-4 font-mono text-[11px] leading-relaxed"
            >{{ JSON.stringify(result, null, 2) }}</pre>
          </TabsContent>

          <div
            v-if="solutionRows"
            class="flex flex-wrap items-center gap-3 border-t border-border bg-muted/20 px-4 py-2.5 text-[11px] text-muted-foreground"
          >
            <Button variant="outline" size="sm" :disabled="running || !canPrev" @click="goPage(-1)">
              <ChevronLeft class="h-3.5 w-3.5" /> Prev
            </Button>
            <span v-if="pageLabel">{{ pageLabel }}</span>
            <Button variant="outline" size="sm" :disabled="running || !canNext" @click="goPage(1)">
              Next <ChevronRight class="h-3.5 w-3.5" />
            </Button>
            <span v-if="ranMode === 'distributed'" class="ml-auto">distributed paging is approximate</span>
          </div>
        </Tabs>
      </section>

      <EmptyState
        v-else-if="!error"
        title="Run a query to see results"
        description="Try an example from the toolbar — guests can query all public graphs."
      >
        <template #icon><SquareTerminal class="h-6 w-6" /></template>
      </EmptyState>
    </div>
  </div>
</template>
