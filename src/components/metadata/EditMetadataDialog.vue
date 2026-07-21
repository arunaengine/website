<script setup lang="ts">
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogClose from '@/components/ui/DialogClose.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Textarea from '@/components/ui/Textarea.vue'
import Switch from '@/components/ui/Switch.vue'
import Tabs from '@/components/ui/Tabs.vue'
import TabsList from '@/components/ui/TabsList.vue'
import TabsTrigger from '@/components/ui/TabsTrigger.vue'
import TabsContent from '@/components/ui/TabsContent.vue'
import Select from '@/components/ui/Select.vue'
import DatasetFilesEditor from '@/components/metadata/DatasetFilesEditor.vue'
import { Pencil, Plus, X } from '@lucide/vue'
import { computed, ref, shallowRef, watch } from 'vue'
import { useAruna } from '@/composables/useAruna'
import { ApiError, type MetadataDocumentSummary } from '@/lib/api'
import { applyDataEntities, dataEntitiesOf, type DataEntity } from '@/lib/dataEntities'
import { licenseEntity } from '@/lib/profiles/rocrate'
import { validateProfileData } from '@/lib/profiles/validate'
import type { MetadataProfile } from '@/data/types'

const props = defineProps<{
  open: boolean
  documentId: string
  // The document's resolved profile, when one exists — drives the (non-blocking)
  // validation panel in the Fields tab.
  profile?: MetadataProfile | null
}>()
const emit = defineEmits<{
  (e: 'update:open', v: boolean): void
  (e: 'saved', summary: MetadataDocumentSummary): void
}>()

const { saving, fetchRoCrateRaw, getMetadataDocument, replaceMetadataRoCrate, metadata, metadataItems } = useAruna()

const loading = ref(false)
const loadError = ref<string | null>(null)
const saveError = ref<string | null>(null)
const rawError = ref<string | null>(null)
const activeTab = ref<'fields' | 'files' | 'raw'>('fields')

// The pristine, unresolved crate fetched from the backend; edits mutate a clone.
// Shallow: structuredClone in buildFromFields rejects reactive proxies.
const pristine = shallowRef<unknown>(null)
const rawText = ref('')
const loadedDocumentId = ref<string | null>(null)
let loadToken = 0

const name = ref('')
const description = ref('')
const keywordsText = ref('')
const datePublished = ref('')
const license = ref('')
// Preserve the license shape: a plain string stays a string, an object/absent
// value is written as { "@id": … } plus a contextual CreativeWork entity.
const licenseWasString = ref(false)
const isPublic = ref(false)

// Additional scalar root properties beyond the managed built-ins. Only string/
// number/boolean values seed as rows; structured values stay untouched in the
// crate (edit them via the Raw JSON tab).
const MANAGED_KEYS = new Set([
  '@id', '@type', '@context', 'name', 'description', 'keywords', 'datePublished',
  'license', 'hasPart', 'author', 'creator', 'contributor', 'conformsTo',
  'mentions', 'about', 'identifier',
])
interface CustomFieldRow {
  key: string
  value: string
}
const customFields = ref<CustomFieldRow[]>([])
let seededCustomKeys: string[] = []

// Cross-document references: root `mentions` entries whose @id matches a
// catalog document's graph IRI are editable here; anything else in `mentions`
// is preserved verbatim.
const relatedIds = ref<string[]>([])
let preservedMentions: unknown[] = []
const relatedPick = ref('')

// The dataset's data entities, seeded from the crate and written back through
// buildFromFields so file edits ride the same parsed-crate path as the fields.
const files = ref<DataEntity[]>([])

watch(
  [() => props.open, () => props.documentId],
  ([open]) => {
    ++loadToken
    loadedDocumentId.value = null
    pristine.value = null
    if (!open) {
      loading.value = false
      return
    }
    activeTab.value = 'fields'
    saveError.value = null
    rawError.value = null
    void load(props.documentId, loadToken)
  },
)

function reload() {
  const token = ++loadToken
  loadedDocumentId.value = null
  pristine.value = null
  void load(props.documentId, token)
}

