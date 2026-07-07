<script setup lang="ts">
import Sheet from '@/components/ui/Sheet.vue'
import SheetContent from '@/components/ui/SheetContent.vue'
import Button from '@/components/ui/Button.vue'
import Badge from '@/components/ui/Badge.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import { useAruna } from '@/composables/useAruna'
import { useStaging } from '@/composables/useStaging'
import { featureEnabled } from '@/lib/config'
import { ApiError, type StagingJob, type StagingJobState } from '@/lib/api'
import { formatBytes, relativeTime } from '@/lib/utils'
import { ref, watch } from 'vue'
import { HardDriveDownload, Loader2, RefreshCw } from '@lucide/vue'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ (e: 'update:open', v: boolean): void }>()

const { listStagingJobs } = useAruna()
const staging = useStaging()

const jobs = ref<StagingJob[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
// The backend keeps no staging job registry yet: 404/405 is expected, not an error.
const noRegistry = ref(false)

async function loadJobs() {
  // Belt-and-suspenders: the parent only mounts this panel behind the flag, but
  // never reach the network if it is somehow off (mirrors #248's guard).
  if (!featureEnabled('stagingJobs')) return
  loading.value = true
  error.value = null
  noRegistry.value = false
  try {
    const response = await listStagingJobs()
    jobs.value = response.jobs
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 405)) {
      noRegistry.value = true
      jobs.value = []
    } else {
      error.value = err instanceof Error ? err.message : String(err)
    }
  } finally {
    loading.value = false
  }
}

watch(
  () => props.open,
  (open) => {
    if (open) void loadJobs()
  },
)

function jobBadge(state: StagingJobState): 'secondary' | 'success' | 'destructive' {
  if (state === 'done') return 'success'
  if (state === 'failed') return 'destructive'
  return 'secondary'
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
        <Button variant="ghost" size="icon-sm" aria-label="Reload" :disabled="loading" @click="loadJobs">
          <RefreshCw class="h-4 w-4" :class="loading ? 'animate-spin' : ''" />
        </Button>
      </div>

      <section class="mt-4 space-y-2">
        <p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Node registry</p>
        <div v-if="loading" class="space-y-2">
          <Skeleton class="h-12 w-full" />
          <Skeleton class="h-12 w-full" />
        </div>
        <p
          v-else-if="noRegistry"
          class="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
        >
          This backend does not keep a staging job registry yet (aruna#276). Jobs submitted from this browser appear below.
        </p>
        <ErrorPanel v-else-if="error" :message="error" @retry="loadJobs" />
        <EmptyState v-else-if="!jobs.length" title="No staging jobs" />
        <div v-else class="space-y-2">
          <div v-for="job in jobs" :key="job.job_id" class="space-y-0.5 rounded-md border border-border px-3 py-2">
            <div class="flex items-center gap-2 text-xs">
              <Loader2 v-if="job.state === 'running' || job.state === 'queued'" class="h-3 w-3 shrink-0 animate-spin text-primary" />
              <Badge :variant="jobBadge(job.state)" class="text-[10px] uppercase">{{ job.state }}</Badge>
              <span class="min-w-0 flex-1 truncate font-mono">{{ job.bucket }}/{{ job.key }}</span>
              <Badge variant="outline" class="shrink-0 text-[10px]">{{ job.strategy }}</Badge>
            </div>
            <div class="flex items-center gap-1 text-[11px] text-muted-foreground">
              <span>{{ relativeTime(job.submitted_at) }}</span>
              <span v-if="job.size != null">· {{ formatBytes(job.size) }}</span>
            </div>
            <p v-if="job.error" class="text-[11px] text-destructive">{{ job.error }}</p>
          </div>
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
