<script setup lang="ts">
// The end of the form: what the run still needs or what it will do, the request
// behind it, and Run. Run is always enabled; with problems it jumps to the
// first one instead of starting anything.
import { computed } from 'vue'
import Button from '@/components/ui/Button.vue'
import { injectCustomRun } from '@/composables/useCustomRun'
import { Braces, Play } from '@lucide/vue'

const props = defineProps<{ running?: boolean }>()
const emit = defineEmits<{
  (e: 'run'): void
  (e: 'cancel'): void
  (e: 'show-request'): void
  (e: 'jump', section: string, field: string): void
}>()

const {
  problems,
  inputs,
  outputRows,
  cpuCores,
  ramGb,
  language,
  hasScript,
  image,
  placementSummary,
  unassignedPaths,
} = injectCustomRun()

const what = computed(() => (hasScript.value ? language.value.file : image.value.trim().split('/').pop() || 'custom image'))
const summary = computed(() =>
  [
    what.value,
    `${inputs.value.length} input${inputs.value.length === 1 ? '' : 's'}`,
    `${outputRows.value.length} output${outputRows.value.length === 1 ? '' : 's'}`,
    `${String(cpuCores.value).trim() || '?'} cores, ${String(ramGb.value).trim() || '?'} GB`,
    placementSummary.value,
  ].join(' · '),
)
const unassigned = computed(() => unassignedPaths.value.length)
// A warning, not a problem: the run may start and simply store nothing.
const noOutputs = computed(() => outputRows.value.length === 0)
</script>

<template>
  <div class="surface flex flex-wrap items-center gap-2.5 px-5 py-3">
    <div class="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
      <template v-if="problems.length">
        <span class="font-semibold text-amber-700 dark:text-amber-300">
          {{ problems.length }} thing{{ problems.length === 1 ? '' : 's' }} still needed:
        </span>
        <button
          v-for="problem in problems"
          :key="problem.text"
          type="button"
          class="rounded-full border border-border px-2 py-0.5 text-[11px] text-foreground/70 hover:text-foreground"
          @click="emit('jump', problem.section, problem.field)"
        >
          {{ problem.text }}
        </button>
      </template>
      <template v-else>
        <span class="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/20">
          <span class="size-1.5 rounded-full bg-current" /> Ready
        </span>
        <span class="min-w-0 truncate" :title="summary">{{ summary }}</span>
        <span v-if="unassigned" class="text-amber-700 dark:text-amber-300">
          · {{ unassigned }} path{{ unassigned === 1 ? '' : 's' }} not assigned
        </span>
      </template>
      <span
        v-if="noOutputs"
        class="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 ring-1 ring-inset ring-amber-200 dark:bg-amber-500/15 dark:text-amber-200 dark:ring-amber-400/20"
      >
        No output captured: this run stores nothing but the logs.
      </span>
    </div>
    <Button data-tutorial="run-request" variant="outline" @click="emit('show-request')">
      <Braces class="size-3.5" /> Show request
    </Button>
    <Button variant="outline" @click="emit('cancel')">Cancel</Button>
    <Button data-tutorial="run-submit" :disabled="props.running" @click="emit('run')">
      <Play class="size-3.5" /> {{ props.running ? 'Starting…' : 'Run' }}
    </Button>
  </div>
</template>
