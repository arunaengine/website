<script setup lang="ts">
import Sheet from '@/components/ui/Sheet.vue'
import SheetContent from '@/components/ui/SheetContent.vue'
import Button from '@/components/ui/Button.vue'
import Badge from '@/components/ui/Badge.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import JobStateBadge from '@/components/jobs/JobStateBadge.vue'
import { useStaging } from '@/composables/useStaging'
import { useJobsList } from '@/composables/useJobs'
import { formatJobProgress } from '@/lib/jobs'
import { relativeTime } from '@/lib/utils'
import { useRouter } from 'vue-router'
import { watch } from 'vue'
import { HardDriveDownload, Loader2, RefreshCw } from '@lucide/vue'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ (e: 'update:open', v: boolean): void }>()

const staging = useStaging()
const router = useRouter()

// The real jobs API (GET /jobs/, aruna feat/job-framework) has no kind filter
// and POST /staging/ stays synchronous, so this lists ALL of the caller's
// durable jobs rather than a staging-only subset.
const list = useJobsList({ pageSize: 20, pollWhile: () => props.open })
const { jobs, listState, listError, refreshing } = list

watch(
  () => props.open,
  (open) => {
    if (open) void list.load()
  },
)

function openJob(jobId: string) {
  emit('update:open', false)
  void router.push({ name: 'job-detail', params: { jobId } })
}
</script>

<template>
  <Sheet :open="props.open" @update:open="(v: boolean) => emit('update:open', v)">
    <SheetContent side="right" class="w-full p-6 sm:max-w-md">
      <DialogTitle class="sr-only">Staging jobs</DialogTitle>
      <div class="flex items-center justify-between pr-8">
        <h2 class="flex items-center gap-2 text-base font-semibold text-foreground">
          <HardDriveDownload class="h-4 w-4 text-primary" /> Staging jobs
        </h2>
        <Button variant="ghost" size="icon-sm" aria-label="Reload" :disabled="refreshing" @click="list.load()">
          <RefreshCw class="h-4 w-4" :class="refreshing ? 'animate-spin' : ''" />
        </Button>
      </div>

      <section class="mt-4 space-y-2">
        <p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">My jobs</p>
        <div v-if="listState === 'loading'" class="space-y-2">
          <Skeleton class="h-12 w-full" />
          <Skeleton class="h-12 w-full" />
        </div>
        <p
          v-else-if="listState === 'unsupported'"
          class="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
        >
          This backend does not serve the durable jobs API yet. Jobs submitted from this browser appear below.
        </p>
        <p
          v-else-if="listState === 'forbidden'"
          class="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
        >
          This token cannot list jobs — path-restricted tokens have no access to the job surface.
        </p>
        <ErrorPanel v-else-if="listState === 'error'" :message="listError || 'Failed to load jobs.'" @retry="list.load()" />
        <EmptyState v-else-if="!jobs.length" title="No jobs" />
        <div v-else class="max-h-[40vh] space-y-2 overflow-y-auto">
          <button
            v-for="job in jobs"
            :key="job.job_id"
            type="button"
            class="block w-full space-y-0.5 rounded-md border border-border px-3 py-2 text-left transition-colors hover:bg-muted/40"
            @click="openJob(job.job_id)"
          >
            <span class="flex items-center gap-2 text-xs">
              <Loader2
                v-if="job.state === 'running' || job.state === 'queued' || job.state === 'claimed'"
                class="h-3 w-3 shrink-0 animate-spin text-primary"
              />
              <JobStateBadge :state="job.state" />
              <span class="min-w-0 flex-1 truncate font-medium capitalize">{{ job.kind }}</span>
              <Badge variant="outline" class="shrink-0 text-[10px]">{{ formatJobProgress(job.progress) }}</Badge>
            </span>
            <span class="block text-[11px] text-muted-foreground" :title="job.created_at">{{ relativeTime(job.created_at) }}</span>
            <span v-if="job.error" class="block text-[11px] text-destructive">{{ job.error.message }}</span>
          </button>
        </div>
      </section>

      <section class="mt-6 space-y-2">
        <p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">This session</p>
        <EmptyState v-if="!staging.submissions.value.length" title="Nothing staged this session" />
        <div v-else class="max-h-[40vh] space-y-2 overflow-y-auto">
          <div
            v-for="submission in staging.submissions.value"
            :key="submission.id"
            class="space-y-0.5 rounded-md border border-border px-3 py-2"
          >
            <div class="flex items-center gap-2 text-xs">
              <Loader2 v-if="submission.state === 'running'" class="h-3 w-3 shrink-0 animate-spin text-primary" />
              <Badge
                :variant="submission.state === 'running' ? 'secondary' : submission.state === 'done' ? 'success' : 'destructive'"
                class="text-[10px] uppercase"
              >{{ submission.state }}</Badge>
              <span class="min-w-0 flex-1 truncate font-mono">{{ submission.bucket }}/{{ submission.key }}</span>
              <Badge variant="outline" class="shrink-0 text-[10px]">{{ submission.strategy }}</Badge>
            </div>
            <p class="text-[11px] text-muted-foreground">{{ relativeTime(submission.submittedAt) }}</p>
            <p v-if="submission.error" class="text-[11px] text-destructive">{{ submission.error }}</p>
          </div>
        </div>
      </section>
    </SheetContent>
  </Sheet>
</template>
