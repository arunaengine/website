<script setup lang="ts">
// State, progress and failure of one followed transfer job.
import { computed } from 'vue'
import Button from '@/components/ui/Button.vue'
import Notice from '@/components/ui/Notice.vue'
import Progress from '@/components/ui/Progress.vue'
import Spinner from '@/components/ui/Spinner.vue'
import JobStateBadge from '@/components/jobs/JobStateBadge.vue'
import type { JobDetailState } from '@/composables/useJobs'
import { formatJobProgress, isTerminalJobState, jobProgressPercent, type JobStatusResponse } from '@/lib/jobs'

const props = defineProps<{
  job: JobStatusResponse | null
  loadState: JobDetailState
  loadError: string | null
  lastPollError: string | null
}>()
const emit = defineEmits<{ (e: 'retry'): void }>()

const terminal = computed(() => Boolean(props.job && isTerminalJobState(props.job.state)))
const progressPercent = computed(() => (props.job ? jobProgressPercent(props.job.progress) : null))
const progressText = computed(() => (props.job ? formatJobProgress(props.job.progress) : ''))
</script>

<template>
  <div class="flex flex-wrap items-center gap-2">
    <JobStateBadge v-if="job" :state="job.state" />
    <Spinner v-if="job && !terminal" label="Working…" class="text-primary" />
    <span class="text-xs text-muted-foreground">{{ progressText }}</span>
  </div>
  <Progress v-if="progressPercent !== null && !terminal" :value="progressPercent" :warn="101" :critical="101" />
  <Notice v-if="loadState === 'unsupported'" tone="warning">
    This node does not serve the system jobs API, so the transfer cannot be followed here.
  </Notice>
  <div v-else-if="loadState === 'error'" class="space-y-1">
    <p class="text-xs text-destructive">{{ loadError }}</p>
    <Button variant="outline" size="sm" @click="emit('retry')">Try again</Button>
  </div>
  <p v-if="lastPollError" class="text-[11px] text-muted-foreground">Auto-refresh failed: {{ lastPollError }}</p>
  <p v-if="job?.error" class="whitespace-pre-wrap break-words text-xs text-destructive">{{ job.error.message }}</p>
</template>
