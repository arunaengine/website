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
import { Pencil } from '@lucide/vue'
import { ref, watch } from 'vue'
import { useAruna } from '@/composables/useAruna'
import { ApiError, type MetadataDocumentSummary } from '@/lib/api'
import { OFFLINE_WRITE_HINT, useConnectivity } from '@/lib/connectivity'
import { licenseEntity } from '@/lib/profiles/rocrate'

const props = defineProps<{ open: boolean; documentId: string }>()
const emit = defineEmits<{
  (e: 'update:open', v: boolean): void
  (e: 'saved', summary: MetadataDocumentSummary): void
}>()

const { saving, fetchRoCrateRaw, getMetadataDocument, replaceMetadataRoCrate } = useAruna()
const { writesDisabled } = useConnectivity()

const loading = ref(false)
const loadError = ref<string | null>(null)
const saveError = ref<string | null>(null)
const rawError = ref<string | null>(null)
const activeTab = ref<'fields' | 'raw'>('fields')

// The pristine, unresolved crate fetched from the backend; edits mutate a clone.
const pristine = ref<unknown>(null)
const rawText = ref('')

const name = ref('')
const description = ref('')
const keywordsText = ref('')
const datePublished = ref('')
const license = ref('')
// Preserve the license shape: a plain string stays a string, an object/absent
// value is written as { "@id": … } plus a contextual CreativeWork entity.
const licenseWasString = ref(false)
const isPublic = ref(false)

watch(
  () => props.open,
  (open) => {
    if (!open) return
    activeTab.value = 'fields'
    saveError.value = null
    rawError.value = null
    void load()
  },
)

async function load() {
  loading.value = true
  loadError.value = null
  try {
    const [crate, summary] = await Promise.all([
      fetchRoCrateRaw(props.documentId),
      getMetadataDocument(props.documentId),
    ])
    pristine.value = crate
    isPublic.value = summary.public
    seedFields(crate)
    rawText.value = JSON.stringify(crate, null, 2)
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : String(err)
  } finally {
    loading.value = false
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

function seedFields(crate: unknown) {
  const root = findRoot(crate)
  name.value = stringField(root?.name)
  description.value = stringField(root?.description)
  keywordsText.value = arrayField(root?.keywords).join(', ')
  datePublished.value = stringField(root?.datePublished)
  licenseWasString.value = typeof root?.license === 'string'
  license.value = licenseIri(root?.license)
}

function buildFromFields(): unknown {
  const clone: unknown = structuredClone(pristine.value)
  const root = findRoot(clone)
  if (!root) throw new Error('This crate has no root dataset entity to edit.')
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
  return clone
}

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
    const summary = await replaceMetadataRoCrate(props.documentId, { rocrate, public: isPublic.value })
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
        <Button variant="outline" size="sm" @click="load">Try again</Button>
      </div>

      <template v-else>
        <Tabs v-model="activeTab">
          <TabsList>
            <TabsTrigger value="fields">Fields</TabsTrigger>
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

        <!-- An editing session can go offline mid-edit; the disabled save plus
             this note is honest without discarding the unsaved draft. -->
        <p v-if="writesDisabled" class="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
          You're offline — saving changes needs connectivity. Your edits are kept until you reconnect.
        </p>
      </template>

      <DialogFooter>
        <DialogClose><Button variant="outline">Cancel</Button></DialogClose>
        <Button :disabled="loading || Boolean(loadError) || saving || writesDisabled" :title="writesDisabled ? OFFLINE_WRITE_HINT : undefined" @click="save">{{ saving ? 'Saving…' : 'Save changes' }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
