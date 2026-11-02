<script setup lang="ts">
// Import from a list: one card. The person names the list, checks what each column is for, and
// starts one staging job that reads the rows on the node. Files are linked, not copied.
import { computed, ref, watch } from 'vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Notice from '@/components/ui/Notice.vue'
import OptionToggle from '@/components/ui/OptionToggle.vue'
import { useAruna } from '@/composables/useAruna'
import { useS3 } from '@/composables/useS3'
import type { ConnectorSource } from '@/components/data/add/useConnectorSource'
import type { TableFormat, TableSource } from '@/lib/api'
import {
  defaultTemplates, fillTemplate, guessFormat, guessUses, presetUses, PRESETS, previewOf, previewText,
  rowPasses, rowsOf, unknownColumns, type ColumnChoice, type ColumnUse,
} from '@/lib/tableImport'
import { errorMessage } from '@/lib/utils'
import { ArrowRight, FileUp } from '@lucide/vue'

const props = defineProps<{ bucket: string; nodeId?: string | null; source: ConnectorSource; link?: string }>()
const emit = defineEmits<{ started: [jobId: string] }>()

const { createStagingJob } = useAruna()
const s3 = useS3()
const { groupSel, connectorSel, connectorOptions } = props.source

const SOURCES = [{ value: 'link', label: 'Link' }, { value: 'bucket', label: 'Bucket' }, { value: 'upload', label: 'Upload' }]
const from = ref<'link' | 'bucket' | 'upload'>('link')
const link = ref(props.link ?? '')
const listBucket = ref(props.bucket)
const listKey = ref('')
const file = ref<File | null>(null)
const picker = ref<HTMLInputElement | null>(null)
const presetName = ref('')

const text = ref('')
const partial = ref(false)
const format = ref<TableFormat>(guessFormat(''))
const choices = ref<ColumnChoice[]>([])
const kind = ref<'file' | 'folder'>('file')
const sourceTemplate = ref('')
const targetTemplate = ref('')
const rate = ref(10)
const options = ref(false)
const reading = ref(false)
const failure = ref<string | null>(null)
const started = ref<string | null>(null)
const busy = ref(false)
let reads = 0

// Without a preview (a link the browser may not read) typed column names still give the columns.
const preview = computed(() => {
  if (text.value) return previewOf(text.value, format.value)
  const header = format.value.header
  return { columns: typeof header === 'object' && 'columns' in header ? header.columns : [], rows: [] as string[][] }
})
const first = computed(() => preview.value.rows[0] ?? [])

// Reads the start of the list for the preview; the node reads the whole list itself.
// The source the shown columns belong to; Start waits until it is the current one.
const readFor = ref<string | null>(null)
const sourceKey = () => JSON.stringify([from.value, link.value, listBucket.value, listKey.value, file.value?.name, file.value?.size, presetName.value])

