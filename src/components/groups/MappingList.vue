<script setup lang="ts">
// The two-way mappings of a linked bucket, each with an example and Apply for files already in Aruna.
import { computed, ref, watch } from 'vue'
import { X } from '@lucide/vue'
import DocsLink from '@/components/ui/DocsLink.vue'
import JobProgress from '@/components/storage/JobProgress.vue'
import PagedList from '@/components/storage/PagedList.vue'
import Button from '@/components/ui/Button.vue'
import IconButton from '@/components/ui/IconButton.vue'
import Input from '@/components/ui/Input.vue'
import Notice from '@/components/ui/Notice.vue'
import Spinner from '@/components/ui/Spinner.vue'
import { isUnsupportedEndpoint, useAruna } from '@/composables/useAruna'
import { useCursorPage } from '@/composables/useCursorPage'
import { OFFLINE_WRITE_HINT, useConnectivity } from '@/lib/connectivity'
import { previewFileRules, previewMove, startMove, type BackendImport, type FileRulePreview } from '@/lib/api'
import { countWords } from '@/lib/bucketNaming'
import { mappingProblem, movePlan, toRule, type Mapping } from '@/lib/bucketMappings'
import { organizeError, type ProgressJob } from '@/lib/organize'
import { moveRefusal } from '@/lib/storageRules'

const props = defineProps<{
  groupId: string
  link: BackendImport
  modelValue: Mapping[]
  /** The mappings the node has; only those can be applied. */
  saved: Mapping[]
  job: ProgressJob | null
  controlling?: boolean
}>()
const emit = defineEmits<{
  (e: 'update:modelValue', value: Mapping[]): void
  (e: 'started'): void
  (e: 'control', action: 'pause' | 'resume' | 'abort'): void
}>()

const { apiBaseUrl, authToken, sessionEpoch } = useAruna()
const { writesDisabled } = useConnectivity()

const example = ref<number | null>(null)
// A confirm holds a copy of the saved rule it counted; any edit drops it.
const asking = ref<{ index: number; mapping: Mapping; count: number; complete: boolean } | null>(null)
let revision = 0
const applied = ref<number | null>(null)
const busy = ref(false)
// The mapping whose Apply… is counting its files.
const counting = ref<number | null>(null)
const error = ref<string | null>(null)

function client() {
  return { baseUrl: apiBaseUrl.value, token: authToken.value }
}

const examples = useCursorPage<FileRulePreview>(async (query) => {
  const mapping = props.modelValue[example.value ?? -1]
  if (!mapping) return { items: [], total: 0, complete: true }
  const page = await previewFileRules(props.groupId, props.link.import_id, [toRule(mapping)], query.after, client())
  return { items: page.files, total: 0, complete: false, next: page.next }
})
const exampleRange = computed(() => {
  const shown = examples.items.value.length
  return shown ? `${examples.offset.value + 1}-${examples.offset.value + shown}` : ''
})

watch(
  () => [props.link.import_id, sessionEpoch.value],
  () => {
    example.value = null
    asking.value = null
    applied.value = null
    error.value = null
    examples.reset()
  },
)
// A rule that is no longer saved cannot be applied.
watch(
  () => props.saved,
  () => {
    revision++
    if (asking.value && !isSaved(asking.value.mapping)) asking.value = null
  },
)

function isSaved(mapping: Mapping): boolean {
  const rule = toRule(mapping)
  return props.saved.some((other) => JSON.stringify(toRule(other)) === JSON.stringify(rule))
}

function update(index: number, side: keyof Mapping, value: string) {
  const next = props.modelValue.map((mapping, at) => (at === index ? { ...mapping, [side]: value } : mapping))
  if (example.value === index) closeExample()
  revision++
  asking.value = null
  emit('update:modelValue', next)
}

function add() {
  emit('update:modelValue', [...props.modelValue, { aruna: '', storage: '' }])
}

