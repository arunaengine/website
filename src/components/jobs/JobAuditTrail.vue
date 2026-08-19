<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogClose from '@/components/ui/DialogClose.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { useJobs } from '@/composables/useJobs'
import type { JobAuditConflict, JobAuditRecord, JobAuditScope } from '@/lib/jobs'
import { truncateMiddle } from '@/lib/utils'

const props = defineProps<{ jobId: string; open: boolean }>()
const emit = defineEmits<{ (e: 'update:open', value: boolean): void }>()

const { getJobAudit } = useJobs()
const scope = ref<JobAuditScope>('family')
const records = ref<JobAuditRecord[]>([])
const conflicts = ref<JobAuditConflict[]>([])
const nextCursor = ref<string | null>(null)
const projectionDigest = ref<string | null>(null)
const partial = ref(false)
const loading = ref(false)
const loadingMore = ref(false)
const loadError = ref<string | null>(null)
const moreError = ref<string | null>(null)
let requestId = 0

const sortedRecords = computed(() => [...records.value].sort((left, right) => left.at_ms - right.at_ms))

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function setScope(value: JobAuditScope) {
  scope.value = value
}

async function load(reset = true) {
  if (!props.open || !props.jobId) return
  if (!reset && (!nextCursor.value || loadingMore.value)) return

  const id = ++requestId
  if (reset) {
    loading.value = true
    loadError.value = null
    moreError.value = null
    records.value = []
    conflicts.value = []
    nextCursor.value = null
    projectionDigest.value = null
    partial.value = false
  } else {
    loadingMore.value = true
    moreError.value = null
  }

  try {
    const page = await getJobAudit(props.jobId, {
      scope: scope.value,
      cursor: reset ? undefined : nextCursor.value ?? undefined,
      limit: 64,
    })
    if (id !== requestId) return
    records.value = reset ? page.records : [...records.value, ...page.records]
    if (reset) conflicts.value = page.conflicts
    nextCursor.value = page.next_cursor ?? null
    projectionDigest.value = page.projection_digest
    partial.value = partial.value || page.partial
  } catch (error) {
    if (id !== requestId) return
    if (reset) loadError.value = errorMessage(error)
    else moreError.value = errorMessage(error)
  } finally {
    if (id === requestId) {
      loading.value = false
      loadingMore.value = false
    }
  }
}

function formatAuditTime(ms: number): string {
  return ms > 0 ? new Date(ms).toLocaleString() : 'Not timestamped'
}

function auditTimeTitle(ms: number): string | undefined {
  return ms > 0 ? new Date(ms).toISOString() : undefined
}

function recordDetails(record: JobAuditRecord): string[] {
  const details = [`record ${truncateMiddle(record.digest)}`]
  if (record.conflicting_family) details.push(`family ${truncateMiddle(record.request_digest)}`)
  switch (record.kind) {
    case 'spec':
      return [...details, `job ${truncateMiddle(record.job_id)}`, `spec ${truncateMiddle(record.spec_digest)}`]
    case 'claim':
      return [
        ...details,
        `job ${truncateMiddle(record.job_id)}`,
        `spec ${truncateMiddle(record.spec_digest)}`,
        record.canonical_alias ? 'canonical alias' : 'alternate alias',
      ]
    case 'budget':
      return [...details, `maximum launches ${record.sequence}`, `spec ${truncateMiddle(record.spec_digest)}`]
    case 'launch':
      return [
        ...details,
        `job ${truncateMiddle(record.job_id)}`,
        `sequence ${record.sequence}`,
        `plan ${truncateMiddle(record.plan_digest)}`,
        `spec ${truncateMiddle(record.spec_digest)}`,
      ]
    case 'receipt':
      return [
        ...details,
        `job ${truncateMiddle(record.job_id)}`,
        `execution ${truncateMiddle(record.execution_id)}`,
        `spec ${truncateMiddle(record.spec_digest)}`,
      ]
    case 'update':
      return [
        ...details,
        `execution ${truncateMiddle(record.execution_id)}`,
        `sequence ${record.sequence}`,
        `state ${record.state}`,
      ]
    case 'output':
      return [
        ...details,
        `job ${truncateMiddle(record.job_id)}`,
        `execution ${truncateMiddle(record.execution_id)}`,
        `${record.outputs?.length ?? 0} output(s)`,
        ...(record.outputs ?? []).map((output) => `${output.bucket}/${output.key} @ ${truncateMiddle(output.version_id)}`),
      ]
    case 'cancel':
      return [...details, `job ${truncateMiddle(record.job_id)}`, `spec ${truncateMiddle(record.spec_digest)}`]
  }
}

watch(
  () => [props.open, props.jobId, scope.value] as const,
  ([open, jobId]) => {
    requestId++
    if (!open || !jobId) {
      records.value = []
      conflicts.value = []
      nextCursor.value = null
      return
    }
    void load()
  },
  { immediate: true },
)
</script>

