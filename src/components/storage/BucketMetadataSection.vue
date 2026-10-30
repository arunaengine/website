<script setup lang="ts">
// What describes a bucket: title, version, license, DOI and identifier rules, saved together.
// "Show as database" lists it with the databases. Group admins of the bucket may change it.
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import ValueInput from '@/components/metadata/editor/ValueInput.vue'
import IdentifierLinksEditor from '@/components/settings/IdentifierLinksEditor.vue'
import BucketReleases from '@/components/storage/BucketReleases.vue'
import ExternalLink from '@/components/ui/ExternalLink.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Notice from '@/components/ui/Notice.vue'
import SectionHeading from '@/components/ui/SectionHeading.vue'
import Spinner from '@/components/ui/Spinner.vue'
import Switch from '@/components/ui/Switch.vue'
import { useAruna } from '@/composables/useAruna'
import { useDatabases } from '@/composables/useDatabases'
import { apiErrorMessage, type BucketMetadata, type IdentifierParser } from '@/lib/api'
import { LICENSE_PRESETS } from '@/lib/crate/editor'
import { pageIdentifier, pageText, withPage } from '@/lib/databases'
import { licenseText, licenseUrl, spdxId } from '@/lib/licenses'
import { FileJson2, FileText, Link2 } from '@lucide/vue'

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
  draft.value = { database: value.database, title: value.title ?? '', version: value.version ?? '', license: licenseUrl(value.license ?? ''), page: pageText(value.identifiers) }
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
// A typed DOI or link that reads as neither is refused, never dropped on Save.
const pageInvalid = computed(() => Boolean(draft.value.page.trim()) && !pageIdentifier(draft.value.page))
// The identifiers the DOI or link field does not show, each as its link.
const otherIdentifiers = computed(() => current.value.identifiers.filter((item) => item.value !== pageText(current.value.identifiers)))
const license = computed(() => {
  const value = current.value.license?.trim()
  if (!value) return null
  const url = licenseUrl(value)
  return { text: licenseText(value), url: /^https?:\/\//i.test(url) ? url : null, spdx: spdxId(value) }
})
const changed = computed(() => {
  const value = current.value
  return draft.value.database !== value.database
    || draft.value.title.trim() !== (value.title ?? '')
    || draft.value.version.trim() !== (value.version ?? '')
    || draft.value.license.trim() !== licenseUrl(value.license ?? '')
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
  <section>
    <SectionHeading title="Description" :icon="FileText">
      <template v-if="canAdmin && state === 'ready'" #actions>
        <label class="flex items-center gap-2 text-sm">
          <Switch v-model:checked="draft.database" aria-label="Show as database" />
          Show as database
        </label>
      </template>
    </SectionHeading>
    <div class="surface space-y-4 p-5">
    <Spinner v-if="state === 'loading'" show-label label="Reading the description…" />
    <Notice v-else-if="state === 'failed'" tone="error">The description could not be read: {{ failure }}</Notice>
    <template v-else>
      <dl v-if="!canAdmin" class="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[7rem_1fr_7rem_1fr]">
        <dt class="text-muted-foreground">Title</dt><dd>{{ current.title || 'None' }}</dd>
        <dt class="text-muted-foreground">Version</dt><dd>{{ current.version || 'None' }}</dd>
        <dt class="text-muted-foreground">License</dt>
        <dd>
          <template v-if="license">
            <ExternalLink v-if="license.url" :href="license.url" :label="license.text" />
            <template v-else>{{ license.text }}</template>
            <span v-if="license.spdx && license.spdx !== license.text" class="ml-2 font-mono text-xs text-muted-foreground">{{ license.spdx }}</span>
          </template>
          <template v-else>None</template>
        </dd>
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
        <span class="text-muted-foreground">License</span>
        <ValueInput :model-value="{ kind: 'url', value: draft.license }" label="License" :presets="LICENSE_PRESETS" @update:model-value="(next) => (draft.license = next.value)" />
        <label for="bucket-page" class="text-muted-foreground">DOI or link</label>
        <div class="flex min-w-0 items-center gap-2">
          <Input id="bucket-page" v-model="draft.page" class="min-w-0 flex-1 font-mono text-xs" placeholder="10.5281/zenodo.4247252" :invalid="pageInvalid ? 'error' : undefined" />
          <ExternalLink v-if="pageLink" :href="pageLink.url" label="Open" class="shrink-0 text-xs" :aria-label="`Open ${pageLink.value} in a new tab`" />
        </div>
        <p v-if="pageInvalid" role="alert" class="text-xs text-destructive sm:col-start-4">Enter a DOI such as 10.5281/zenodo.4247252 or a link starting with https://.</p>
      </div>
      <div v-if="otherIdentifiers.length || current.dataset" class="grid gap-x-6 gap-y-2 border-t border-border pt-3 text-sm sm:grid-cols-[7rem_1fr]">
        <template v-if="otherIdentifiers.length">
          <span class="text-muted-foreground">Identifiers</span>
          <span class="flex flex-wrap gap-x-4 gap-y-1">
            <span v-for="item in otherIdentifiers" :key="`${item.name}:${item.value}`">{{ item.name }} <ExternalLink :href="item.url" :label="item.value" class="font-mono text-xs" /></span>
          </span>
        </template>
        <template v-if="current.dataset">
          <span class="text-muted-foreground">Dataset</span>
          <span>
            <Button variant="outline" size="sm" as-child>
              <RouterLink :to="{ name: 'dataset', params: { id: current.dataset } }"><FileJson2 class="h-3.5 w-3.5" /> Open the dataset</RouterLink>
            </Button>
          </span>
        </template>
      </div>
      <div class="grid items-center gap-x-6 gap-y-2 border-t border-border pt-3 text-sm sm:grid-cols-[7rem_1fr_auto]">
        <span class="text-muted-foreground">Identifier links</span>
        <span>{{ ruleCount ? `${ruleCount} ${ruleCount === 1 ? 'rule' : 'rules'}` : 'None yet' }}</span>
        <Button v-if="canAdmin && !editingRules" variant="outline" size="sm" @click="editingRules = true">
          <Link2 class="h-3.5 w-3.5" /> {{ ruleCount ? 'Edit link rules' : 'Add a link rule' }}
        </Button>
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
        <Button size="sm" :disabled="busy || !changed || pageInvalid" @click="save">Save</Button>
      </div>
    </template>
    <Notice v-if="failure && state !== 'failed'" tone="error">{{ failure }}</Notice>
    </div>
  </section>
  <BucketReleases
    v-if="state === 'ready' && current.database"
    :bucket="bucket"
    :node-id="nodeId"
    :can-publish="canAdmin"
    :page="pageText(current.identifiers)"
  />
</template>
