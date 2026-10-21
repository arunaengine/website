<script setup lang="ts">
// A running step with its bar. Pause, Resume and Abort show only for steps that allow them.
import { ref } from 'vue'
import Button from '@/components/ui/Button.vue'
import type { OrganizeJob } from '@/lib/api'
import { abortSentence, abortTitle, jobTitle, percent } from '@/lib/organize'
import { formatNumber } from '@/lib/utils'

defineProps<{ job: OrganizeJob; busy?: boolean }>()
const emit = defineEmits<{ (e: 'control', action: 'pause' | 'resume' | 'abort'): void }>()

const asking = ref(false)

function abort() {
  asking.value = false
  emit('control', 'abort')
}
</script>

<template>
  <div class="space-y-2" data-testid="job-progress">
    <div class="flex items-center justify-between gap-2">
      <span class="text-sm font-medium text-foreground">{{ jobTitle(job) }}</span>
      <span v-if="job.controls" class="flex gap-2">
        <Button v-if="job.state === 'paused'" variant="outline" size="sm" :disabled="busy" @click="emit('control', 'resume')">
          Resume
        </Button>
        <Button v-else variant="outline" size="sm" :disabled="busy" @click="emit('control', 'pause')">Pause</Button>
        <Button
          variant="outline"
          size="sm"
          class="border-destructive/30 text-destructive hover:text-destructive"
          :disabled="busy"
          @click="asking = true"
        >
          Abort
        </Button>
      </span>
    </div>
    <div
      class="h-1.5 overflow-hidden rounded-full bg-muted"
      role="progressbar"
      :aria-valuenow="percent(job)"
      aria-valuemin="0"
      aria-valuemax="100"
    >
      <div class="h-full bg-primary transition-all" :style="{ width: `${percent(job)}%` }" />
    </div>
    <p class="text-[11px] tabular-nums text-muted-foreground">
      {{ formatNumber(job.done) }} of {{ formatNumber(job.total) }}<template v-if="job.skipped"> · {{ formatNumber(job.skipped) }} skipped</template>
    </p>
    <div v-if="asking" class="space-y-2 rounded-md border border-border bg-muted/40 px-3 py-2">
      <p class="text-sm font-medium text-foreground">{{ abortTitle(job) }}</p>
      <p class="text-xs text-muted-foreground">{{ abortSentence(job) }}</p>
      <div class="flex gap-2">
        <Button variant="outline" size="sm" @click="asking = false">Keep running</Button>
        <Button variant="destructive" size="sm" :disabled="busy" @click="abort">Abort</Button>
      </div>
    </div>
  </div>
</template>
