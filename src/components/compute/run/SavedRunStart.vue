<script setup lang="ts">
// Starting a saved run: only what it asks for each time is shown, the rest stays as saved.
import { computed, ref } from 'vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Select from '@/components/ui/Select.vue'
import ResultsHome from '@/components/compute/run/ResultsHome.vue'
import TesDataRefDialog from '@/components/compute/TesDataRefDialog.vue'
import { injectCustomRun, outputDestination } from '@/composables/useCustomRun'
import { useDatabases } from '@/composables/useDatabases'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { parseArunaArn } from '@/lib/sync'
import { atOrBelow, entryPath, parseS3Url, type TesDataRefEntry } from '@/lib/tes'
import { isSecretName } from '@/lib/savedRuns'
import { Star } from '@lucide/vue'

const { savedStart, inputs, outputRows, openInputs, resultsChosen, bucketOptions, envRows, answerInput, chooseResults, editSaved } = injectCustomRun()

const run = computed(() => savedStart.value?.run ?? null)
const image = computed(() => run.value?.task.executors[0]?.image ?? '')
// The tool by its image name: the last path part, without registry, tag or digest.
const toolName = computed(() => image.value.split('@')[0]!.split('/').pop()!.replace(/:[^:]*$/, '') || image.value)
const nameOf = (path: string) => run.value?.task.inputs?.find((input) => input.path === path)?.name || path
// An input reads by its file name; its container path follows in small print.
const fileName = (path: string) => path.replace(/\/+$/, '').split('/').pop() || path
const labelOf = (path: string) => (nameOf(path) === path ? fileName(path) : nameOf(path))
const asked = computed(() => run.value?.ask.inputs ?? [])
// Secret values are never saved, so each start asks for them.
const secrets = computed(() => envRows.value.filter((row) => isSecretName(row.key)))
const fixed = computed(() => inputs.value.filter((entry) => !asked.value.some((path) => atOrBelow(entry, path))))
const pickOf = (path: string) => inputs.value.find((entry) => atOrBelow(entry, path))
const pickText = (entry: TesDataRefEntry) => (entry.kind === 'file' ? entry.url : `${entry.bucket}/${entry.prefix}`)

// A fixed input read from a database names it by title and release. The database must be held
// by the node the input names: its ARN's node, else this node for a local reference.
const databases = useDatabases()
databases.ensure()
const { localNodeId } = useRealmNodes()
function databaseOf(entry: TesDataRefEntry): { title: string; release: string | null } | null {
  const arn = entry.kind === 'file' ? parseArunaArn(entry.url) : null
  const bucket = entry.kind === 'folder' ? entry.bucket : (arn?.bucket ?? parseS3Url(entry.url)?.bucket)
  if (!bucket) return null
  const node = arn?.nodeId ?? localNodeId.value
  const row = databases.rows.value.find((entry) => entry.bucket === bucket && entry.places.some((place) => place.nodeId === node))
  if (!row) return null
  return { title: row.title ?? row.metadata.title ?? bucket, release: row.metadata.version ?? null }
}
const fixedRows = computed(() => fixed.value.map((entry) => ({ entry, database: databaseOf(entry) })))

const choosing = ref<string | null>(null)
// The dialog adds each pick on its own and then closes; the picks of one choice are one answer.
let batch: TesDataRefEntry[] = []
const dialogOpen = computed({
  get: () => choosing.value !== null,
  set: (open: boolean) => {
    if (open) return
    if (choosing.value && batch.length) answerInput(choosing.value, batch)
    batch = []
    choosing.value = null
  },
})
const destination = computed(() => (choosing.value ? `${choosing.value.slice(0, choosing.value.lastIndexOf('/') + 1)}` : '/'))
function picked(entry: TesDataRefEntry) {
  batch.push(entry)
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
        <p class="text-xs text-muted-foreground" :title="image">Saved on this computer, {{ toolName }}</p>
      </div>
      <Button variant="outline" size="sm" @click="editSaved">Edit saved run</Button>
    </header>

    <div id="saved-inputs" class="space-y-2">
      <div v-for="path in asked" :key="path" class="surface-inline flex flex-wrap items-center gap-3 p-3 text-sm">
        <div class="min-w-0 flex-1">
          <p class="font-medium">{{ labelOf(path) }}</p>
          <p class="truncate font-mono text-[11px] text-muted-foreground">{{ path }}</p>
          <p v-if="pickOf(path)" class="truncate font-mono text-xs">{{ pickText(pickOf(path)!) }}</p>
          <p v-else class="text-xs text-amber-700 dark:text-amber-300">Not chosen yet</p>
        </div>
        <Button size="sm" variant="outline" @click="choosing = path">{{ pickOf(path) ? 'Change' : 'Choose' }}</Button>
      </div>
      <div v-for="{ entry, database } in fixedRows" :key="entryPath(entry)" class="surface-inline flex flex-wrap items-center gap-3 p-3 text-sm">
        <div v-if="database" class="min-w-0 flex-1" :title="entryPath(entry)">
          <p class="font-medium">{{ database.title }}<template v-if="database.release">, release {{ database.release }}</template></p>
          <p class="truncate font-mono text-[11px] text-muted-foreground">{{ pickText(entry) }}</p>
        </div>
        <div v-else class="min-w-0 flex-1">
          <p class="font-medium">{{ entry.name || fileName(entryPath(entry)) }}</p>
          <p class="truncate font-mono text-[11px] text-muted-foreground">{{ entryPath(entry) }}</p>
          <p class="truncate font-mono text-xs">{{ pickText(entry) }}</p>
        </div>
        <span class="text-xs text-muted-foreground">Fixed in this run</span>
      </div>
    </div>

    <div v-if="secrets.length" id="saved-secrets" class="surface-inline space-y-2 p-3 text-sm">
      <p class="text-xs text-muted-foreground">Secret values are not saved. Enter them for this run.</p>
      <label v-for="row in secrets" :key="row.key" class="flex items-center gap-3">
        <span class="w-48 truncate font-mono text-xs">{{ row.key }}</span>
        <Input v-model="row.value" type="password" class="flex-1" :aria-label="`Value of ${row.key}`" />
      </label>
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
    <TesDataRefDialog v-model:open="dialogOpen" mode="input" :destination="destination" @add="picked" />
  </section>
</template>
