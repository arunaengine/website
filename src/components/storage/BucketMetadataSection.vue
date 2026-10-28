<script setup lang="ts">
// What describes a bucket: title, license, DOI and identifier rules. "Show as database" lists it
// with the databases. Read from the node that holds the bucket; group admins may change it.
import { computed, ref, watch } from 'vue'
import IdentifierLinksEditor from '@/components/settings/IdentifierLinksEditor.vue'
import BucketReleases from '@/components/storage/BucketReleases.vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Notice from '@/components/ui/Notice.vue'
import Spinner from '@/components/ui/Spinner.vue'
import Switch from '@/components/ui/Switch.vue'
import { useAruna } from '@/composables/useAruna'
import { useDatabases } from '@/composables/useDatabases'
import { apiErrorMessage, type BucketMetadata, type IdentifierParser } from '@/lib/api'
import { pageText, withPage } from '@/lib/databases'
import { Tags } from '@lucide/vue'

const props = defineProps<{ bucket: string; nodeId: string | null; canAdmin: boolean }>()

const { getBucketMetadata, putBucketMetadata, sessionEpoch } = useAruna()
const databases = useDatabases()

const EMPTY: BucketMetadata = { database: false, identifiers: [] }
// The stored metadata stays on screen while it is read again.
const stored = ref<BucketMetadata | null>(null)
const state = ref<'loading' | 'ready' | 'failed'>('loading')
const failure = ref<string | null>(null)
const draft = ref({ database: false, title: '', license: '', page: '' })
const editingRules = ref(false)
const busy = ref(false)
let runs = 0

function fill(metadata: BucketMetadata | null) {
  stored.value = metadata
  const value = metadata ?? EMPTY
  draft.value = { database: value.database, title: value.title ?? '', license: value.license ?? '', page: pageText(value.identifiers) }
}

async function load() {
  const run = ++runs
  failure.value = null
  if (state.value !== 'ready') state.value = 'loading'
  try {
    const metadata = await getBucketMetadata(props.bucket, props.nodeId)
    if (run !== runs) return
    fill(metadata)
    state.value = 'ready'
  } catch (cause) {
    if (run !== runs) return
    state.value = 'failed'
    failure.value = apiErrorMessage(cause)
  }
}

watch(() => [props.bucket, props.nodeId], () => {
  state.value = 'loading'
  stored.value = null
  editingRules.value = false
  void load()
}, { immediate: true })
watch(() => sessionEpoch.value, () => void load())

const current = computed(() => stored.value ?? EMPTY)
const changed = computed(() => {
  const value = current.value
  return draft.value.database !== value.database
    || draft.value.title.trim() !== (value.title ?? '')
    || draft.value.license.trim() !== (value.license ?? '')
    || draft.value.page.trim() !== pageText(value.identifiers)
})
const ruleCount = computed(() => current.value.parser?.rules.length ?? 0)

// Fields the form does not show (description, version, dataset, other identifiers) stay as stored.
async function store(next: BucketMetadata) {
  const run = ++runs
  const listed = current.value.database
  busy.value = true
  failure.value = null
  try {
    const saved = await putBucketMetadata(props.bucket, next, props.nodeId)
    if (run !== runs) return
    fill(saved)
    editingRules.value = false
    if (listed || saved?.database) void databases.reload()
  } catch (cause) {
    if (run === runs) failure.value = apiErrorMessage(cause)
  } finally {
    busy.value = false
  }
}

function save() {
  const value = current.value
  void store({
    ...value,
    database: draft.value.database,
    title: draft.value.title.trim() || null,
    license: draft.value.license.trim() || null,
    identifiers: withPage(value.identifiers, draft.value.page),
  })
}

const saveRules = (parser: IdentifierParser | null) => void store({ ...current.value, parser })
</script>

<template>
  <section class="surface">
    <header class="flex flex-wrap items-center gap-2 border-b border-border px-5 py-4">
      <Tags class="size-4 text-primary" />
      <h2 class="font-display text-sm font-semibold text-aruna-navy">Bucket metadata</h2>
      <Badge v-if="current.database" variant="secondary">Shown as database</Badge>
    </header>
    <div class="space-y-4 px-5 py-4 text-sm">
      <Spinner v-if="state === 'loading'" show-label label="Reading the metadata…" />
      <Notice v-else-if="state === 'failed'" tone="error">The metadata could not be read: {{ failure }}</Notice>
      <template v-else>
        <dl v-if="!canAdmin" class="grid grid-cols-[8rem_1fr] gap-x-4 gap-y-2">
          <dt class="text-muted-foreground">Title</dt><dd>{{ current.title || 'None' }}</dd>
          <dt class="text-muted-foreground">License</dt><dd>{{ current.license || 'None' }}</dd>
          <dt class="text-muted-foreground">DOI or link</dt><dd class="font-mono text-xs">{{ pageText(current.identifiers) || 'None' }}</dd>
          <dt class="text-muted-foreground">Identifier rules</dt><dd>{{ ruleCount }} {{ ruleCount === 1 ? 'rule' : 'rules' }}</dd>
        </dl>
        <template v-else>
          <label class="flex items-center gap-3">
            <Switch v-model:checked="draft.database" aria-label="Show as database" />
            <span>
              <span class="font-medium text-foreground">Show as database</span>
              <span class="block text-xs text-muted-foreground">Lists the bucket with the databases, so runs and datasets can use it.</span>
            </span>
          </label>
          <div class="grid gap-3 sm:grid-cols-[8rem_1fr] sm:items-center">
            <label for="bucket-title" class="text-muted-foreground">Title</label>
            <Input id="bucket-title" v-model="draft.title" />
            <label for="bucket-license" class="text-muted-foreground">License</label>
            <Input id="bucket-license" v-model="draft.license" placeholder="CC-BY-4.0 or a link" />
            <label for="bucket-page" class="text-muted-foreground">DOI or link</label>
            <Input id="bucket-page" v-model="draft.page" class="font-mono text-xs" placeholder="10.5281/zenodo.4247252" />
            <span class="text-muted-foreground">Identifier rules</span>
            <span>
              {{ ruleCount }} {{ ruleCount === 1 ? 'rule' : 'rules' }} ·
              <button type="button" class="text-primary hover:underline" @click="editingRules = !editingRules">Edit</button>
            </span>
          </div>
          <IdentifierLinksEditor
            v-if="editingRules"
            :parser="current.parser ?? null"
            :busy="busy"
            @save="saveRules"
            @close="editingRules = false"
          />
          <div class="flex items-center gap-2">
            <Button size="sm" :disabled="busy || !changed" @click="save">Save</Button>
            <Spinner v-if="busy" />
          </div>
        </template>
        <Notice v-if="failure" tone="error">{{ failure }}</Notice>
        <BucketReleases
          v-if="current.database"
          :bucket="bucket"
          :node-id="nodeId"
          :can-publish="canAdmin"
          :page="pageText(current.identifiers)"
        />
      </template>
    </div>
  </section>
</template>
