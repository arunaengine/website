<script setup lang="ts">
// What describes a bucket comes from its dataset: title, description, version, license and
// identifiers, edited in the dataset editor. The bucket keeps "Show as database" and its
// identifier rules, saved together. Group admins of the bucket may change them.
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import IdentifierLinksEditor from '@/components/settings/IdentifierLinksEditor.vue'
import BucketDatasetForm from '@/components/storage/BucketDatasetForm.vue'
import BucketReleases from '@/components/storage/BucketReleases.vue'
import ExternalLink from '@/components/ui/ExternalLink.vue'
import Button from '@/components/ui/Button.vue'
import Notice from '@/components/ui/Notice.vue'
import SectionHeading from '@/components/ui/SectionHeading.vue'
import Spinner from '@/components/ui/Spinner.vue'
import Switch from '@/components/ui/Switch.vue'
import { useAruna } from '@/composables/useAruna'
import { useDatabases } from '@/composables/useDatabases'
import { apiErrorMessage, type BucketMetadata, type BucketMetadataAnswer, type DatasetDescription, type IdentifierParser } from '@/lib/api'
import { identifierUrl, pageText } from '@/lib/databases'
import { licenseText, licenseUrl, spdxId } from '@/lib/licenses'
import { FileJson2, FilePlus2, FileText, Link2, Pencil } from '@lucide/vue'

const props = defineProps<{ bucket: string; nodeId: string | null; canAdmin: boolean }>()

const { getBucketMetadata, putBucketMetadata, sessionEpoch } = useAruna()
const databases = useDatabases()

const EMPTY: BucketMetadata = { database: false }
const stored = ref<BucketMetadata | null>(null)
const described = ref<DatasetDescription | null>(null)
const unavailable = ref<string | null>(null)
const state = ref<'loading' | 'ready' | 'failed'>('loading')
const failure = ref<string | null>(null)
const draftDatabase = ref(false)
const editingRules = ref(false)
// Rules picked in the editor wait for the one Save; undefined keeps the stored ones.
const draftParser = ref<IdentifierParser | null | undefined>(undefined)
const choosing = ref<'describe' | 'link' | null>(null)
const busy = ref(false)
const savedNow = ref(false)
let runs = 0

function fill(answer: BucketMetadataAnswer) {
  stored.value = answer.metadata
  described.value = answer.description
  unavailable.value = answer.description_unavailable ?? null
  draftParser.value = undefined
  draftDatabase.value = answer.metadata?.database ?? false
}

async function load() {
  const run = ++runs
  failure.value = null
  if (state.value !== 'ready') state.value = 'loading'
  try {
    const answer = await getBucketMetadata(props.bucket, props.nodeId)
    if (run !== runs) return
    fill(answer)
    state.value = 'ready'
  } catch (cause) {
    if (run !== runs) return
    state.value = 'failed'
    failure.value = apiErrorMessage(cause)
  }
}

// Another bucket, account or realm shows nothing of the previous one; its answers are dropped.
watch(() => [props.bucket, props.nodeId, sessionEpoch.value], () => {
  ++runs
  state.value = 'loading'
  stored.value = null
  described.value = null
  unavailable.value = null
  failure.value = null
  draftDatabase.value = false
  draftParser.value = undefined
  editingRules.value = false
  choosing.value = null
  busy.value = false
  savedNow.value = false
  void load()
}, { immediate: true })

const current = computed(() => stored.value ?? EMPTY)
const datasetId = computed(() => current.value.dataset ?? null)
const license = computed(() => {
  const value = described.value?.license?.trim()
  if (!value) return null
  const url = licenseUrl(value)
  return { text: licenseText(value), url: /^https?:\/\//i.test(url) ? url : null, spdx: spdxId(value) }
})
const identifiers = computed(() => (described.value?.identifiers ?? []).map((item) => ({ ...item, url: identifierUrl(item) })))
const changed = computed(() => draftDatabase.value !== current.value.database || draftParser.value !== undefined)
const ruleParser = computed(() => (draftParser.value === undefined ? current.value.parser ?? null : draftParser.value))
const ruleCount = computed(() => ruleParser.value?.rules.length ?? 0)

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
    if (listed || saved.metadata?.database) void databases.reload()
    savedNow.value = true
  } catch (cause) {
    if (run === runs) failure.value = apiErrorMessage(cause)
  } finally {
    if (run === runs) busy.value = false
  }
}

function save() {
  void store({ ...current.value, database: draftDatabase.value, parser: ruleParser.value })
}

function discard() {
  draftParser.value = undefined
  draftDatabase.value = current.value.database
  editingRules.value = false
}

