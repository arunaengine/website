<script setup lang="ts">
// Starting a saved run: only what it asks for each time is shown, the rest stays as saved.
import { computed, ref, watch } from 'vue'
import Button from '@/components/ui/Button.vue'
import IconTile from '@/components/ui/IconTile.vue'
import Input from '@/components/ui/Input.vue'
import SectionHeading from '@/components/ui/SectionHeading.vue'
import Select from '@/components/ui/Select.vue'
import ResultsHome from '@/components/compute/run/ResultsHome.vue'
import TesDataRefDialog from '@/components/compute/TesDataRefDialog.vue'
import { injectCustomRun, outputDestination, outputFolder } from '@/composables/useCustomRun'
import { useDatabases } from '@/composables/useDatabases'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { parseArunaArn } from '@/lib/sync'
import { atOrBelow, entryPath, inputPlace, parseS3Url, type TesDataRefEntry } from '@/lib/tes'
import { isSecretName } from '@/lib/savedRuns'
import { Container, Database, File as FileIcon, Folder, KeyRound, Laptop, Lock, LogIn, Package, Pencil, Star } from '@lucide/vue'

const { savedStart, inputs, outputRows, openInputs, bucketOptions, envRows, answerInput, chooseResults, editSaved } = injectCustomRun()

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
const pickText = (entry: TesDataRefEntry) => (entry.kind === 'file' ? inputPlace(entry.url).text : `${entry.bucket}/${entry.prefix}`)
// The node a pick of another node names, in muted text after its path.
const pickNode = (entry: TesDataRefEntry) => {
  const node = entry.kind === 'file' ? inputPlace(entry.url).nodeId : null
  return node && node !== localNodeId.value ? displayName(node) : ''
}