async function read() {
  const run = ++reads
  const key = sourceKey()
  failure.value = null
  started.value = null
  readFor.value = null
  reading.value = true
  try {
    let blob: Blob
    let name = ''
    if (from.value === 'upload') {
      if (!file.value) return
      blob = file.value
      name = file.value.name
    } else if (from.value === 'bucket') {
      if (!listBucket.value || !listKey.value) return
      const url = await s3.downloadUrl(listBucket.value, listKey.value)
      blob = await (await fetch(url, { headers: { Range: 'bytes=0-262143' } })).blob()
      name = listKey.value
    } else {
      if (!/^https?:\/\//.test(link.value)) return
      const response = await fetch(link.value, { headers: { Range: 'bytes=0-262143' } })
      if (!response.ok && response.status !== 206) throw new Error(`The list answered ${response.status}.`)
      blob = await response.blob()
      name = link.value
    }
    const read = await previewText(blob)
    if (run !== reads) return
    text.value = read.text
    partial.value = read.partial
    const preset = PRESETS.find((item) => item.name === presetName.value)
    format.value = { ...guessFormat(read.text, name), ...(read.gzip ? { gzip: true } : {}), ...preset?.format }
    applyUses()
  } catch (cause) {
    if (run !== reads) return
    text.value = ''
    failure.value = from.value === 'link'
      ? `No preview from this link (${errorMessage(cause)}). Type the column names under More options.`
      : errorMessage(cause)
  } finally {
    if (run === reads) {
      reading.value = false
      readFor.value = key
    }
  }
}

function applyUses() {
  const preset = PRESETS.find((item) => item.name === presetName.value)
  const columns = preview.value.columns
  choices.value = preset ? presetUses(preset, columns) : guessUses(columns, first.value)
  if (preset) kind.value = preset.kind
  const templates = defaultTemplates(choices.value)
  sourceTemplate.value = templates?.source ?? ''
  targetTemplate.value = kind.value === 'folder' && templates ? templates.source.replace('}', '|basename}') : templates?.target ?? ''
}

// A link handed in, such as a new referenced bucket's source, is read when the panel opens.
watch([from, link, listBucket, listKey, file], () => void read(), { immediate: Boolean(link.value) })
// Without a preview (typed column names) a preset applies at once and the shown columns stay current.
watch(presetName, () => {
  if (text.value) return void read()
  const preset = PRESETS.find((item) => item.name === presetName.value)
  if (preset) format.value = { ...format.value, ...preset.format, header: format.value.header }
  applyUses()
  if (!reading.value) readFor.value = sourceKey()
})

// The format and the column names change the preview; the uses follow the new columns.
watch(() => preview.value.columns.join('\u0000'), (now, before) => {
  if (now !== before && choices.value.map((choice) => choice.name).join('\u0000') !== now) applyUses()
})

const USES: { group: string; items: { value: string; label: string }[] }[] = [
  { group: 'The file', items: [
    { value: 'path', label: 'Path or link' }, { value: 'name', label: 'Name in bucket' }, { value: 'size', label: 'Size' },
    { value: 'checksum:md5', label: 'Checksum: MD5' }, { value: 'checksum:sha256', label: 'Checksum: SHA-256' },
    { value: 'checksum:sha1', label: 'Checksum: SHA-1' }, { value: 'modified', label: 'Modified time' },
  ] },
  { group: 'Search and details', items: [
    { value: 'search', label: 'Search' }, { value: 'filter', label: 'Filter' }, { value: 'search_filter', label: 'Search and filter' },
    { value: 'keep', label: 'Keep' }, { value: 'skip', label: 'Skip' },
  ] },
]
const useValue = (choice: ColumnChoice) => (choice.use === 'checksum' ? `checksum:${choice.algorithm}` : choice.use)
function setUse(index: number, value: string) {
  const [use, algorithm] = value.split(':') as [ColumnUse, ColumnChoice['algorithm']]
  choices.value = choices.value.map((choice, at) => (at === index ? { ...choice, use, algorithm } : choice))
  const templates = defaultTemplates(choices.value)
  if (templates && (use === 'path' || use === 'name')) {
    sourceTemplate.value = templates.source
    targetTemplate.value = templates.target
  }
}
function setOnly(index: number, value: string) {
  const only = value.split(',').map((item) => item.trim()).filter(Boolean)
  choices.value = choices.value.map((choice, at) => (at === index ? { ...choice, only } : choice))
}

const columns = computed(() => preview.value.columns)
const matching = computed(() => preview.value.rows.filter((row) => rowPasses(choices.value, columns.value, row)))
const targets = computed(() =>
  matching.value.map((row) => fillTemplate(targetTemplate.value, columns.value, row, format.value.nulls)).filter((name): name is string => Boolean(name)),
)
const unknown = computed(() => [...unknownColumns(sourceTemplate.value, columns.value), ...unknownColumns(targetTemplate.value, columns.value)])
const hasSize = computed(() => choices.value.some((choice) => choice.use === 'size'))
const checksumNames = computed(() =>
  choices.value.filter((choice) => choice.use === 'checksum').map((choice) => ({ md5: 'MD5', sha256: 'SHA-256', sha1: 'SHA-1' })[choice.algorithm ?? 'md5']),
)
const formatLine = computed(() => {
  const sep = { ',': 'comma', '\t': 'tab', ';': 'semicolon' }[format.value.delimiter] ?? `"${format.value.delimiter}"`
  const header = format.value.header
  const names = header === 'first_row' ? 'names from the first row'
    : header === 'last_comment' ? `names from the last ${format.value.comment ?? '#'} line`
    : 'row' in header ? `names from row ${header.row}` : 'typed column names'
  const nulls = format.value.nulls.filter(Boolean)
  return `Read as ${sep} separated, ${names}${nulls.length ? `, "${nulls.join('", "')}" is empty` : ''}.`
})

const tableSource = computed<TableSource | null>(() => {
  if (from.value === 'link') return link.value ? { connector: link.value } : null
  if (from.value === 'bucket') return listBucket.value && listKey.value ? { object: { bucket: listBucket.value, key: listKey.value } } : null
  return file.value ? { object: { bucket: props.bucket, key: `lists/${file.value.name}` } } : null
})
const ready = computed(() =>
  Boolean(tableSource.value && connectorSel.value && groupSel.value && sourceTemplate.value && targetTemplate.value && !unknown.value.length && !busy.value)
    && !reading.value && readFor.value === sourceKey(),
)

async function start() {
  if (!ready.value || !tableSource.value) return
  busy.value = true
  failure.value = null
  // What is sent is fixed now; a change while the list uploads does not mix into it.
  const listFile = from.value === 'upload' ? file.value : null
  const nodeId = props.nodeId
  const request = {
    group_id: groupSel.value,
    connector_id: connectorSel.value,
    bucket: props.bucket,
    strategy: 'reference' as const,
    table: {
      source: tableSource.value,
      format: { ...format.value },
      rows: rowsOf(choices.value, kind.value, sourceTemplate.value, targetTemplate.value),
      rate: Number(rate.value) || undefined,
    },
  }
  try {
    if (listFile) await s3.uploadObject(request.bucket, `lists/${listFile.name}`, listFile, undefined, nodeId).promise
    const answer = await createStagingJob(request, nodeId)
    started.value = answer.job_id
    emit('started', answer.job_id)
  } catch (cause) {
    failure.value = errorMessage(cause)
  } finally {
    busy.value = false
  }
}

// More options: column names typed in when there is no header row.
const typedColumns = computed({
  get: () => (typeof format.value.header === 'object' && 'columns' in format.value.header ? format.value.header.columns.join(', ') : ''),
  set: (value: string) => (format.value = { ...format.value, header: { columns: value.split(',').map((name) => name.trim()).filter(Boolean) } }),
})
const headerMode = computed({
  get: () => (typeof format.value.header === 'string' ? format.value.header : 'row' in format.value.header ? 'row' : 'columns'),
  set: (mode: string) => (format.value = {
    ...format.value,
    header: mode === 'row' ? { row: 1 } : mode === 'columns' ? { columns: [...columns.value] } : (mode as 'first_row' | 'last_comment'),
  }),
})
const headerRow = computed({
  get: () => (typeof format.value.header === 'object' && 'row' in format.value.header ? format.value.header.row : 1),
  set: (row: number) => (format.value = { ...format.value, header: { row: Math.max(1, Number(row) || 1) } }),
})
const SELECT = 'h-9 w-full rounded-md border border-input bg-field px-2 text-sm'
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center gap-2">
      <OptionToggle v-model="from" :options="SOURCES" aria-label="Where the list is" />
      <Input v-if="from === 'link'" :model-value="link" @change="link = ($event.target as HTMLInputElement).value" class="min-w-0 flex-1 font-mono text-xs" placeholder="https://… list.csv" aria-label="Link to the list" />
      <template v-else-if="from === 'bucket'">
        <Input :model-value="listBucket" @change="listBucket = ($event.target as HTMLInputElement).value" class="w-40 font-mono text-xs" aria-label="Bucket of the list" />
        <span class="text-muted-foreground">/</span>
        <Input :model-value="listKey" @change="listKey = ($event.target as HTMLInputElement).value" class="min-w-0 flex-1 font-mono text-xs" placeholder="lists/run1.csv" aria-label="Key of the list" />
      </template>
      <template v-else>
        <Button variant="outline" size="sm" @click="picker?.click()"><FileUp class="h-3.5 w-3.5" /> Choose a list file</Button>
        <span class="min-w-0 truncate text-xs text-muted-foreground">{{ file ? `${file.name}, kept as lists/${file.name}` : 'No file chosen' }}</span>
        <input ref="picker" type="file" accept=".csv,.tsv,.txt,.gz" aria-label="List file" class="hidden" @change="file = ($event.target as HTMLInputElement).files?.[0] ?? null" />
      </template>
      <select v-model="presetName" :class="[SELECT, 'w-auto']" aria-label="Preset">
        <option value="">Preset: none</option>
        <option v-for="preset in PRESETS" :key="preset.name" :value="preset.name">Preset: {{ preset.name }}</option>
      </select>
    </div>

    <p v-if="reading" class="text-xs text-muted-foreground">Reading the list…</p>
    <Button v-else-if="!columns.length" variant="ghost" size="sm" @click="options = !options">More options</Button>
    <p v-else-if="columns.length" class="text-xs text-muted-foreground">
      {{ formatLine }} <button type="button" class="text-primary hover:underline" @click="options = !options">Change</button>
    </p>

    <table v-if="columns.length" class="w-full text-left text-xs">
      <thead class="text-muted-foreground">
        <tr><th class="py-1 font-medium">Column</th><th class="py-1 font-medium">First value</th><th class="py-1 font-medium">Use</th><th class="py-1 font-medium">Only rows with</th></tr>
      </thead>
      <tbody>
        <tr v-for="(choice, index) in choices" :key="choice.name" class="border-t border-border">
          <td class="py-1 pr-2 font-mono">{{ choice.name }}</td>
          <td class="max-w-[16rem] truncate py-1 pr-2 font-mono" :title="first[index]">{{ first[index] }}</td>
          <td class="py-1 pr-2">
            <select :value="useValue(choice)" :class="SELECT" :aria-label="`Use of ${choice.name}`" @change="setUse(index, ($event.target as HTMLSelectElement).value)">
              <optgroup v-for="group in USES" :key="group.group" :label="group.group">
                <option v-for="item in group.items" :key="item.value" :value="item.value">{{ item.label }}</option>
              </optgroup>
            </select>
          </td>
          <td class="py-1">
            <Input :model-value="choice.only.join(', ')" class="h-8 text-xs" placeholder="any" :aria-label="`Only rows with ${choice.name}`" @change="setOnly(index, ($event.target as HTMLInputElement).value)" />
          </td>
        </tr>
      </tbody>
    </table>

    <div v-if="columns.length" class="grid gap-2 text-sm sm:grid-cols-[auto_auto_auto_1fr_auto_1fr] sm:items-center">
      <span class="text-muted-foreground">Each row is</span>
      <select v-model="kind" :class="[SELECT, 'w-auto']" aria-label="Each row is">
        <option value="file">a file</option>
        <option value="folder">a folder</option>
      </select>
      <span class="text-muted-foreground">from</span>
      <Input v-model="sourceTemplate" class="font-mono text-xs" aria-label="From" />
      <span class="text-muted-foreground">saved as</span>
      <Input v-model="targetTemplate" class="font-mono text-xs" aria-label="Saved as" />
    </div>
    <p v-if="columns.length" class="text-xs text-muted-foreground">Filled from the Use column. Edit to combine columns.</p>
    <p v-if="unknown.length" class="text-xs text-destructive">The list has no column {{ unknown.join(', ') }}.</p>

    <div v-if="options" class="grid gap-3 rounded-md border border-border bg-muted/40 p-4 text-xs sm:grid-cols-4">
      <label>Separator<Input v-model="format.delimiter" maxlength="1" class="mt-1 font-mono" /></label>
      <label>Quotes
        <select :value="format.quote ?? ''" :class="[SELECT, 'mt-1']" @change="format = { ...format, quote: ($event.target as HTMLSelectElement).value || null }">
          <option value='"'>" (double)</option><option value="'">' (single)</option><option value="">Off</option>
        </select>
      </label>
      <label>Column names
        <select v-model="headerMode" :class="[SELECT, 'mt-1']">
          <option value="first_row">First row</option><option value="row">Row n</option>
          <option value="last_comment">Last comment line</option><option value="columns">Typed in</option>
        </select>
      </label>
      <label v-if="headerMode === 'row'">Row<Input v-model.number="headerRow" type="number" min="1" class="mt-1" /></label>
      <label v-if="headerMode === 'columns'" class="sm:col-span-2">Names, comma separated<Input :model-value="typedColumns" aria-label="Typed column names" @change="typedColumns = ($event.target as HTMLInputElement).value" class="mt-1 font-mono" /></label>
      <label>Comment lines<Input :model-value="format.comment ?? ''" maxlength="1" class="mt-1 font-mono" @update:model-value="format = { ...format, comment: String($event) || null }" /></label>
      <label>Empty values<Input :model-value="format.nulls.filter(Boolean).join(', ')" class="mt-1 font-mono" @change="format = { ...format, nulls: [...($event.target as HTMLInputElement).value.split(',').map((item) => item.trim()).filter(Boolean), ''] }" /></label>
      <label>Gzip
        <select :value="String(format.gzip)" :class="[SELECT, 'mt-1']" @change="format = { ...format, gzip: { true: true, false: false }[($event.target as HTMLSelectElement).value as 'true' | 'false'] ?? null }">
          <option value="null">Auto</option><option value="true">Yes</option><option value="false">No</option>
        </select>
      </label>
      <label>Requests per second, per node<Input v-model.number="rate" type="number" min="1" class="mt-1" /></label>
      <label class="sm:col-span-2">Files are read through
        <select v-model="connectorSel" :class="[SELECT, 'mt-1']">
          <option v-for="option in connectorOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
        </select>
      </label>
    </div>

    <div v-if="columns.length" class="flex flex-wrap items-center gap-3 border-t border-border pt-3">
      <div class="min-w-0 flex-1 text-sm">
        <p>
          {{ matching.length }} of {{ preview.rows.length }}{{ partial ? ' first' : '' }} rows
          <span v-if="targets.length" class="font-mono text-xs"><ArrowRight class="inline h-3 w-3 align-[-1px]" aria-hidden="true" /> {{ targets.slice(0, 2).join(', ') }}{{ targets.length > 2 ? `, +${targets.length - 2}` : '' }}</span>
        </p>
        <p class="text-xs text-muted-foreground">
          {{ hasSize ? 'Sizes are known, so no extra request per file.' : 'Files are linked, not copied.' }}
          <template v-if="checksumNames.length"> {{ checksumNames.join(' and ') }} is saved and checked on read.</template>
        </p>
        <p v-if="!connectorSel" class="text-xs text-destructive">Choose under More options how the files are read.</p>
      </div>
      <Button variant="ghost" size="sm" @click="options = !options">More options</Button>
      <Button :disabled="!ready" @click="start">Start import</Button>
    </div>

    <Notice v-if="started" tone="success">Import started. Its progress shows under Transfers.</Notice>
    <Notice v-if="failure" tone="error">{{ failure }}</Notice>
  </div>
</template>
