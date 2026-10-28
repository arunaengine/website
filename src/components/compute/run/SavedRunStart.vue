<script setup lang="ts">
// Starting a saved run: only what it asks for each time is shown, the rest stays as saved.
import { computed, ref } from 'vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Select from '@/components/ui/Select.vue'
import ResultsHome from '@/components/compute/run/ResultsHome.vue'
import TesDataRefDialog from '@/components/compute/TesDataRefDialog.vue'
import { injectCustomRun, outputDestination } from '@/composables/useCustomRun'
import type { TesDataRefEntry } from '@/lib/tes'
import { Star } from '@lucide/vue'

const { savedStart, inputs, outputRows, openInputs, resultsChosen, bucketOptions, answerInput, chooseResults, editSaved } = injectCustomRun()

const run = computed(() => savedStart.value?.run ?? null)
const entryPath = (entry: TesDataRefEntry) => (entry.kind === 'file' ? entry.path : entry.basePath).replace(/\/$/, '')
const nameOf = (path: string) => run.value?.task.inputs?.find((input) => input.path === path)?.name || path
const asked = computed(() => run.value?.ask.inputs ?? [])
const fixed = computed(() => inputs.value.filter((entry) => !asked.value.includes(entryPath(entry))))
const pickOf = (path: string) => inputs.value.find((entry) => entryPath(entry) === path)
const pickText = (entry: TesDataRefEntry) => (entry.kind === 'file' ? entry.url : `${entry.bucket}/${entry.prefix}`)

const choosing = ref<string | null>(null)
const dialogOpen = computed({
  get: () => choosing.value !== null,
  set: (open: boolean) => {
    if (!open) choosing.value = null
  },
})
const destination = computed(() => (choosing.value ? `${choosing.value.slice(0, choosing.value.lastIndexOf('/') + 1)}` : '/'))
function picked(entry: TesDataRefEntry) {
  if (choosing.value) answerInput(choosing.value, entry)
}

const resultsBucket = ref('')
const resultsFolder = ref('')
</script>

<template>
  <section v-if="run" id="section-saved" class="surface space-y-4 p-5">
    <header class="flex flex-wrap items-start gap-3">
      <Star class="mt-1 h-4 w-4 text-primary" />
      <div class="min-w-0 flex-1">
        <h2 class="font-display text-base font-semibold text-aruna-navy">{{ run.name }}</h2>
        <p class="font-mono text-xs text-muted-foreground">Saved on this computer · {{ run.task.executors[0]?.image }}</p>
      </div>
      <Button variant="outline" size="sm" @click="editSaved">Edit saved run</Button>
    </header>

    <div id="saved-inputs" class="space-y-2">
      <div v-for="path in asked" :key="path" class="surface-inline flex flex-wrap items-center gap-3 p-3 text-sm">
        <div class="min-w-0 flex-1">
          <p class="text-xs text-muted-foreground">{{ nameOf(path) }}</p>
          <p v-if="pickOf(path)" class="truncate font-mono text-xs">{{ pickText(pickOf(path)!) }}</p>
          <p v-else class="text-xs text-amber-700 dark:text-amber-300">Not chosen yet</p>
        </div>
        <Button size="sm" variant="outline" @click="choosing = path">{{ pickOf(path) ? 'Change' : 'Choose' }}</Button>
      </div>
      <div v-for="entry in fixed" :key="entryPath(entry)" class="surface-inline flex flex-wrap items-center gap-3 p-3 text-sm">
        <div class="min-w-0 flex-1">
          <p class="text-xs text-muted-foreground">{{ entry.name }}</p>
          <p class="truncate font-mono text-xs">{{ pickText(entry) }}</p>
        </div>
        <span class="text-xs text-muted-foreground">Fixed in this run</span>
      </div>
    </div>

    <div v-if="outputRows.length" id="saved-results" class="surface-inline space-y-2 p-3 text-sm">
      <p class="text-xs text-muted-foreground">Results</p>
      <p v-if="resultsChosen" class="truncate font-mono text-xs">{{ outputDestination(outputRows[0]) }}</p>
      <template v-if="run.ask.results">
        <ResultsHome @choose="chooseResults" />
        <div class="flex flex-wrap items-end gap-2">
          <Select v-if="bucketOptions.length" v-model="resultsBucket" :options="bucketOptions" placeholder="Bucket" class="w-44" aria-label="Results bucket" />
          <Input v-else v-model="resultsBucket" class="w-44 font-mono" placeholder="Bucket" aria-label="Results bucket" />
          <Input v-model="resultsFolder" class="w-56 font-mono" placeholder="Folder, such as runs/" aria-label="Results folder" />
          <Button size="sm" variant="outline" :disabled="!resultsBucket" @click="chooseResults(resultsBucket, resultsFolder)">Use</Button>
        </div>
      </template>
      <p v-else class="text-xs text-muted-foreground">Fixed in this run</p>
    </div>

    <p v-for="note in savedStart?.notes ?? []" :key="note" class="text-xs text-muted-foreground">{{ note }}</p>
    <p v-if="openInputs.length" class="text-xs text-muted-foreground">Choose the open inputs, then start.</p>
    <p class="text-xs text-muted-foreground">Provenance is recorded automatically.</p>
    <TesDataRefDialog v-model:open="dialogOpen" mode="input" :destination="destination" @add="picked" />
  </section>
</template>
