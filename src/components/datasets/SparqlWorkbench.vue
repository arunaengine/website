<script setup lang="ts">
// SPARQL workbench: the realm graph, or one dataset's graph when the route
// fixes a scope. Distributed modes never merge graphs from other datasets.
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Notice from '@/components/ui/Notice.vue'
import Select from '@/components/ui/Select.vue'
import { sparqlCoverageStatus, useAruna } from '@/composables/useAruna'
import { SPARQL_MODE_LABELS, type SparqlWorkbenchState } from '@/composables/useSparqlWorkbench'
import { Code2, Download, Play } from '@lucide/vue'

const props = defineProps<{ state: SparqlWorkbenchState }>()
const {
  documentScope,
  sparql,
  sparqlMode,
  sparqlResult,
  sparqlError,
  sparqlFailure,
  sparqlFailureResult,
  sparqlFailureMode,
  running,
} = props.state
const { runQuery, downloadSparqlResult } = props.state

const { realm } = useAruna()
const sparqlModeLabels = SPARQL_MODE_LABELS
const sparqlModeOptions = Object.entries(SPARQL_MODE_LABELS).map(([value, label]) => ({ value, label }))
</script>

<template>
  <section class="surface p-4">
    <div class="flex items-center justify-between gap-2">
      <div class="flex items-center gap-2">
        <Code2 class="h-4 w-4 text-primary" />
        <h2 class="font-display text-sm font-semibold text-aruna-navy">SPARQL workbench</h2>
        <Badge variant="secondary" size="sm" class="uppercase">real API</Badge>
      </div>
      <div class="flex items-center gap-3">
        <Select
          v-model="sparqlMode"
          :options="sparqlModeOptions"
          aria-label="SPARQL execution mode"
          class="h-8 w-auto text-[11px]"
        />
        <Button size="sm" :disabled="running" @click="runQuery"><Play class="h-3.5 w-3.5" /> {{ running ? 'Running…' : 'Run query' }}</Button>
      </div>
    </div>
    <div v-if="documentScope" class="mt-3 rounded-md border border-primary/25 bg-primary/5 px-3 py-2.5 text-xs text-foreground/80">
      <div class="flex flex-wrap items-center gap-2">
        <Badge variant="accent" size="sm" class="uppercase">Fixed dataset scope</Badge>
        <span class="break-all font-mono">{{ documentScope }}</span>
      </div>
      <p class="mt-2 leading-relaxed">
        Distributed modes try readable replicas of this dataset until one complete answer succeeds. Distributed best-effort permits local fallback only when holder discovery is unavailable. It never merges graphs from other datasets. A 404 means the dataset is either absent or unreadable. A 503 can mean the graph is still materializing, so retry instead of treating it as empty.
      </p>
    </div>
    <textarea v-model="sparql" rows="14" class="mt-3 w-full rounded-md border border-input bg-muted/20 p-3 font-mono text-[12px] leading-relaxed text-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
    <p v-if="documentScope" class="mt-2 text-[11px] text-muted-foreground">Only SELECT and ASK queries are accepted. The selected mode changes replica and fallback behavior, never the fixed dataset scope.</p>
    <p v-else class="mt-2 text-[11px] text-muted-foreground">Only SELECT and ASK queries are accepted. Distributed queries accept only ASK or SELECT DISTINCT over a single pattern. Joins, aggregates, OFFSET, and other non-union-safe shapes are rejected.</p>
    <div v-if="sparqlError && !sparqlFailure" class="mt-3 text-xs text-destructive">{{ sparqlError }}</div>
  </section>

  <section v-if="sparqlFailure" class="surface overflow-hidden">
    <header class="flex flex-wrap items-center gap-2 border-b border-border bg-muted/20 px-4 py-2.5 text-[11px] text-muted-foreground">
      <Badge variant="destructive" size="sm" class="uppercase">Unavailable</Badge>
      <span v-if="sparqlFailureMode">Mode: {{ sparqlModeLabels[sparqlFailureMode] }}</span>
      <span v-if="documentScope" class="font-mono">Fixed dataset scope: {{ documentScope }}</span>
      <Button variant="outline" size="sm" class="ml-auto" :disabled="running" @click="runQuery">Retry</Button>
    </header>
    <div class="space-y-1.5 px-4 py-3 text-xs text-muted-foreground">
      <p>{{ sparqlError }}</p>
      <p v-if="sparqlFailureResult?.nodesFailed">{{ sparqlFailureResult.nodesFailed }} of {{ sparqlFailureResult.nodesQueried }} node partitions failed.</p>
      <p v-if="sparqlFailureResult?.failedPartitions.length" class="break-all">Failed partitions: {{ sparqlFailureResult.failedPartitions.join(', ') }}</p>
    </div>
  </section>

  <section v-if="sparqlResult" class="surface overflow-hidden">
    <header class="flex flex-wrap items-center gap-2 border-b border-border bg-muted/20 px-4 py-2.5 text-[11px] text-muted-foreground">
      <Badge
        :variant="sparqlCoverageStatus(sparqlResult) === 'Complete' ? 'success' : sparqlCoverageStatus(sparqlResult) === 'Partial' ? 'warn' : 'destructive'"
        size="sm"
        class="uppercase"
      >
        {{ sparqlCoverageStatus(sparqlResult) }}
      </Badge>
      <span>{{ sparqlResult.totalRows }} rows · {{ sparqlResult.tookMs }} ms</span>
      <span>Mode: {{ sparqlModeLabels[sparqlResult.mode] }}</span>
      <span class="font-mono">scope: {{ documentScope ? `Dataset ${documentScope}` : realm.shortName }}</span>
      <div class="ml-auto flex items-center gap-2">
        <Button v-if="!sparqlResult.complete" variant="outline" size="sm" :disabled="running" @click="runQuery">Retry</Button>
        <Button variant="outline" size="sm" @click="downloadSparqlResult">
          <Download class="h-3.5 w-3.5" /> {{ sparqlResult.complete ? 'Export JSON' : 'Export with manifest' }}
        </Button>
      </div>
    </header>
    <Notice
      v-if="!sparqlResult.complete"
      tone="warning"
      class="space-y-1 rounded-none border-0 border-b px-4 py-2 text-[11px]"
    >
      <p>{{ sparqlResult.nodesFailed }} of {{ sparqlResult.nodesQueried }} node partitions failed.</p>
      <p v-if="sparqlResult.failedPartitions.length" class="break-all">Failed partitions: {{ sparqlResult.failedPartitions.join(', ') }}</p>
    </Notice>
    <div class="max-h-[480px] overflow-auto scrollbar-thin">
      <table class="w-full text-sm">
        <thead class="sticky top-0 bg-background text-[11px] uppercase tracking-wider text-muted-foreground">
          <tr><th v-for="column in sparqlResult.columns" :key="column" class="px-3 py-2 text-left font-semibold">{{ column }}</th></tr>
        </thead>
        <tbody>
          <tr v-for="(row, index) in sparqlResult.rows" :key="index" class="border-t border-border">
            <td v-for="column in sparqlResult.columns" :key="column" class="px-3 py-2 font-mono text-[11.5px] text-foreground/80">{{ row[column] }}</td>
          </tr>
          <tr v-if="!sparqlResult.rows.length"><td :colspan="Math.max(1, sparqlResult.columns.length)" class="px-3 py-6 text-center text-xs text-muted-foreground">No rows returned.</td></tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