function remove(index: number) {
  // A removal would move the row that Apply… is counting for.
  if (counting.value !== null) return
  revision++
  example.value = null
  asking.value = null
  examples.reset()
  emit('update:modelValue', props.modelValue.filter((_, at) => at !== index))
}

function closeExample() {
  example.value = null
  examples.reset()
}

function toggleExample(index: number) {
  if (example.value === index) return closeExample()
  examples.reset()
  example.value = index
  void examples.load('')
}

async function askApply(index: number) {
  const current = props.modelValue[index]
  if (!current || !isSaved(current) || busy.value) return
  const mapping = { ...current }
  busy.value = true
  counting.value = index
  error.value = null
  const link = props.link.import_id
  const asked = revision
  try {
    const page = await previewMove(props.groupId, link, movePlan(mapping), { limit: 1 }, client())
    if (link === props.link.import_id && asked === revision) {
      asking.value = { index, mapping, count: page.total, complete: page.complete }
    }
  } catch (err) {
    if (link === props.link.import_id) error.value = isUnsupportedEndpoint(err) ? 'This node cannot do this yet.' : organizeError(err)
  } finally {
    busy.value = false
    counting.value = null
  }
}

async function apply() {
  const ask = asking.value
  const mapping = ask?.mapping
  if (!ask || !mapping || !isSaved(mapping) || busy.value || props.job || writesDisabled.value) return
  busy.value = true
  error.value = null
  const link = props.link.import_id
  try {
    await startMove(props.groupId, link, movePlan(mapping), client())
    if (link !== props.link.import_id) return
    applied.value = ask.index
    asking.value = null
    emit('started')
  } catch (err) {
    if (link === props.link.import_id) error.value = moveRefusal(err) ?? organizeError(err)
  } finally {
    busy.value = false
  }
}

const COLUMNS = 'grid grid-cols-[minmax(0,1fr)_1.5rem_minmax(0,1fr)_11rem] items-center gap-2'
</script>

