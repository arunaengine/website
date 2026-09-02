<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import DetailDialog from '@/components/ui/DetailDialog.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import Badge from '@/components/ui/Badge.vue'
import Notice from '@/components/ui/Notice.vue'
import Button from '@/components/ui/Button.vue'
import Progress from '@/components/ui/Progress.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import CopyButton from '@/components/ui/CopyButton.vue'
import JobArtifactButton from '@/components/jobs/JobArtifactButton.vue'
import JobAuditTrail from '@/components/jobs/JobAuditTrail.vue'
import JobFamilySection from '@/components/jobs/JobFamilySection.vue'
import JobReportPanel from '@/components/jobs/JobReportPanel.vue'
import JobStateBadge from '@/components/jobs/JobStateBadge.vue'
import { useJobDetail } from '@/composables/useJobs'
import { formatJobProgress, isTerminalJobState, jobKindLabel, jobProgressPercent } from '@/lib/jobs'
import { relativeTime, truncateMiddle } from '@/lib/utils'
import { Ban, History } from '@lucide/vue'

const props = defineProps<{ jobId: string; open: boolean }>()
const emit = defineEmits<{ (e: 'update:open', v: boolean): void; (e: 'changed'): void }>()

const { job, loadState, loadError, lastPollError, cancelling, cancelError, load, cancel } = useJobDetail(() =>
  props.open && props.jobId ? props.jobId : null,
)

const progressPercent = computed(() => (job.value ? jobProgressPercent(job.value.progress) : null))
const progressText = computed(() => (job.value ? formatJobProgress(job.value.progress) : ''))
const terminal = computed(() => !!job.value && isTerminalJobState(job.value.state))
const canCancel = computed(() => !!job.value && !terminal.value && !job.value.cancel_requested)
const errorKindVariant = computed(() => (job.value?.error?.kind === 'retryable' ? 'warn' : 'destructive'))
const prettyResult = computed(() =>
  job.value?.result !== undefined ? JSON.stringify(job.value.result, null, 2) : null,
)
const prettyRunCrate = computed(() =>
  job.value?.run_crate !== undefined ? JSON.stringify(job.value.run_crate, null, 2) : null,
)
// Only these two kinds keep a per-entry report; asking for any other is a 404.
const reportKind = computed(
  () => job.value?.kind === 'import_rocrate' || job.value?.kind === 'export_rocrate',
)
const auditOpen = ref(false)

watch(
  () => props.open,
  (open) => {
    if (!open) auditOpen.value = false
  },
)

// Two-step inline confirm (TaskDetailPanel pattern).
const confirmingCancel = ref(false)
let cancelResetTimer: number | undefined
function requestCancel() {
  confirmingCancel.value = true
  window.clearTimeout(cancelResetTimer)
  cancelResetTimer = window.setTimeout(() => (confirmingCancel.value = false), 4000)
}
async function confirmCancel() {
  confirmingCancel.value = false
  window.clearTimeout(cancelResetTimer)
  if (await cancel()) emit('changed')
}
</script>