async function load(documentId: string, token: number) {
  loading.value = true
  loadError.value = null
  try {
    const [crate, summary] = await Promise.all([
      fetchRoCrateRaw(documentId),
      getMetadataDocument(documentId),
    ])
    if (token !== loadToken || !props.open || documentId !== props.documentId) return
    pristine.value = crate
    loadedDocumentId.value = documentId
    isPublic.value = summary.public
    seedFields(crate)
    rawText.value = JSON.stringify(crate, null, 2)
  } catch (err) {
    if (token === loadToken) loadError.value = err instanceof Error ? err.message : String(err)
  } finally {
    if (token === loadToken) loading.value = false
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function graphOf(crate: unknown): Array<Record<string, unknown>> {
  if (!isRecord(crate)) return []
  const g = crate['@graph']
  return Array.isArray(g) ? g.filter(isRecord) : []
}

// The root dataset is the entity referenced by the ro-crate-metadata.json
// descriptor's `about`, falling back to the first non-descriptor entity.
function rootDatasetId(crate: unknown): string | undefined {
  const g = graphOf(crate)
  const descriptor = g.find((e) => e['@id'] === 'ro-crate-metadata.json')
  if (descriptor && isRecord(descriptor.about)) {
    const id = descriptor.about['@id']
    if (typeof id === 'string') return id
  }
  return g.find((e) => e['@id'] !== 'ro-crate-metadata.json')?.['@id'] as string | undefined
}

function findRoot(crate: unknown): Record<string, unknown> | undefined {
  const g = graphOf(crate)
  const id = rootDatasetId(crate)
  const byId = id ? g.find((e) => e['@id'] === id) : undefined
  return byId ?? g.find((e) => e['@id'] !== 'ro-crate-metadata.json')
}

function stringField(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return stringField(value[0])
  return ''
}

function arrayField(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(stringField).filter(Boolean)
  const single = stringField(value)
  return single ? [single] : []
}

function licenseIri(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return licenseIri(value[0])
  if (isRecord(value)) return typeof value['@id'] === 'string' ? value['@id'] : ''
  return ''
}

function refIdOf(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (isRecord(value) && typeof value['@id'] === 'string') return value['@id']
  return undefined
}

function seedFields(crate: unknown) {
  const root = findRoot(crate)
  name.value = stringField(root?.name)
  description.value = stringField(root?.description)
  keywordsText.value = arrayField(root?.keywords).join(', ')
  datePublished.value = stringField(root?.datePublished)
  licenseWasString.value = typeof root?.license === 'string'
  license.value = licenseIri(root?.license)

  const rows: CustomFieldRow[] = []
  for (const [key, value] of Object.entries(root ?? {})) {
    if (MANAGED_KEYS.has(key)) continue
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      rows.push({ key, value: String(value) })
    }
  }
  customFields.value = rows
  seededCustomKeys = rows.map((row) => row.key)

  files.value = dataEntitiesOf(crate)

  const mentions = Array.isArray(root?.mentions) ? root.mentions : root?.mentions ? [root.mentions] : []
  const catalogIris = new Set(metadataItems.value.map((item) => item.graph_iri))
  relatedIds.value = []
  preservedMentions = []
  for (const mention of mentions) {
    const id = refIdOf(mention)
    if (id && catalogIris.has(id)) relatedIds.value.push(id)
    else preservedMentions.push(mention)
  }
  relatedPick.value = ''
}

function buildFromFields(): unknown {
  const clone: unknown = structuredClone(pristine.value)
  const root = findRoot(clone)
  if (!root) throw new Error('This crate has no root dataset entity to edit.')
  // File edits rebuild hasPart and File entities before mentions are rewritten, so
  // a removed file still counted as referenced by an existing mention is preserved.
  applyDataEntities(clone, files.value)
  root.name = name.value.trim()
  root.description = description.value.trim()
  const keywords = keywordsText.value.split(',').map((k) => k.trim()).filter(Boolean)
  if (keywords.length) root.keywords = keywords
  else delete root.keywords
  if (datePublished.value.trim()) root.datePublished = datePublished.value.trim()
  else delete root.datePublished
  const licenseValue = license.value.trim()
  if (!licenseValue) {
    delete root.license
  } else if (licenseWasString.value) {
    root.license = licenseValue
  } else {
    root.license = { '@id': licenseValue }
    upsertLicenseEntity(clone, licenseValue)
  }

  // Custom fields: rows removed since seeding delete their key; blank or
  // managed keys are skipped rather than clobbering structured properties.
  const liveKeys = new Set(customFields.value.map((row) => row.key.trim()).filter(Boolean))
  for (const key of seededCustomKeys) {
    if (!liveKeys.has(key)) delete root[key]
  }
  for (const row of customFields.value) {
    const key = row.key.trim()
    if (!key || MANAGED_KEYS.has(key)) continue
    root[key] = row.value
  }

  const mentionRefs = [...preservedMentions, ...relatedIds.value.map((id) => ({ '@id': id }))]
  if (mentionRefs.length) root.mentions = mentionRefs
  else delete root.mentions
  for (const id of relatedIds.value) upsertRelatedEntity(clone, id)
  return clone
}

// Each related document gets a resolvable contextual entity so the reference
// stays meaningful outside this portal.
function upsertRelatedEntity(crate: unknown, graphIri: string) {
  if (!isRecord(crate)) return
  const g = Array.isArray(crate['@graph']) ? (crate['@graph'] as unknown[]) : []
  if (g.some((entity) => isRecord(entity) && entity['@id'] === graphIri)) return
  const item = metadataItems.value.find((entry) => entry.graph_iri === graphIri)
  g.push({
    '@id': graphIri,
    '@type': 'Dataset',
    name: relatedLabel(graphIri),
    ...(item ? { identifier: item.document_id } : {}),
  })
  crate['@graph'] = g
}

function relatedLabel(graphIri: string): string {
  const item = metadataItems.value.find((entry) => entry.graph_iri === graphIri)
  if (!item) return graphIri
  return metadata.value.find((doc) => doc.ulid === item.document_id)?.title || item.document_path
}

const relatedOptions = computed(() =>
  metadataItems.value
    .filter((item) => item.document_id !== props.documentId && !relatedIds.value.includes(item.graph_iri))
    .map((item) => ({ value: item.graph_iri, label: relatedLabel(item.graph_iri) })),
)

function addRelated() {
  if (relatedPick.value && !relatedIds.value.includes(relatedPick.value)) {
    relatedIds.value = [...relatedIds.value, relatedPick.value]
  }
  relatedPick.value = ''
}

function removeRelated(graphIri: string) {
  relatedIds.value = relatedIds.value.filter((id) => id !== graphIri)
}

// Live, non-blocking profile validation over the Fields tab state. Editing an
// existing document must stay possible even when it never conformed, so
// violations inform rather than gate the save.
const violations = computed(() => {
  const schema = props.profile?.schema
  if (!schema || !props.open || loading.value) return []
  const values: Record<string, unknown> = {
    name: name.value.trim(),
    description: description.value.trim(),
    keywords: keywordsText.value.split(',').map((keyword) => keyword.trim()).filter(Boolean),
    datePublished: datePublished.value.trim(),
    license: license.value.trim(),
  }
  for (const row of customFields.value) {
    const key = row.key.trim()
    if (key && !(key in values)) values[key] = row.value
  }
  return validateProfileData(schema, values)
})

function upsertLicenseEntity(crate: unknown, licenseValue: string) {
  if (!isRecord(crate)) return
  const g = Array.isArray(crate['@graph']) ? (crate['@graph'] as unknown[]) : []
  const exists = g.some((e) => isRecord(e) && e['@id'] === licenseValue)
  if (!exists) g.push(licenseEntity(licenseValue))
  crate['@graph'] = g
}

async function save() {
  saveError.value = null
  rawError.value = null
  const documentId = loadedDocumentId.value
  if (!documentId || documentId !== props.documentId) {
    saveError.value = 'This document changed while the editor was loading. Reload it before saving.'
    return
  }
  let rocrate: unknown
  try {
    rocrate = activeTab.value === 'raw' ? JSON.parse(rawText.value) : buildFromFields()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (activeTab.value === 'raw') rawError.value = message
    else saveError.value = message
    return
  }
  try {
    // The update is accepted into the pipeline; the projection may lag, so the
    // detail view's crate re-fetch (loadRoCrate) polls until it materializes.
    const summary = await replaceMetadataRoCrate(documentId, { rocrate, public: isPublic.value })
    emit('saved', summary)
    emit('update:open', false)
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) saveError.value = 'You need write permission in the owning group.'
    else saveError.value = err instanceof Error ? err.message : String(err)
  }
}
</script>