function keepRules(parser: IdentifierParser | null) {
  draftParser.value = parser
  editingRules.value = false
}

// A described or linked bucket answers its new metadata; any read still under way is dropped.
function linked(answer: BucketMetadataAnswer) {
  ++runs
  fill(answer)
  choosing.value = null
  state.value = 'ready'
  if (answer.metadata?.database) void databases.reload()
}
</script>

<template>
  <section>
    <SectionHeading title="Description" :icon="FileText">
      <template v-if="canAdmin && state === 'ready'" #actions>
        <label class="flex items-center gap-2 text-sm" :title="datasetId ? undefined : 'Describe the bucket as a dataset first.'">
          <Switch v-model:checked="draftDatabase" :disabled="!datasetId" aria-label="Show as database" />
          Show as database
        </label>
      </template>
    </SectionHeading>
    <div class="surface space-y-4 p-5">
    <Spinner v-if="state === 'loading'" show-label label="Reading the description…" />
    <Notice v-else-if="state === 'failed'" tone="error">The description could not be read: {{ failure }}</Notice>
    <template v-else>
      <div v-if="datasetId" class="space-y-3">
        <template v-if="described">
          <div>
            <p class="text-base font-medium text-foreground [overflow-wrap:anywhere]">{{ described.title || 'Untitled dataset' }}</p>
            <p v-if="described.description" class="mt-1 whitespace-pre-line text-sm text-muted-foreground">{{ described.description }}</p>
          </div>
          <dl class="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[7rem_1fr]">
            <dt class="text-muted-foreground">Version</dt><dd>{{ described.version || 'None' }}</dd>
            <dt class="text-muted-foreground">License</dt>
            <dd>
              <template v-if="license">
                <ExternalLink v-if="license.url" :href="license.url" :label="license.text" />
                <template v-else>{{ license.text }}</template>
                <span v-if="license.spdx && license.spdx !== license.text" class="ml-2 font-mono text-xs text-muted-foreground">{{ license.spdx }}</span>
              </template>
              <template v-else>None</template>
            </dd>
            <dt class="text-muted-foreground">Identifiers</dt>
            <dd class="flex flex-wrap gap-x-4 gap-y-1">
              <span v-for="item in identifiers" :key="`${item.name}:${item.value}`">{{ item.name }} <ExternalLink :href="item.url" :label="item.value" class="font-mono text-xs" /></span>
              <template v-if="!identifiers.length">None</template>
            </dd>
          </dl>
        </template>
        <Notice v-else tone="warning">The dataset that describes this bucket cannot be read now{{ unavailable ? `: ${unavailable}` : '' }}.</Notice>
        <div class="flex flex-wrap gap-2">
          <Button v-if="canAdmin" variant="outline" size="sm" as-child>
            <RouterLink :to="{ name: 'dataset-edit', params: { id: datasetId } }"><Pencil class="h-3.5 w-3.5" /> Edit the dataset</RouterLink>
          </Button>
          <Button variant="outline" size="sm" as-child>
            <RouterLink :to="{ name: 'dataset', params: { id: datasetId } }"><FileJson2 class="h-3.5 w-3.5" /> Open the dataset</RouterLink>
          </Button>
        </div>
      </div>
      <template v-else>
        <p class="text-sm text-muted-foreground">No dataset describes this bucket yet. Its title, description, version, license and identifiers live in a dataset.</p>
        <div v-if="canAdmin && !choosing" class="flex flex-wrap gap-2">
          <Button size="sm" @click="choosing = 'describe'"><FilePlus2 class="h-3.5 w-3.5" /> Describe this bucket as a dataset</Button>
          <Button variant="outline" size="sm" @click="choosing = 'link'"><Link2 class="h-3.5 w-3.5" /> Link an existing dataset</Button>
        </div>
        <BucketDatasetForm
          v-if="canAdmin && choosing"
          :mode="choosing"
          :bucket="bucket"
          :node-id="nodeId"
          :metadata="current"
          @linked="linked"
          @close="choosing = null"
        />
      </template>
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
        <span v-else-if="savedNow && !changed" role="status" class="text-xs text-muted-foreground">Saved.</span>
        <span v-else-if="draftParser !== undefined" class="text-xs text-muted-foreground">Press Save to keep the rules.</span>
        <Button variant="ghost" size="sm" :disabled="busy || !changed" @click="discard">Discard</Button>
        <Button size="sm" :disabled="busy || !changed" @click="save">Save</Button>
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
    :page="pageText(described?.identifiers ?? [])"
  />
</template>
