<script setup lang="ts">
// Per-entry report of a settled transfer job. The report is frozen at the
// terminal transition, so it is fetched once the job settles; the host keys
// this component by job id so another job never shows a predecessor's rows.
import { computed, onUnmounted, ref, watch } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Spinner from '@/components/ui/Spinner.vue'
import { useAruna } from '@/composables/useAruna'
import { errorMessage } from '@/lib/utils'
import {
  displayArchiveRows,
  fetchArchiveReport,
  type ArchiveReportRow,
  type ExportReportDetail,
  type ImportReportDetail,
} from '@/lib/rocrateArchive'

type TransferRow = ArchiveReportRow<Partial<ImportReportDetail & ExportReportDetail>>

const props = defineProps<{ jobId: string; settled: boolean }>()

const { apiBaseUrl, authToken } = useAruna()
function client() {
  return { baseUrl: apiBaseUrl.value, token: authToken.value }
}

const rows = ref<TransferRow[]>([])
const visibleRows = computed(() => displayArchiveRows(rows.value))
const reportCursor = ref<string | null>(null)
const reportPending = ref(false)
const reportError = ref<string | null>(null)
const reportLoading = ref(false)
let reportTimer: number | undefined
let reportAttempts = 0

const REPORT_PAGE = 200
// A frozen report lands shortly after the terminal transition; bound the wait.
const REPORT_RETRY_MS = 2_000
const REPORT_MAX_RETRIES = 15

function stopReportRetry() {
  if (reportTimer !== undefined) window.clearTimeout(reportTimer)
  reportTimer = undefined
}

async function loadReport(cursor?: string) {
  const jobId = props.jobId
  if (!jobId || reportLoading.value) return
  reportLoading.value = true
  reportError.value = null
  try {
    const result = await fetchArchiveReport<Partial<ImportReportDetail & ExportReportDetail>>(jobId, client(), {
      limit: REPORT_PAGE,
      cursor,
    })
    if (jobId !== props.jobId) return
    if (result.status === 'pending') {
      reportPending.value = true
      if (++reportAttempts <= REPORT_MAX_RETRIES) {
        stopReportRetry()
        reportTimer = window.setTimeout(() => void loadReport(cursor), REPORT_RETRY_MS)
      }
      return
    }
    reportPending.value = false
    rows.value = cursor ? [...rows.value, ...result.page.rows] : result.page.rows
    reportCursor.value = result.page.next_cursor ?? null
  } catch (err) {
    if (jobId === props.jobId) reportError.value = errorMessage(err)
  } finally {
    reportLoading.value = false
  }
}

function retryReport() {
  reportAttempts = 0
  void loadReport()
}

watch(
  () => props.settled,
  (settled) => {
    if (!settled || rows.value.length || reportLoading.value) return
    reportAttempts = 0
    void loadReport()
  },
  { immediate: true },
)
onUnmounted(stopReportRetry)

const GOOD_CODES = new Set(['imported', 'included'])
const BAD_CODES = new Set(['failed', 'denied', 'missing', 'unsupported', 'unsupported_crate_version'])

function codeVariant(code: string): 'success' | 'destructive' | 'warn' {
  if (GOOD_CODES.has(code)) return 'success'
  if (BAD_CODES.has(code)) return 'destructive'
  return 'warn'
}

function rowSource(row: TransferRow): string {
  return row.detail.archive_path || row.detail.entity_id || row.entry_key
}

function rowTarget(row: TransferRow): string {
  return row.detail.target_key || row.detail.zip_path || ''
}
</script>

<template>
  <div v-if="settled" class="space-y-2">
    <div class="flex items-center gap-2">
      <h3 class="font-display text-sm font-semibold text-aruna-navy">Report</h3>
      <span v-if="visibleRows.length" class="text-[11px] text-muted-foreground">{{ visibleRows.length }} rows</span>
    </div>
    <div v-if="reportPending || reportError" class="flex items-center gap-2">
      <p class="text-xs" :class="reportError ? 'text-destructive' : 'text-muted-foreground'">
        {{ reportError || 'The report is still being written…' }}
      </p>
      <Button variant="ghost" size="sm" :disabled="reportLoading" @click="retryReport">Retry</Button>
    </div>
    <EmptyState v-else-if="!visibleRows.length && !reportLoading" compact title="No further report details." />
    <div v-else-if="visibleRows.length" class="max-h-64 overflow-y-auto rounded-md border border-border">
      <table class="w-full text-[11px]">
        <tbody>
          <tr v-for="row in visibleRows" :key="row.entry_key" class="border-b border-border last:border-0 align-top">
            <td class="px-2 py-1.5">
              <Badge :variant="codeVariant(row.code)" size="sm" class="uppercase">{{ row.code }}</Badge>
            </td>
            <td class="px-2 py-1.5">
              <p class="break-all font-mono text-foreground">{{ rowSource(row) }}</p>
              <p v-if="rowTarget(row)" class="break-all font-mono text-muted-foreground">→ {{ rowTarget(row) }}</p>
              <p v-if="row.message" class="text-muted-foreground">{{ row.message }}</p>
              <p v-if="row.detail.validation" class="text-destructive">
                {{ row.detail.validation.code }}: {{ row.detail.validation.message }}
              </p>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <Button v-if="reportCursor" variant="outline" size="sm" :disabled="reportLoading" :aria-busy="reportLoading" @click="loadReport(reportCursor ?? undefined)">
      <Spinner v-if="reportLoading" label="Loading more report rows" class="text-current" />
      {{ reportLoading ? 'Loading…' : 'Load more rows' }}
    </Button>
  </div>
</template>