<template>
  <DetailDialog :open="props.open" @update:open="(v: boolean) => emit('update:open', v)">
    <template #header>
      <DialogTitle class="sr-only">Details</DialogTitle>
      <div v-if="job" class="space-y-2">
        <div class="flex flex-wrap items-center gap-2">
          <h2 class="font-display text-lg font-semibold text-aruna-navy">{{ jobKindLabel(job.kind) }}</h2>
          <JobStateBadge :state="job.state" />
          <Badge v-if="job.cancel_requested && !terminal" variant="warn">cancel requested</Badge>
        </div>
        <div class="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
          <span :title="job.job_id">{{ truncateMiddle(job.job_id) }}</span>
          <CopyButton :value="job.job_id" label="Copy the id" />
        </div>
      </div>
      <Skeleton v-else-if="loadState === 'loading'" class="h-6 w-2/3" />
    </template>

    <div>
      <div v-if="loadState === 'loading'" class="space-y-4">
        <Skeleton class="h-24 w-full" />
        <Skeleton class="h-24 w-full" />
      </div>

      <Notice v-else-if="loadState === 'unsupported'" tone="warning">
        This node does not serve these details yet.
      </Notice>

      <ErrorPanel v-else-if="loadState === 'error'" :message="loadError || 'This could not be loaded.'" @retry="load" />

      <div v-else-if="job" class="space-y-6">
        <section class="space-y-2">
          <h3 class="font-display text-sm font-semibold text-aruna-navy">Progress</h3>
          <Progress
            v-if="progressPercent !== null"
            :value="progressPercent"
            :label="`Progress: ${progressText}`"
          />
          <p class="text-xs text-foreground">{{ progressText }}</p>
          <p v-if="lastPollError" class="text-[11px] text-muted-foreground">Auto-refresh failed: {{ lastPollError }}</p>
        </section>

        <dl class="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-xs">
          <dt class="text-muted-foreground">Attempts</dt>
          <dd class="text-foreground">{{ job.attempts }}</dd>
          <dt class="text-muted-foreground">Created</dt>
          <dd class="text-foreground" :title="job.created_at">{{ relativeTime(job.created_at) }}</dd>
          <dt class="text-muted-foreground">Updated</dt>
          <dd class="text-foreground" :title="job.updated_at">{{ relativeTime(job.updated_at) }}</dd>
          <template v-if="job.finished_at">
            <dt class="text-muted-foreground">Finished</dt>
            <dd class="text-foreground" :title="job.finished_at">{{ relativeTime(job.finished_at) }}</dd>
          </template>
        </dl>

        <template v-if="job.family">
          <JobFamilySection :family="job.family" />
          <Button variant="outline" size="sm" @click="auditOpen = true">
            <History class="h-3.5 w-3.5" /> View audit trail
          </Button>
        </template>

        <section v-if="job.error" class="space-y-2">
          <h3 class="font-display text-sm font-semibold text-aruna-navy">Last error</h3>
          <Notice tone="error" class="space-y-1.5">
            <Badge :variant="errorKindVariant" size="sm" class="uppercase">{{ job.error.kind }}</Badge>
            <p class="whitespace-pre-wrap break-words">{{ job.error.message }}</p>
          </Notice>
        </section>

        <section v-if="prettyResult !== null" class="space-y-2">
          <h3 class="font-display text-sm font-semibold text-aruna-navy">Result</h3>
          <pre
            class="max-h-64 overflow-y-auto whitespace-pre-wrap break-all rounded bg-muted/50 p-2 font-mono text-[11px]"
          >{{ prettyResult }}</pre>
        </section>

        <section v-if="prettyRunCrate !== null" class="space-y-2">
          <h3 class="font-display text-sm font-semibold text-aruna-navy">Run dataset</h3>
          <pre
            class="max-h-64 overflow-y-auto whitespace-pre-wrap break-all rounded bg-muted/50 p-2 font-mono text-[11px]"
          >{{ prettyRunCrate }}</pre>
        </section>

        <JobArtifactButton :job-id="job.job_id" />

        <JobReportPanel v-if="reportKind" :job-id="job.job_id" />

        <section v-if="!terminal" class="border-t border-border pt-4">
          <div class="flex items-center gap-2">
            <template v-if="canCancel && !confirmingCancel">
              <Button
                variant="outline"
                size="sm"
                class="text-destructive hover:text-destructive"
                :disabled="cancelling"
                @click="requestCancel"
              >
                <Ban class="h-3.5 w-3.5" /> Cancel
              </Button>
            </template>
            <template v-else-if="canCancel">
              <Button variant="destructive" size="sm" :disabled="cancelling" @click="confirmCancel">
                <Ban class="h-3.5 w-3.5" /> Confirm cancel
              </Button>
              <Button variant="ghost" size="sm" :disabled="cancelling" @click="confirmingCancel = false">
                Keep running
              </Button>
            </template>
            <p v-else class="text-xs text-muted-foreground">
              Cancellation was requested; it stops once the executor observes it.
            </p>
          </div>
          <p v-if="cancelError" class="mt-2 text-[11px] text-destructive">{{ cancelError }}</p>
        </section>
      </div>
    </div>
  </DetailDialog>
  <JobAuditTrail
    v-if="job"
    :job-id="job.job_id"
    :open="auditOpen"
    @update:open="(value: boolean) => (auditOpen = value)"
  />
</template>