<template>
  <Dialog :open="props.open" @update:open="(v: boolean) => emit('update:open', v)">
    <DialogContent class="max-w-2xl">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2"><Pencil class="h-4 w-4 text-primary" /> Edit metadata</DialogTitle>
        <DialogDescription>
          Replace the document's RO-Crate. Editing writes the whole crate back; the projection may briefly lag after saving.
        </DialogDescription>
      </DialogHeader>

      <div v-if="loading" class="py-8 text-center text-sm text-muted-foreground">Loading crate…</div>
      <div v-else-if="loadError" class="space-y-3">
        <p class="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">{{ loadError }}</p>
        <Button variant="outline" size="sm" @click="reload">Try again</Button>
      </div>

      <template v-else>
        <Tabs v-model="activeTab">
          <TabsList>
            <TabsTrigger value="fields">Fields</TabsTrigger>
            <TabsTrigger value="files">Files</TabsTrigger>
            <TabsTrigger value="raw">Raw JSON</TabsTrigger>
          </TabsList>

          <TabsContent value="fields" class="space-y-3">
            <div>
              <label class="text-xs font-medium text-foreground">Name</label>
              <Input v-model="name" class="mt-1" placeholder="Dataset title" />
            </div>
            <div>
              <label class="text-xs font-medium text-foreground">Description</label>
              <Textarea v-model="description" rows="4" class="mt-1 font-sans" placeholder="Describe the dataset" />
            </div>
            <div>
              <label class="text-xs font-medium text-foreground">Keywords</label>
              <Input v-model="keywordsText" class="mt-1" placeholder="comma, separated, keywords" />
            </div>
            <div class="grid gap-3 sm:grid-cols-2">
              <div>
                <label class="text-xs font-medium text-foreground">Date published</label>
                <Input v-model="datePublished" type="date" class="mt-1" />
              </div>
              <div>
                <label class="text-xs font-medium text-foreground">License (IRI)</label>
                <Input v-model="license" class="mt-1" placeholder="https://creativecommons.org/licenses/by/4.0" />
              </div>
            </div>

            <div>
              <div class="flex items-center justify-between gap-3">
                <label class="text-xs font-medium text-foreground">Additional fields</label>
                <Button variant="outline" size="sm" @click="customFields.push({ key: '', value: '' })">
                  <Plus class="h-3.5 w-3.5" /> Add field
                </Button>
              </div>
              <div v-for="(row, index) in customFields" :key="index" class="mt-1.5 flex items-center gap-2">
                <Input v-model="row.key" class="w-44 font-mono text-xs" placeholder="property" />
                <Input v-model="row.value" placeholder="value" />
                <Button variant="ghost" size="icon-sm" class="shrink-0 text-muted-foreground" aria-label="Remove field" @click="customFields.splice(index, 1)">
                  <X class="h-3.5 w-3.5" />
                </Button>
              </div>
              <p class="mt-1 text-[11px] text-muted-foreground">
                Simple text properties on the root entity. Structured values are preserved as-is; edit them in the Raw JSON tab.
              </p>
            </div>

            <div>
              <label class="text-xs font-medium text-foreground">Related datasets</label>
              <div class="mt-1.5 flex items-center gap-2">
                <Select v-model="relatedPick" :options="relatedOptions" placeholder="Pick a dataset from the catalog" class="flex-1" />
                <Button variant="outline" size="sm" :disabled="!relatedPick" @click="addRelated"><Plus class="h-3.5 w-3.5" /> Link</Button>
              </div>
              <ul v-if="relatedIds.length" class="mt-2 space-y-1">
                <li v-for="id in relatedIds" :key="id" class="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-2.5 py-1.5 text-xs">
                  <span class="min-w-0 truncate text-foreground" :title="id">{{ relatedLabel(id) }}</span>
                  <Button variant="ghost" size="icon-sm" class="shrink-0 text-muted-foreground" aria-label="Unlink dataset" @click="removeRelated(id)">
                    <X class="h-3.5 w-3.5" />
                  </Button>
                </li>
              </ul>
              <p class="mt-1 text-[11px] text-muted-foreground">
                Written as <code class="font-mono">mentions</code> references; they render as browsable links on the detail page.
              </p>
            </div>

            <div v-if="violations.length" class="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs">
              <div class="font-medium text-amber-800 dark:text-amber-300">Profile check: {{ profile?.name }}</div>
              <ul class="mt-1 list-disc space-y-0.5 pl-4">
                <li v-for="violation in violations" :key="violation.pointer + violation.message" :class="violation.severity === 'error' ? 'text-destructive' : 'text-amber-800 dark:text-amber-300'">
                  <span class="font-mono">{{ violation.fieldId ?? violation.pointer }}</span>: {{ violation.message }}
                </li>
              </ul>
              <p class="mt-1 text-muted-foreground">Violations don't block saving an existing document.</p>
            </div>
          </TabsContent>

          <TabsContent value="files">
            <DatasetFilesEditor v-model="files" />
            <p class="mt-2 text-[11px] text-muted-foreground">
              Reference identifiers are kept verbatim. Removing a file drops it from the crate unless another entity still references it.
            </p>
          </TabsContent>

          <TabsContent value="raw" class="space-y-2">
            <Textarea v-model="rawText" rows="18" class="text-xs" spellcheck="false" />
            <p v-if="rawError" class="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">{{ rawError }}</p>
            <p v-else class="text-[11px] text-muted-foreground">The active tab wins on save; raw JSON must be a valid RO-Crate object.</p>
          </TabsContent>
        </Tabs>

        <div class="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/40 px-3 py-2">
          <div>
            <div class="text-sm font-medium text-foreground">Public</div>
            <div class="text-[11px] text-muted-foreground">Anyone can read this document when public.</div>
          </div>
          <Switch :checked="isPublic" @update:checked="(v: boolean) => (isPublic = v)" />
        </div>

        <p v-if="saveError" class="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">{{ saveError }}</p>
      </template>

      <DialogFooter>
        <DialogClose><Button variant="outline">Cancel</Button></DialogClose>
        <Button :disabled="loading || Boolean(loadError) || saving" @click="save">{{ saving ? 'Saving…' : 'Save changes' }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
