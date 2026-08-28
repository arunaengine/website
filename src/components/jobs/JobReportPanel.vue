<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import { useJobs } from '@/composables/useJobs'
import {
  isReportAbsent,
  isReportCursorConflict,
  reportPendingState,
  type JobReportRow,
} from '@/lib/jobs'
import { errorMessage, truncateMiddle } from '@/lib/utils'

// The frozen per-entry report of an RO-Crate import or export. Only those two
// kinds keep one, so an absent report is the normal answer everywhere else and
// is reported as "not kept" rather than as a failure.
const props = defineProps<{ jobId: string }>()

const { getJobReport } = useJobs()

type PanelState = 'idle' | 'loading' | 'ready' | 'pending' | 'absent' | 'error'

const rows = ref<JobReportRow[]>([])
const digest = ref('')
const nextCursor = ref<string | null>(null)
const panelState = ref<PanelState>('idle')
const pendingState = ref<string | null>(null)
const loadError = ref<string | null>(null)
const loadingMore = ref(false)
const moreError = ref<string | null>(null)
let requestId = 0

const CODE_LABELS: Record<string, string> = {
  imported: 'Imported',
  included: 'Included',
  external: 'External',
  unlisted: 'Unlisted',
  failed: 'Failed',
  not_attempted: 'Not attempted',
  denied: 'Denied',
  missing: 'Missing',
  offline: 'Unreachable',
  unsupported: 'Unsupported',
  path_synthesized: 'Path synthesized',
  unrewritten_reference: 'Unrewritten reference',
  signature_dropped: 'Signature dropped',
  unsupported_crate_version: 'Unsupported RO-Crate version',
}
const GOOD_CODES = new Set(['imported', 'included', 'external'])
const BAD_CODES = new Set(['failed', 'denied', 'missing', 'unsupported', 'unsupported_crate_version'])

function codeLabel(code: string): string {
  return CODE_LABELS[code] ?? code.replaceAll('_', ' ')
}
function codeVariant(code: string): 'success' | 'destructive' | 'warn' {
  if (GOOD_CODES.has(code)) return 'success'
  return BAD_CODES.has(code) ? 'destructive' : 'warn'
}

async function load() {
  const id = ++requestId
  panelState.value = 'loading'
  loadError.value = null
  moreError.value = null
  pendingState.value = null
  try {
    const page = await getJobReport(props.jobId, {})
    if (id !== requestId) return
    rows.value = page.rows
    digest.value = page.report_digest
    nextCursor.value = page.next_cursor ?? null
    panelState.value = 'ready'
  } catch (err) {
    if (id !== requestId) return
    const pending = reportPendingState(err)
    if (pending) {
      pendingState.value = pending
      panelState.value = 'pending'
      return
    }
    if (isReportAbsent(err)) {
      panelState.value = 'absent'
      return
    }
    panelState.value = 'error'
    loadError.value = errorMessage(err)
  }
}

// A cursor is bound to the frozen snapshot it was issued against, so a 409
// means the report was replaced underneath the paging: restart from page one.
async function loadMore() {
  if (!nextCursor.value || loadingMore.value) return
  const id = requestId
  loadingMore.value = true
  moreError.value = null
  try {
    const page = await getJobReport(props.jobId, { cursor: nextCursor.value })
    if (id !== requestId) return
    rows.value = [...rows.value, ...page.rows]
    digest.value = page.report_digest
    nextCursor.value = page.next_cursor ?? null
  } catch (err) {
    if (id !== requestId) return
    moreError.value = isReportCursorConflict(err)
      ? 'This report was replaced while it was being paged. Reload it to start from the first page.'
      : errorMessage(err)
  } finally {
    loadingMore.value = false
  }
}

watch(() => props.jobId, () => void load(), { immediate: true })

const summary = computed(() => {
  const counts = new Map<string, number>()
  for (const row of rows.value) counts.set(row.code, (counts.get(row.code) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
})
</script>

<template>
  <section class="space-y-2">
    <div class="flex flex-wrap items-baseline justify-between gap-2">
      <h3 class="font-display text-sm font-semibold text-aruna-navy">Report</h3>
      <span v-if="panelState === 'ready' && digest" class="font-mono text-[10px] text-muted-foreground" :title="digest">
        snapshot {{ truncateMiddle(digest) }}
      </span>
    </div>

    <Skeleton v-if="panelState === 'loading'" class="h-20 w-full" />

    <div
      v-else-if="panelState === 'pending'"
      class="space-y-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
    >
      <p>
        The report is frozen only once the work finishes. This one is
        <span class="font-medium text-foreground">{{ pendingState }}</span>, so there is nothing to page yet.
      </p>
      <Button variant="outline" size="sm" @click="load">Check again</Button>
    </div>

    <p v-else-if="panelState === 'absent'" class="text-xs text-muted-foreground">
      No report is kept here. Only an RO-Crate import or export keeps one, and a kept report
      disappears again once its retention window passes.
    </p>

    <ErrorPanel v-else-if="panelState === 'error'" :message="loadError || 'The report could not be loaded.'" @retry="load" />

    <template v-else-if="panelState === 'ready'">
      <div v-if="summary.length" class="flex flex-wrap gap-1.5">
        <Badge v-for="[code, count] in summary" :key="code" :variant="codeVariant(code)" size="sm">
          {{ codeLabel(code) }} {{ count }}
        </Badge>
      </div>

      <div v-if="rows.length" class="overflow-x-auto rounded-md border border-border">
        <table class="w-full min-w-[32rem] text-left text-[11px]">
          <thead class="bg-muted/50 text-muted-foreground">
            <tr>
              <th scope="col" class="px-3 py-2 font-medium">Entry</th>
              <th scope="col" class="px-3 py-2 font-medium">Outcome</th>
              <th scope="col" class="px-3 py-2 font-medium">Detail</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border">
            <tr v-for="(row, index) in rows" :key="`${row.entry_key}:${index}`">
              <td class="max-w-72 break-all px-3 py-2 font-mono text-foreground">{{ row.entry_key }}</td>
              <td class="px-3 py-2">
                <Badge :variant="codeVariant(row.code)" size="sm">{{ codeLabel(row.code) }}</Badge>
              </td>
              <td class="max-w-96 break-words px-3 py-2 text-muted-foreground">{{ row.message || 'n/a' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="text-xs text-muted-foreground">The report is empty: no entry was recorded.</p>

      <div v-if="nextCursor" class="flex items-center gap-2">
        <Button variant="ghost" size="sm" :disabled="loadingMore" @click="loadMore">Load more</Button>
        <span class="text-[11px] text-muted-foreground">{{ rows.length }} rows loaded</span>
      </div>
      <p v-if="moreError" class="text-[11px] text-destructive">{{ moreError }}</p>
    </template>
  </section>
</template>