<template>
  <Dialog :open="props.open" @update:open="(value: boolean) => emit('update:open', value)">
    <DialogContent class="flex max-h-[85vh] w-[92vw] max-w-5xl flex-col overflow-hidden">
      <DialogHeader>
        <DialogTitle>Job audit trail</DialogTitle>
        <DialogDescription>
          Immutable records displayed by event time. API pages arrive in stable record-key order.
        </DialogDescription>
      </DialogHeader>

      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="inline-flex rounded-md border border-border p-0.5" role="group" aria-label="Audit scope">
          <Button
            size="sm"
            :variant="scope === 'family' ? 'secondary' : 'ghost'"
            :aria-pressed="scope === 'family'"
            @click="setScope('family')"
          >Family</Button>
          <Button
            size="sm"
            :variant="scope === 'submission' ? 'secondary' : 'ghost'"
            :aria-pressed="scope === 'submission'"
            @click="setScope('submission')"
          >Submission</Button>
        </div>
        <p class="text-[11px] text-muted-foreground">
          {{ scope === 'family' ? 'Current request family' : 'All request families for this submission' }}
        </p>
      </div>

      <div class="scrollbar-thin min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
        <div v-if="loading" class="space-y-2">
          <Skeleton class="h-10 w-full" />
          <Skeleton class="h-16 w-full" />
          <Skeleton class="h-16 w-full" />
        </div>

        <ErrorPanel v-else-if="loadError" :message="loadError" @retry="load" />

        <template v-else>
          <div v-if="sortedRecords.length" class="overflow-x-auto rounded-md border border-border">
            <table class="w-full min-w-[48rem] text-left text-[11px]">
              <thead class="bg-muted/50 text-muted-foreground">
                <tr>
                  <th scope="col" class="w-44 px-3 py-2 font-medium">Event time</th>
                  <th scope="col" class="w-24 px-3 py-2 font-medium">Kind</th>
                  <th scope="col" class="px-3 py-2 font-medium">Details</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-border">
                <tr v-for="record in sortedRecords" :key="record.digest">
                  <td class="whitespace-nowrap px-3 py-2 text-muted-foreground" :title="auditTimeTitle(record.at_ms)">
                    {{ formatAuditTime(record.at_ms) }}
                  </td>
                  <td class="px-3 py-2">
                    <Badge variant="secondary" class="text-[10px] uppercase">{{ record.kind }}</Badge>
                    <Badge
                      v-if="record.conflicting_family"
                      variant="outline"
                      class="mt-1 block w-fit text-[10px] text-muted-foreground"
                    >conflicting family</Badge>
                  </td>
                  <td class="px-3 py-2">
                    <div class="flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10px] text-muted-foreground">
                      <span v-for="detail in recordDetails(record)" :key="detail">{{ detail }}</span>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-else class="text-xs text-muted-foreground">No audit records are available in this scope.</p>

          <div v-if="nextCursor || moreError" class="flex flex-wrap items-center gap-3">
            <Button v-if="nextCursor" variant="outline" size="sm" :disabled="loadingMore" @click="load(false)">
              {{ loadingMore ? 'Loading records...' : 'Load more records' }}
            </Button>
            <p v-if="moreError" class="text-[11px] text-destructive">{{ moreError }}</p>
          </div>

          <section v-if="conflicts.length" class="space-y-2 rounded-md border border-border bg-muted/20 p-3">
            <div>
              <h3 class="text-xs font-semibold text-foreground">Record-key conflicts</h3>
              <p class="text-[11px] text-muted-foreground">
                These records were refused because a different digest already occupied the same stable key.
              </p>
            </div>
            <ul class="divide-y divide-border" aria-label="Audit record conflicts">
              <li v-for="conflict in conflicts" :key="conflict.digest" class="grid gap-1 py-2 text-[11px] sm:grid-cols-[6rem_1fr]">
                <Badge variant="outline" class="w-fit text-[10px] uppercase">{{ conflict.kind }}</Badge>
                <div class="space-y-0.5 text-muted-foreground">
                  <p :title="conflict.digest">Refused digest <span class="font-mono">{{ truncateMiddle(conflict.digest) }}</span></p>
                  <p :title="conflict.retained">Retained digest <span class="font-mono">{{ truncateMiddle(conflict.retained) }}</span></p>
                  <p :title="auditTimeTitle(conflict.observed_at_ms)">Observed {{ formatAuditTime(conflict.observed_at_ms) }}</p>
                </div>
              </li>
            </ul>
          </section>

          <div v-if="projectionDigest" class="space-y-1 text-[11px] text-muted-foreground">
            <div class="flex flex-wrap items-center gap-2">
              <span>Projection digest <span class="font-mono" :title="projectionDigest">{{ truncateMiddle(projectionDigest) }}</span></span>
              <Badge v-if="partial" variant="outline" class="text-[10px] text-muted-foreground">Partial responder view</Badge>
            </div>
            <p v-if="partial">This responder could not reduce every record in the family.</p>
          </div>
        </template>
      </div>

      <DialogFooter>
        <DialogClose as-child><Button variant="outline">Close</Button></DialogClose>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