<template>
  <div>
    <div class="flex items-center gap-2">
      <span class="flex-1 text-xs font-medium">Mappings</span>
      <Button variant="ghost" size="sm" class="h-7 px-2 text-aruna-navy dark:text-foreground" @click="add">+ Add mapping</Button>
    </div>
    <div class="mt-1 rounded-md border border-border text-xs">
      <div :class="[COLUMNS, 'border-b border-border px-3 py-1.5 text-[11px] uppercase tracking-wide text-muted-foreground']">
        <span>Aruna path</span><span /><span>Storage path</span><span />
      </div>
      <div v-for="(mapping, index) in modelValue" :key="index" class="border-b border-border px-3 py-1.5" data-testid="mapping">
        <div :class="COLUMNS">
          <Input
            :model-value="mapping.aruna"
            class="h-[1.9rem] font-mono text-xs"
            placeholder="proteins/{name}"
            aria-label="Aruna path"
            @update:model-value="(value: string | number) => update(index, 'aruna', String(value))"
          />
          <span class="text-muted-foreground">⇆</span>
          <Input
            :model-value="mapping.storage"
            class="h-[1.9rem] font-mono text-xs"
            placeholder="*.faa"
            aria-label="Storage path"
            @update:model-value="(value: string | number) => update(index, 'storage', String(value))"
          />
          <span class="flex justify-end gap-0.5">
            <Button
              variant="ghost"
              size="sm"
              class="h-7 px-2 text-aruna-navy dark:text-foreground"
              :disabled="Boolean(mappingProblem(mapping))"
              @click="toggleExample(index)"
            >
              Example
            </Button>
            <Button
              variant="ghost"
              size="sm"
              class="h-7 px-2 text-aruna-navy dark:text-foreground"
              :disabled="!isSaved(mapping) || busy || Boolean(job)"
              :aria-busy="counting === index"
              :title="isSaved(mapping) ? undefined : 'Save first'"
              @click="askApply(index)"
            >
              <Spinner v-if="counting === index" label="Counting files" class="text-current" /> Apply…
            </Button>
            <IconButton label="Remove" :disabled="counting !== null" @click="remove(index)"><X class="size-3.5" /></IconButton>
          </span>
        </div>
        <p v-if="mapping.aruna && mapping.storage && mappingProblem(mapping)" class="mt-1 text-destructive">
          {{ mappingProblem(mapping) }}
        </p>

        <div v-if="example === index" class="relative mt-2 rounded-md border border-border bg-muted/50 px-3 py-2 pr-8">
          <IconButton label="Close example" class="absolute right-1 top-1" @click="closeExample"><X class="size-3.5" /></IconButton>
          <PagedList
            :total="0"
            :complete="false"
            :summary="exampleRange"
            :offset="examples.offset.value"
            :shown="examples.items.value.length"
            filter=""
            :filterable="false"
            :busy="examples.busy.value"
            :has-next="examples.hasNext.value"
            :has-prev="examples.hasPrev.value"
            @next="examples.next()"
            @prev="examples.prev()"
          >
            <template #head>
              <div :class="['grid grid-cols-[minmax(0,1fr)_1.5rem_minmax(0,1fr)] gap-2 text-[11px] uppercase tracking-wide text-muted-foreground']">
                <span>Aruna path</span><span /><span>Storage path</span>
              </div>
            </template>
            <li
              v-for="file in examples.items.value"
              :key="file.path"
              class="grid grid-cols-[minmax(0,1fr)_1.5rem_minmax(0,1fr)] gap-2 px-3 py-1 font-mono"
            >
              <span class="truncate" :title="file.key ?? ''">{{ file.key ?? '(not shown)' }}</span>
              <span class="font-sans text-muted-foreground">⇆</span>
              <span class="truncate" :title="file.path">{{ file.path }}</span>
            </li>
          </PagedList>
          <p v-if="examples.error.value" class="mt-1 text-destructive">{{ examples.error.value }}</p>
        </div>

        <div v-if="asking?.index === index" class="mt-2 rounded-md border border-border bg-muted/50 px-3 py-2">
          <div class="flex items-center gap-2">
            <span class="flex-1">
              {{ countWords(asking.count, asking.complete) }} in Aruna match <span class="font-mono">{{ asking.mapping.storage }}</span> in
              storage and get the Aruna path <span class="font-mono">{{ asking.mapping.aruna }}</span>.
            </span>
            <Button variant="ghost" size="sm" @click="asking = null">Cancel</Button>
            <Button
              size="sm"
              :disabled="busy || Boolean(job) || writesDisabled || (!asking.count && asking.complete)"
              :aria-busy="busy && counting === null"
              :title="writesDisabled ? OFFLINE_WRITE_HINT : undefined"
              @click="apply"
            >
              <Spinner v-if="busy && counting === null" label="Starting the move" class="text-current" />
              Move {{ countWords(asking.count, asking.complete) }}
            </Button>
          </div>
          <p class="mt-1 text-amber-800 dark:text-amber-300">
            Only the mapping changes, files in storage stay. Old Aruna paths stop working.
          </p>
        </div>

        <JobProgress
          v-if="applied === index && job?.kind === 'move'"
          class="mt-2"
          :job="job"
          :busy="controlling"
          @control="(action) => emit('control', action)"
        />
      </div>
      <div :class="[COLUMNS, 'px-3 py-1.5 text-muted-foreground']">
        <span>other paths</span><span>⇆</span><span>same path</span><span />
      </div>
    </div>
    <p class="mt-1 text-[11px] text-muted-foreground">
      Mappings work both ways.
      <DocsLink topic="storage-backend" section="How mappings work" label="How mappings work" class="text-[11px]" />
    </p>
    <JobProgress
      v-if="job?.kind === 'move' && applied === null"
      class="mt-2"
      :job="job"
      :busy="controlling"
      @control="(action) => emit('control', action)"
    />
    <Notice v-if="error" tone="error" class="mt-2">{{ error }}</Notice>
  </div>
</template>
