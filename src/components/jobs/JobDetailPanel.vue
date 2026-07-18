<script setup lang="ts">
import { computed, ref } from 'vue'
import DetailDialog from '@/components/ui/DetailDialog.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Progress from '@/components/ui/Progress.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import CopyButton from '@/components/nodes/CopyButton.vue'
import JobStateBadge from '@/components/jobs/JobStateBadge.vue'
import { useJobDetail } from '@/composables/useJobs'
import { formatJobProgress, isTerminalJobState, jobProgressPercent } from '@/lib/jobs'
import { relativeTime, truncateMiddle } from '@/lib/utils'
import { Ban } from '@lucide/vue'
import { RouterLink } from 'vue-router'

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
    <div class="scrollbar-thin min-h-0 flex-1 overflow-y-auto pr-1">
      <DialogTitle class="sr-only">Job details</DialogTitle>

      <div v-if="loadState === 'loading'" class="space-y-4">
        <Skeleton class="h-8 w-2/3" />
        <Skeleton class="h-24 w-full" />
        <Skeleton class="h-24 w-full" />
      </div>

      <div
        v-else-if="loadState === 'unsupported'"
        class="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300"
      >
        This backend does not serve the durable jobs API yet. Job details cannot be loaded.
      </div>

      <ErrorPanel v-else-if="loadState === 'error'" :message="loadError || 'Failed to load the job.'" @retry="load" />

      <div v-else-if="job" class="space-y-6">
        <div class="space-y-2 pr-8">
          <div class="flex flex-wrap items-center gap-2">
            <h2 class="font-display text-lg font-semibold capitalize text-aruna-navy">{{ job.kind }} job</h2>
            <JobStateBadge :state="job.state" />
            <Badge v-if="job.cancel_requested && !terminal" variant="warn">cancel requested</Badge>
          </div>
          <div class="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
            <span :title="job.job_id">{{ truncateMiddle(job.job_id) }}</span>
            <CopyButton :value="job.job_id" label="Copy job id" />
          </div>
        </div>

        <section class="space-y-2">
          <h3 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Progress</h3>
          <Progress
            v-if="progressPercent !== null"
            :value="progressPercent"
            :label="`Job progress: ${progressText}`"
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
          <template v-if="job.workspace_bucket">
            <dt class="text-muted-foreground">Workspace</dt>
            <dd class="break-all font-mono text-[11px] text-foreground">
              <RouterLink
                :to="{ name: 'bucket', params: { bucketId: job.workspace_bucket } }"
                class="text-primary hover:underline"
                title="Open this workspace bucket in the data manager"
              >{{ job.workspace_bucket }}</RouterLink>
              <Badge v-if="job.workspace_mode" variant="outline" class="ml-1.5 text-[10px] uppercase">{{ job.workspace_mode }}</Badge>
            </dd>
          </template>
          <template v-else-if="job.workspace_mode">
            <dt class="text-muted-foreground">Workspace</dt>
            <dd class="text-foreground">{{ job.workspace_mode }}</dd>
          </template>
        </dl>

        <section v-if="job.error" class="space-y-2">
          <h3 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Last error</h3>
          <div class="space-y-1.5 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
            <Badge :variant="errorKindVariant" class="text-[10px] uppercase">{{ job.error.kind }}</Badge>
            <p class="whitespace-pre-wrap break-words text-xs text-foreground">{{ job.error.message }}</p>
          </div>
        </section>

        <section v-if="prettyResult !== null" class="space-y-2">
          <h3 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Result</h3>
          <pre
            class="max-h-64 overflow-y-auto whitespace-pre-wrap break-all rounded bg-muted/50 p-2 font-mono text-[11px]"
          >{{ prettyResult }}</pre>
        </section>

        <section v-if="prettyRunCrate !== null" class="space-y-2">
          <h3 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Run crate</h3>
          <pre
            class="max-h-64 overflow-y-auto whitespace-pre-wrap break-all rounded bg-muted/50 p-2 font-mono text-[11px]"
          >{{ prettyRunCrate }}</pre>
        </section>

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
                <Ban class="h-3.5 w-3.5" /> Cancel job
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
              Cancellation was requested; the job stops once the executor observes it.
            </p>
          </div>
          <p v-if="cancelError" class="mt-2 text-[11px] text-destructive">{{ cancelError }}</p>
        </section>
      </div>
    </div>
  </DetailDialog>
</template>