// A fixed input read from a database names it by title and release. The database must be held
// by the node the input names: its ARN's node, else this node for a local reference.
const databases = useDatabases()
databases.ensure()
const { localNodeId, displayName } = useRealmNodes()
function databaseOf(entry: TesDataRefEntry): { title: string; release: string | null } | null {
  const arn = entry.kind === 'file' ? parseArunaArn(entry.url) : null
  const bucket = entry.kind === 'folder' ? entry.bucket : (arn?.bucket ?? parseS3Url(entry.url)?.bucket)
  if (!bucket) return null
  const node = arn?.nodeId ?? localNodeId.value
  const row = databases.rows.value.find((entry) => entry.bucket === bucket && entry.places.some((place) => place.nodeId === node))
  if (!row) return null
  return { title: row.title ?? bucket, release: row.description?.version ?? null }
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

// The run's own folder is added below the chosen one, so the exact place shows before Run.
const resultFolders = computed(() => [...new Set(outputRows.value.map(outputFolder))])
const resultsBucket = ref('')
const resultsFolder = ref('')
// The bucket and folder answer the results question as soon as a bucket is chosen.
watch([resultsBucket, resultsFolder], ([bucket, folder]) => {
  if (bucket) chooseResults(bucket, folder)
})
// A linked results folder fills the same fields, so they always show where the results go.
function chooseHome(bucket: string, folder: string) {
  resultsBucket.value = bucket
  resultsFolder.value = folder
  chooseResults(bucket, folder)
}
</script>

<template>
  <div v-if="run" id="section-saved" class="space-y-6">
    <div class="surface flex flex-wrap items-center gap-4 p-5">
      <IconTile :icon="Star" tone="aqua" />
      <div class="min-w-0 flex-1">
        <h2 class="type-card-title break-words">{{ run.name }}</h2>
        <p class="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground" :title="image">
          <span class="inline-flex items-center gap-1"><Container class="h-3 w-3" />{{ toolName }}</span>
          <span class="inline-flex items-center gap-1"><Laptop class="h-3 w-3" />Saved on this computer</span>
        </p>
      </div>
      <Button variant="outline" size="sm" class="max-sm:w-8 max-sm:px-0" aria-label="Edit saved run" title="Edit saved run" @click="editSaved">
        <Pencil class="h-3.5 w-3.5" /><span class="max-sm:sr-only">Edit saved run</span>
      </Button>
    </div>

    <section v-if="asked.length || fixedRows.length || secrets.length">
      <SectionHeading title="Inputs" :icon="LogIn" />
      <div id="saved-inputs" class="surface divide-y divide-border-subtle">
        <div v-for="path in asked" :key="path" class="flex flex-wrap items-center gap-3 px-5 py-4">
          <IconTile :icon="FileIcon" tone="muted" size="sm" />
          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium text-foreground">{{ labelOf(path) }}</p>
            <p v-if="pickOf(path)" class="mt-0.5 flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
              <Package class="h-3 w-3 shrink-0" /><span class="truncate font-mono">{{ pickText(pickOf(path)!) }}</span>
              <span v-if="pickNode(pickOf(path)!)" class="shrink-0">on {{ pickNode(pickOf(path)!) }}</span>
            </p>
            <p v-else class="truncate font-mono text-xs text-muted-foreground">{{ path }}</p>
          </div>
          <Button size="sm" variant="outline" @click="choosing = path"><Folder class="h-3.5 w-3.5" /> {{ pickOf(path) ? 'Change' : 'Choose' }}</Button>
        </div>
        <div v-for="{ entry, database } in fixedRows" :key="entryPath(entry)" class="flex flex-wrap items-center gap-3 px-5 py-4">
          <IconTile :icon="database ? Database : FileIcon" :tone="database ? 'royal' : 'muted'" size="sm" />
          <div v-if="database" class="min-w-0 flex-1" :title="entryPath(entry)">
            <p class="text-sm font-medium text-foreground">{{ database.title }}<template v-if="database.release">, release {{ database.release }}</template></p>
            <p class="truncate font-mono text-xs text-muted-foreground">{{ pickText(entry) }}<span v-if="pickNode(entry)" class="font-sans"> on {{ pickNode(entry) }}</span></p>
          </div>
          <div v-else class="min-w-0 flex-1">
            <p class="text-sm font-medium text-foreground">{{ entry.name || fileName(entryPath(entry)) }}</p>
            <p class="truncate font-mono text-xs text-muted-foreground">{{ entryPath(entry) }}</p>
            <p class="truncate font-mono text-xs text-muted-foreground">{{ pickText(entry) }}<span v-if="pickNode(entry)" class="font-sans"> on {{ pickNode(entry) }}</span></p>
          </div>
          <span class="inline-flex items-center gap-1.5 text-xs text-muted-foreground max-sm:basis-full max-sm:pl-11"><Lock class="h-3.5 w-3.5" />Set by the saved run</span>
        </div>
        <div v-for="(row, i) in secrets" :id="i === 0 ? 'saved-secrets' : undefined" :key="row.key" class="flex flex-wrap items-center gap-3 px-5 py-4">
          <IconTile :icon="KeyRound" tone="warn" size="sm" />
          <label class="min-w-0 flex-1">
            <span class="block truncate font-mono text-xs text-foreground">{{ row.key }}</span>
            <Input v-model="row.value" type="password" class="mt-1" :aria-label="`Value of ${row.key}`" placeholder="Not saved, enter it for this run" />
          </label>
        </div>
      </div>
    </section>

    <section v-if="outputRows.length">
      <SectionHeading title="Results" :icon="Folder" />
      <div id="saved-results" class="surface space-y-4 p-5">
        <template v-if="run.ask.results">
          <ResultsHome @choose="chooseHome" />
          <div class="grid gap-4 sm:grid-cols-2">
            <label class="block">
              <span class="text-xs font-medium text-muted-foreground">Bucket</span>
              <Select v-if="bucketOptions.length" v-model="resultsBucket" :options="bucketOptions" placeholder="Choose a bucket" class="mt-1" aria-label="Results bucket" />
              <Input v-else v-model="resultsBucket" class="mt-1 font-mono" placeholder="Bucket" aria-label="Results bucket" />
            </label>
            <label class="block">
              <span class="text-xs font-medium text-muted-foreground">Folder</span>
              <Input v-model="resultsFolder" class="mt-1 font-mono" placeholder="Folder, such as runs/" aria-label="Results folder" />
            </label>
          </div>
          <p v-if="resultsBucket" id="saved-results-folder" class="text-xs text-muted-foreground">
            Results go to <span class="break-all font-mono text-foreground">{{ resultFolders.join(', ') }}</span>
          </p>
        </template>
        <div v-else class="flex flex-wrap items-center gap-3">
          <p class="min-w-0 flex-1 truncate font-mono text-xs text-foreground">{{ outputDestination(outputRows[0]) }}</p>
          <span class="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><Lock class="h-3.5 w-3.5" />Set by the saved run</span>
        </div>
      </div>
    </section>

    <p v-for="note in savedStart?.notes ?? []" :key="note" class="text-xs text-muted-foreground">{{ note }}</p>
    <TesDataRefDialog v-model:open="dialogOpen" mode="input" :destination="destination" @add="picked" />
  </div>
</template>
