<script setup lang="ts">
// A running step with its bar. Pause, Resume and Abort show only for steps that allow them.
import { computed, ref, watch } from 'vue'
import Button from '@/components/ui/Button.vue'
import Spinner from '@/components/ui/Spinner.vue'
import { abortSentence, abortTitle, jobTitle, percent, type ProgressJob } from '@/lib/organize'
import { formatNumber } from '@/lib/utils'

// `busy`: a control is on its way; `disabled`: the controls are blocked for another reason.
const props = defineProps<{ job: ProgressJob; busy?: boolean; disabled?: boolean }>()
const emit = defineEmits<{ (e: 'control', action: 'pause' | 'resume' | 'abort'): void }>()

const asking = ref(false)
// The control last sent; its button shows the wait while the node answers.
const sent = ref<'pause' | 'resume' | 'abort' | null>(null)
watch(() => props.busy, (busy) => busy || (sent.value = null))
// A Pause or Resume on its way keeps its button, even when a poll already shows the new state.
const resumeShown = computed(() =>
  props.busy && (sent.value === 'pause' || sent.value === 'resume') ? sent.value === 'resume' : props.job.state === 'paused',
)

function send(action: 'pause' | 'resume' | 'abort') {
  sent.value = action
  emit('control', action)
}

function abort() {
  asking.value = false
  send('abort')
}
</script>

<template>
  <div class="space-y-2" data-testid="job-progress">
    <div class="flex items-center justify-between gap-2">
      <span class="flex items-center gap-2 text-sm font-medium text-foreground">
        <Spinner v-if="job.kind === 'rename' && job.state === 'running'" label="Renaming" />
        {{ jobTitle(job) }}
      </span>
      <span v-if="job.controls" class="flex gap-2">
        <Button
          v-if="resumeShown"
          variant="outline"
          size="sm"
          :disabled="busy || disabled"
          :aria-busy="busy && sent === 'resume'"
          @click="send('resume')"
        >
          <Spinner v-if="busy && sent === 'resume'" label="Resuming" class="text-current" /> Resume
        </Button>
        <Button v-else variant="outline" size="sm" :disabled="busy || disabled" :aria-busy="busy && sent === 'pause'" @click="send('pause')">
          <Spinner v-if="busy && sent === 'pause'" label="Pausing" class="text-current" /> Pause
        </Button>
        <Button
          variant="outline"
          size="sm"
          class="border-destructive/30 text-destructive hover:text-destructive"
          :disabled="busy || disabled"
          :aria-busy="busy && sent === 'abort'"
          @click="asking = true"
        >
          <Spinner v-if="busy && sent === 'abort'" label="Aborting" class="text-current" /> Abort
        </Button>
      </span>
    </div>
    <div
      v-if="job.total"
      class="h-1.5 overflow-hidden rounded-full bg-muted"
      role="progressbar"
      :aria-label="jobTitle(job)"
      :aria-valuetext="`${formatNumber(job.done)} of ${job.counted ? '' : 'at least '}${formatNumber(job.total)}`"
      :aria-valuenow="percent(job)"
      aria-valuemin="0"
      aria-valuemax="100"
    >
      <div class="h-full bg-primary transition-all" :style="{ width: `${percent(job)}%` }" />
    </div>
    <p v-if="!job.starting" class="text-[11px] tabular-nums text-muted-foreground">
      {{ formatNumber(job.done) }}<template v-if="job.total"> of {{ job.counted ? '' : 'at least ' }}{{ formatNumber(job.total) }}</template>
      <template v-if="job.kind === 'rename'"> renamed</template>
      <template v-if="job.skipped && job.kind !== 'rename'"> · {{ formatNumber(job.skipped) }} skipped</template>
      <template v-if="job.failed"> · {{ formatNumber(job.failed) }} failed</template>
      <template v-if="job.waiting"> · waiting</template>
      <template v-if="job.left"> · {{ job.left }}</template>
    </p>
    <p v-if="job.kind === 'rename'" class="text-[11px] text-muted-foreground">Runs on the server. You can close this window.</p>
    <div v-if="asking" class="space-y-2 rounded-md border border-border bg-muted/40 px-3 py-2">
      <p class="text-sm font-medium text-foreground">{{ abortTitle(job) }}</p>
      <p class="text-xs text-muted-foreground">{{ abortSentence(job) }}</p>
      <div class="flex gap-2">
        <Button variant="outline" size="sm" @click="asking = false">Keep running</Button>
        <Button variant="destructive" size="sm" :disabled="busy || disabled" @click="abort">Abort</Button>
      </div>
    </div>
  </div>
</template>
