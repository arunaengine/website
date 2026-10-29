<script setup lang="ts">
// What describes a bucket: title, version, license, DOI and identifier rules, saved together.
// "Show as database" lists it with the databases. Group admins of the bucket may change it.
import { computed, ref, watch } from 'vue'
import IdentifierLinksEditor from '@/components/settings/IdentifierLinksEditor.vue'
import BucketReleases from '@/components/storage/BucketReleases.vue'
import Badge from '@/components/ui/Badge.vue'
import ExternalLink from '@/components/ui/ExternalLink.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Notice from '@/components/ui/Notice.vue'
import Spinner from '@/components/ui/Spinner.vue'
import Switch from '@/components/ui/Switch.vue'
import { useAruna } from '@/composables/useAruna'
import { useDatabases } from '@/composables/useDatabases'
import { apiErrorMessage, type BucketMetadata, type IdentifierParser } from '@/lib/api'
import { pageIdentifier, pageText, withPage } from '@/lib/databases'

const props = defineProps<{ bucket: string; nodeId: string | null; canAdmin: boolean }>()

const { getBucketMetadata, putBucketMetadata, sessionEpoch } = useAruna()
const databases = useDatabases()

const EMPTY: BucketMetadata = { database: false, identifiers: [] }
// The stored metadata stays on screen while it is read again.
const stored = ref<BucketMetadata | null>(null)
const state = ref<'loading' | 'ready' | 'failed'>('loading')
const failure = ref<string | null>(null)
const draft = ref({ database: false, title: '', version: '', license: '', page: '' })
const editingRules = ref(false)
// Rules picked in the editor wait for the one Save; undefined keeps the stored ones.
const draftParser = ref<IdentifierParser | null | undefined>(undefined)
const busy = ref(false)
const savedNow = ref(false)
let runs = 0

function fill(metadata: BucketMetadata | null) {
  stored.value = metadata
  draftParser.value = undefined
  const value = metadata ?? EMPTY
  draft.value = { database: value.database, title: value.title ?? '', version: value.version ?? '', license: value.license ?? '', page: pageText(value.identifiers) }
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
// The saved DOI as a doi.org link, or the saved link itself.
const pageLink = computed(() => pageIdentifier(pageText(current.value.identifiers)))
const changed = computed(() => {
  const value = current.value
  return draft.value.database !== value.database
    || draft.value.title.trim() !== (value.title ?? '')
    || draft.value.version.trim() !== (value.version ?? '')
    || draft.value.license.trim() !== (value.license ?? '')
    || draft.value.page.trim() !== pageText(value.identifiers)
    || draftParser.value !== undefined
})
const ruleParser = computed(() => (draftParser.value === undefined ? current.value.parser ?? null : draftParser.value))
const ruleCount = computed(() => ruleParser.value?.rules.length ?? 0)

// Fields the form does not show (description, dataset, other identifiers) stay as stored.
async function store(next: BucketMetadata) {
  const run = ++runs
  const listed = current.value.database
  busy.value = true
  savedNow.value = false
  failure.value = null
  try {
    const saved = await putBucketMetadata(props.bucket, next, props.nodeId)
    if (run !== runs) return
    fill(saved)
    editingRules.value = false
    if (listed || saved?.database) void databases.reload()
    savedNow.value = true
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
    version: draft.value.version.trim() || null,
    license: draft.value.license.trim() || null,
    identifiers: withPage(value.identifiers, draft.value.page),
    parser: ruleParser.value,
  })
}

function discard() {
  fill(stored.value)
  editingRules.value = false
}

function keepRules(parser: IdentifierParser | null) {
  draftParser.value = parser
  editingRules.value = false
}
</script>

<template>
  <section class="surface space-y-4 p-5">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h2 class="font-display text-sm font-semibold text-aruna-navy">Description</h2>
      <label v-if="canAdmin && state === 'ready'" class="flex items-center gap-2 text-sm">
        <Switch v-model:checked="draft.database" aria-label="Show as database" />
        Show as database
      </label>
      <Badge v-else-if="current.database" variant="secondary">Shown as database</Badge>
    </div>
    <Spinner v-if="state === 'loading'" show-label label="Reading the description…" />
    <Notice v-else-if="state === 'failed'" tone="error">The description could not be read: {{ failure }}</Notice>
    <template v-else>
      <dl v-if="!canAdmin" class="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[7rem_1fr_7rem_1fr]">
        <dt class="text-muted-foreground">Title</dt><dd>{{ current.title || 'None' }}</dd>
        <dt class="text-muted-foreground">Version</dt><dd>{{ current.version || 'None' }}</dd>
        <dt class="text-muted-foreground">License</dt><dd>{{ current.license || 'None' }}</dd>
        <dt class="text-muted-foreground">DOI or link</dt>
        <dd class="font-mono text-xs">
          <ExternalLink v-if="pageLink" :href="pageLink.url" :label="pageLink.value" />
          <template v-else>{{ pageText(current.identifiers) || 'None' }}</template>
        </dd>
      </dl>
      <div v-else class="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[7rem_1fr_7rem_1fr] sm:items-center">
        <label for="bucket-title" class="text-muted-foreground">Title</label>
        <Input id="bucket-title" v-model="draft.title" />
        <label for="bucket-version" class="text-muted-foreground">Version</label>
        <Input id="bucket-version" v-model="draft.version" placeholder="6.0" />
        <label for="bucket-license" class="text-muted-foreground">License</label>
        <Input id="bucket-license" v-model="draft.license" placeholder="CC-BY-4.0 or a link" />
        <label for="bucket-page" class="text-muted-foreground">DOI or link</label>
        <div class="flex min-w-0 items-center gap-2">
          <Input id="bucket-page" v-model="draft.page" class="min-w-0 flex-1 font-mono text-xs" placeholder="10.5281/zenodo.4247252" />
          <ExternalLink v-if="pageLink" :href="pageLink.url" label="Open" class="shrink-0 text-xs" :aria-label="`Open ${pageLink.value} in a new tab`" />
        </div>
      </div>
      <div class="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-sm">
        <span>
          <span class="text-muted-foreground">Identifier links</span>
          <span class="ml-4">{{ ruleCount ? `${ruleCount} ${ruleCount === 1 ? 'rule' : 'rules'}` : 'None yet' }}</span>
        </span>
        <button v-if="canAdmin && !editingRules" type="button" class="text-primary hover:underline" @click="editingRules = true">
          {{ ruleCount ? 'Edit link rules' : 'Add a link rule' }}
        </button>
      </div>
      <IdentifierLinksEditor
        v-if="canAdmin && editingRules"
        :parser="ruleParser"
        :busy="busy"
        @save="keepRules"
        @close="editingRules = false"
      />
      <div v-if="canAdmin" class="flex items-center justify-end gap-2">
        <Spinner v-if="busy" />
        <span v-else-if="savedNow && !changed" role="status" class="text-[11px] text-muted-foreground">Saved.</span>
        <span v-else-if="draftParser !== undefined" class="text-[11px] text-muted-foreground">Press Save to keep the rules.</span>
        <Button variant="ghost" size="sm" :disabled="busy || !changed" @click="discard">Discard</Button>
        <Button size="sm" :disabled="busy || !changed" @click="save">Save</Button>
      </div>
    </template>
    <Notice v-if="failure && state !== 'failed'" tone="error">{{ failure }}</Notice>
  </section>
  <BucketReleases
    v-if="state === 'ready' && current.database"
    :bucket="bucket"
    :node-id="nodeId"
    :can-publish="canAdmin"
    :page="pageText(current.identifiers)"
  />
</template>
