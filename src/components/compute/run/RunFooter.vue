<script setup lang="ts">
// The summary beside the form: what the run still needs or what it will do, the request
// behind it, and Run; on narrow screens Run sits in a bar at the bottom. Run is always
// enabled; with problems it jumps to the first one instead of starting anything.
import { computed } from 'vue'
import Button from '@/components/ui/Button.vue'
import { injectCustomRun, outputFolder } from '@/composables/useCustomRun'
import { atOrBelow } from '@/lib/tes'
import { ArrowLeft, Braces, CircleCheck, CircleDashed, Play, Star, TriangleAlert } from '@lucide/vue'

const props = defineProps<{ running?: boolean; saved?: boolean }>()
const emit = defineEmits<{
  (e: 'run'): void
  (e: 'cancel'): void
  (e: 'save'): void
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
  savedStart,
} = injectCustomRun()

const what = computed(() => (hasScript.value ? language.value.file : image.value.trim().split('/').pop() || 'custom image'))
// A saved run lists each asked input once, picked or not, and its fixed inputs below.
const inputCount = computed(() => {
  const asked = savedStart.value?.run.ask.inputs
  if (!asked) return inputs.value.length
  return asked.length + inputs.value.filter((entry) => !asked.some((path) => atOrBelow(entry, path))).length
})
const summary = computed(() => [
  { label: 'Tool', value: what.value },
  { label: 'Inputs', value: String(inputCount.value) },
  { label: 'Outputs', value: String(outputRows.value.length) },
  { label: 'Resources', value: `${String(cpuCores.value).trim() || '?'}\u00a0CPU, ${String(ramGb.value).trim() || '?'}\u00a0GB` },
  { label: 'Node', value: placementSummary.value },
])
const resultFolders = computed(() => [...new Set(outputRows.value.filter((row) => row.bucket.trim()).map(outputFolder))])
const unassigned = computed(() => unassignedPaths.value.length)
// A warning, not a problem: the run may start and simply store nothing.
const noOutputs = computed(() => outputRows.value.length === 0)
</script>

<template>
  <aside class="surface p-5 lg:sticky lg:top-20" aria-labelledby="run-summary-heading">
    <h2 id="run-summary-heading" class="flex items-center gap-2 type-card-title">
      <Play class="size-4 text-muted-foreground" aria-hidden="true" />{{ problems.length ? 'Almost ready' : 'Ready to run' }}
    </h2>
    <ul class="mt-3 space-y-2" aria-live="polite">
      <li v-for="problem in problems" :key="problem.text">
        <button type="button" class="flex items-start gap-2 text-left text-sm text-foreground hover:underline" @click="emit('jump', problem.section, problem.field)">
          <CircleDashed class="mt-0.5 h-4 w-4 shrink-0 text-status-warn" aria-hidden="true" />{{ problem.text }}
        </button>
      </li>
      <li v-if="!problems.length" class="flex items-start gap-2 text-sm text-muted-foreground">
        <CircleCheck class="mt-0.5 h-4 w-4 shrink-0 text-status-ok" aria-hidden="true" />Everything the run needs is set
      </li>
      <li v-if="!problems.length && unassigned" class="flex items-start gap-2 text-sm text-foreground">
        <TriangleAlert class="mt-0.5 h-4 w-4 shrink-0 text-status-warn" aria-hidden="true" />{{ unassigned }} path{{ unassigned === 1 ? '' : 's' }} not assigned
      </li>
      <li v-if="noOutputs" class="flex items-start gap-2 text-sm text-foreground">
        <TriangleAlert class="mt-0.5 h-4 w-4 shrink-0 text-status-warn" aria-hidden="true" />No output captured: this run stores nothing but the logs.
      </li>
    </ul>
    <dl class="mt-4 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 border-t border-border-subtle pt-4 text-sm">
      <template v-for="row in summary" :key="row.label">
        <dt class="text-muted-foreground">{{ row.label }}</dt>
        <dd class="truncate text-right tabular-nums text-foreground" :title="row.value">{{ row.value }}</dd>
      </template>
    </dl>
    <p v-if="resultFolders.length" class="mt-3 text-xs text-muted-foreground">
      Results go to <span class="break-all font-mono text-foreground">{{ resultFolders.join(', ') }}</span>
    </p>
    <div class="mt-4 flex flex-col gap-2">
      <Button data-tutorial="run-submit" class="max-lg:hidden" :disabled="props.running" @click="emit('run')">
        <Play class="size-4" /> {{ props.running ? 'Starting…' : 'Run' }}
      </Button>
      <div class="grid grid-cols-2 gap-2">
        <Button data-tutorial="run-request" variant="outline" size="sm" @click="emit('show-request')">
          <Braces class="size-3.5" /> Show request
        </Button>
        <Button variant="outline" size="sm" @click="emit('cancel')"><ArrowLeft class="size-3.5" /> Back to runs</Button>
        <Button variant="outline" size="sm" class="col-span-2" @click="emit('save')"><Star class="size-3.5" /> Save as run template</Button>
      </div>
      <p v-if="saved" role="status" class="text-center text-xs text-muted-foreground">Saved to run templates.</p>
    </div>
  </aside>

  <!-- Narrow screens: Run stays in reach above the mobile navigation. -->
  <div class="fixed inset-x-0 bottom-[4.5rem] z-30 flex items-center gap-3 border-t border-border/80 bg-background/90 px-4 py-3 backdrop-blur-xl md:bottom-0 lg:hidden">
    <span class="flex-1 text-sm text-muted-foreground">{{ problems.length ? `${problems.length} still needed` : 'Ready to run' }}</span>
    <Button class="min-w-28" :disabled="props.running" @click="emit('run')">
      <Play class="size-4" /> {{ props.running ? 'Starting…' : 'Run' }}
    </Button>
  </div>
  <div class="h-20 lg:hidden" aria-hidden="true" />
</template>
