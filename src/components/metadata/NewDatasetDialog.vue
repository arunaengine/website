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
import Select from '@/components/ui/Select.vue'
import Switch from '@/components/ui/Switch.vue'
import Badge from '@/components/ui/Badge.vue'
import CreateGroupDialog from '@/components/groups/CreateGroupDialog.vue'
import { computed, ref, watch } from 'vue'
import { FileJson2, Plus, X } from '@lucide/vue'
import { useAruna } from '@/composables/useAruna'
import type { MetadataDoc } from '@/data/types'
import { controlsFromSchema, defaultControlValues, normalizeProfileValues } from '@/lib/profiles/controls'
import { extractProfileSchema } from '@/lib/profiles/rocrate'
import { validateProfileData } from '@/lib/profiles/validate'
import { DX_PROFILE, type JsonSchema, type ProfileControl } from '@/lib/profiles/types'

const props = defineProps<{
  open: boolean
  defaultProfileId?: string
}>()

const emit = defineEmits<{
  (e: 'update:open', v: boolean): void
  (e: 'created', doc: MetadataDoc): void
}>()

const { groups, profiles, metadata, createMetadata, loadRoCrate, saving, currentUser } = useAruna()

const groupId = ref('')
const profileId = ref('')
const path = ref('')
const title = ref('')
const description = ref('')
const datePublished = ref(new Date().toISOString().slice(0, 10))
const license = ref('https://creativecommons.org/licenses/by/4.0/')
const isPublic = ref(false)
const keywords = ref('')
const identifier = ref('')
const creators = ref<string[]>([])
const dataRefs = ref<Array<{ label: string; url: string }>>([])
const submitError = ref<string | null>(null)
const createGroupOpen = ref(false)
const profileSchema = ref<JsonSchema | undefined>()
const profileControls = ref<ProfileControl[]>([])
const generatedValues = ref<Record<string, unknown>>({})
const profileLoading = ref(false)
const profileLoadError = ref<string | null>(null)
let profileLoadToken = 0

const builtInDatasetKeys = new Set(['name', 'description', 'datePublished', 'license'])
const reservedDatasetKeys = new Set(['@id', '@type', 'conformsTo', 'hasPart'])

const groupOptions = computed(() => groups.value.map((group) => ({ value: group.id, label: group.name })))
const profileOptions = computed(() => [
  { value: '', label: 'No profile reference' },
  ...profiles.value.map((profile) => ({ value: profile.id, label: `${profile.name}${profile.propertyRules.length ? ` (${profile.propertyRules.length} properties)` : ''}` })),
])
const selectedProfile = computed(() => profiles.value.find((profile) => profile.id === profileId.value))

const keywordList = computed(() => keywords.value.split(',').map((keyword) => keyword.trim()).filter(Boolean))
const creatorList = computed(() => creators.value.map((name) => name.trim()).filter(Boolean))
const dataRefList = computed(() =>
  dataRefs.value
    .map((entry) => ({ label: entry.label.trim(), url: entry.url.trim() }))
    .filter((entry) => entry.url),
)
const dataRefsValid = computed(() => dataRefs.value.every((entry) => !entry.label.trim() || entry.url.trim()))
const generatedProfileControls = computed(() => profileControls.value.filter((control) => !builtInDatasetKeys.has(control.property)))
const normalizedGeneratedValues = computed(() => ({
  ...coreProfileValues(),
  ...normalizeProfileValues(generatedValues.value, generatedProfileControls.value),
}))
const generatedCreateValues = computed(() => normalizeProfileValues(generatedValues.value, generatedProfileControls.value, { omitEmpty: true }))
const profileViolations = computed(() => validateProfileData(profileSchema.value, normalizedGeneratedValues.value))
// Warnings come from SHOULD/recommended rules; they never block submission (see canSubmit).
const profileWarnings = computed(() => profileViolations.value.filter((violation) => violation.severity === 'warning'))
const profileCollisionKeys = computed(() => profileControls.value.map((control) => control.property).filter((property) => reservedDatasetKeys.has(property)))
// Anything beyond the scaffold fields requires submitting a full RO-Crate.
const needsRoCrate = computed(() =>
  Boolean(
    profileId.value
      || keywordList.value.length
      || creatorList.value.length
      || identifier.value.trim()
      || dataRefList.value.length
      || Object.keys(generatedCreateValues.value).length,
  ),
)

// A profile schema that fails to load (legacy/external profile, or a transient
// CrateNotReadyError) is non-blocking: we cannot generate/validate inputs, but
// the dataset can still be created and will reference the profile via
// conformsTo when a URI is available. So profileLoadError is NOT in canSubmit —
// only the in-flight load, hard error-severity violations, and collisions gate.
const canSubmit = computed(() => Boolean(
  currentUser.value
    && groupId.value
    && path.value.trim()
    && title.value.trim()
    && dataRefsValid.value
    && !profileLoading.value
    && !profileCollisionKeys.value.length
    && !profileViolations.value.some((violation) => violation.severity === 'error'),
))

watch(
  () => props.open,
  (open) => {
    if (!open) return
    groupId.value = groups.value[0]?.id ?? ''
    profileId.value = props.defaultProfileId ?? currentUser.value?.preferredProfileId ?? ''
    path.value = ''
    title.value = ''
    description.value = ''
    datePublished.value = new Date().toISOString().slice(0, 10)
    license.value = 'https://creativecommons.org/licenses/by/4.0/'
    isPublic.value = false
    keywords.value = ''
    identifier.value = ''
    creators.value = []
    dataRefs.value = []
    submitError.value = null
    resetGeneratedProfileFields()
    void loadSelectedProfileSchema()
  },
  { immediate: true },
)

watch(profileId, () => {
  if (props.open) void loadSelectedProfileSchema()
})

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9/]+/g, '-').replace(/^-|-$/g, '')
}

function fillPath() {
  if (!title.value.trim() || path.value.trim()) return
  path.value = `datasets/${slugify(title.value)}`
}

async function loadSelectedProfileSchema() {
  const token = ++profileLoadToken
  resetGeneratedProfileFields()
  const profile = selectedProfile.value
  if (!profile) return

  const summarySchema = isJsonSchema(profile.schema) ? profile.schema : undefined
  if (summarySchema) applyProfileSchema(summarySchema)
  if (!profile.documentId) return

  profileLoading.value = true
  profileLoadError.value = null
  try {
    const rocrate = await loadRoCrate(profile.documentId)
    if (token !== profileLoadToken) return
    const schema = extractProfileSchema(rocrate) ?? summarySchema
    if (schema) applyProfileSchema(schema)
    else profileLoadError.value = 'Selected profile has no JSON Schema validator.'
  } catch (err) {
    if (token !== profileLoadToken) return
    profileLoadError.value = err instanceof Error ? err.message : String(err)
  } finally {
    if (token === profileLoadToken) profileLoading.value = false
  }
}

function resetGeneratedProfileFields() {
  profileSchema.value = undefined
  profileControls.value = []
  generatedValues.value = {}
  profileLoadError.value = null
}

function applyProfileSchema(schema: JsonSchema) {
  profileSchema.value = schema
  profileControls.value = controlsFromSchema(schema)
  generatedValues.value = defaultControlValues(profileControls.value)
}

function fieldString(property: string): string {
  const value = generatedValues.value[property]
  if (Array.isArray(value)) return value.join(', ')
  if (value === undefined || value === null) return ''
  return String(value)
}

function coreProfileValues(): Record<string, unknown> {
  return {
    name: title.value.trim(),
    description: description.value.trim(),
    datePublished: datePublished.value,
    license: license.value.trim(),
  }
}

function setGeneratedValue(property: string, value: unknown) {
  generatedValues.value = { ...generatedValues.value, [property]: value }
}

function buildRoCrate() {
  const dataset: Record<string, unknown> = {
    '@id': './',
    '@type': 'Dataset',
    name: title.value.trim(),
    description: description.value.trim(),
    datePublished: datePublished.value,
    license: { '@id': license.value.trim() },
  }
  for (const [key, value] of Object.entries(generatedCreateValues.value)) {
    dataset[key] = value
  }

  const contextualEntities: Array<Record<string, unknown>> = []
  const profile = selectedProfile.value
  const profileUri = profile?.profileUri || profile?.graphIri
  if (profileUri) {
    dataset.conformsTo = [{ '@id': profileUri }]
    contextualEntities.push({
      '@id': profileUri,
      '@type': ['CreativeWork', DX_PROFILE],
      name: profile.name,
      version: profile.version,
    })
  }
  if (keywordList.value.length) {
    dataset.keywords = keywordList.value
  }
  if (identifier.value.trim()) {
    dataset.identifier = identifier.value.trim()
  }
  if (creatorList.value.length) {
    const usedIds = new Set<string>()
    const personIds = creatorList.value.map((name, index) => {
      const slug = slugify(name) || String(index + 1)
      const id = usedIds.has(`#person-${slug}`) ? `#person-${slug}-${index + 1}` : `#person-${slug}`
      usedIds.add(id)
      return id
    })
    dataset.author = personIds.map((id) => ({ '@id': id }))
    contextualEntities.push(
      ...creatorList.value.map((name, index) => ({ '@id': personIds[index], '@type': 'Person', name })),
    )
  }
  if (dataRefList.value.length) {
    dataset.hasPart = dataRefList.value.map((entry) => ({ '@id': entry.url }))
    contextualEntities.push(
      ...dataRefList.value.map((entry) => ({ '@id': entry.url, '@type': 'File', name: entry.label || entry.url })),
    )
  }
  return {
    '@context': 'https://w3id.org/ro/crate/1.2/context',
    '@graph': [
      {
        '@id': 'ro-crate-metadata.json',
        '@type': 'CreativeWork',
        conformsTo: { '@id': 'https://w3id.org/ro/crate/1.2' },
        about: { '@id': './' },
      },
      dataset,
      ...contextualEntities,
    ],
  }
}

async function submit() {
  if (!canSubmit.value) return
  submitError.value = null
  try {
    const roCrate = needsRoCrate.value ? buildRoCrate() : undefined
    const created = await createMetadata(
      roCrate
        ? {
            group_id: groupId.value,
            path: path.value.trim(),
            public: isPublic.value,
            rocrate: roCrate,
          }
        : {
            group_id: groupId.value,
            path: path.value.trim(),
            public: isPublic.value,
            name: title.value.trim(),
            description: description.value.trim(),
            date_published: datePublished.value,
            license: license.value.trim(),
          },
    )
    const doc = metadata.value.find((item) => item.ulid === created.document_id) ?? {
      ulid: created.document_id,
      title: title.value.trim(),
      description: description.value.trim(),
      type: 'Dataset',
      license: license.value,
      keywords: keywordList.value,
      currentVersion: 1,
      versions: [],
      linkedObjects: [],
      primaryBucketId: '',
      realmId: created.group_id,
      createdAt: created.created_at,
      updatedAt: created.updated_at,
      author: creatorList.value[0] ?? currentUser.value?.name ?? '',
      organization: currentUser.value?.affiliation ?? '',
      nodeId: '',
      profileId: profileId.value,
      profileIds: profileId.value ? [profileId.value] : [],
      contributors: creatorList.value.map((name) => ({ name, role: 'Contributor', affiliation: undefined })),
      doi: identifier.value.trim() || undefined,
      roCrate: roCrate ?? {},
    }
    emit('created', doc)
    emit('update:open', false)
  } catch (err) {
    submitError.value = err instanceof Error ? err.message : String(err)
  }
}

function isJsonSchema(value: unknown): value is JsonSchema {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}
</script>

<template>
  <Dialog :open="props.open" @update:open="(v: boolean) => emit('update:open', v)">
    <DialogContent class="max-w-3xl">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <FileJson2 class="h-4 w-4 text-primary" /> New metadata document
        </DialogTitle>
        <DialogDescription>
          Creates a real RO-Crate metadata document through the Aruna API.
        </DialogDescription>
      </DialogHeader>

      <div class="max-h-[70vh] space-y-4 overflow-y-auto pr-1 scrollbar-thin">
        <div v-if="!currentUser" class="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
          Sign in before creating metadata.
        </div>
        <div v-else-if="!groups.length" class="flex items-center justify-between gap-3 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
          <span>You are not a member of any group yet; datasets belong to a group.</span>
          <Button variant="outline" size="sm" class="shrink-0" @click="createGroupOpen = true">
            <Plus class="h-3.5 w-3.5" /> Create a group
          </Button>
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          <div>
            <label class="text-xs font-medium text-foreground">Group</label>
            <Select v-model="groupId" :options="groupOptions" placeholder="Choose a group" class="mt-1" />
          </div>
          <div>
            <label class="text-xs font-medium text-foreground">Profile reference</label>
            <Select v-model="profileId" :options="profileOptions" placeholder="Optional profile" class="mt-1" />
          </div>
        </div>

        <div>
          <label class="text-xs font-medium text-foreground">Title</label>
          <Input v-model="title" class="mt-1" placeholder="Dataset title" @blur="fillPath" />
        </div>
        <div>
          <label class="text-xs font-medium text-foreground">Document path</label>
          <Input v-model="path" class="mt-1" placeholder="datasets/my-dataset" />
          <p class="mt-1 text-[11px] text-muted-foreground">Stored as the metadata document path in Aruna.</p>
        </div>
        <div>
          <label class="text-xs font-medium text-foreground">Description</label>
          <Textarea v-model="description" class="mt-1" rows="3" />
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          <div>
            <label class="text-xs font-medium text-foreground">Date published</label>
            <Input v-model="datePublished" type="date" class="mt-1" />
          </div>
          <div>
            <label class="text-xs font-medium text-foreground">License URL</label>
            <Input v-model="license" class="mt-1" />
          </div>
        </div>

        <section v-if="profileId" class="rounded-lg border border-primary/20 bg-primary/5 p-3">
          <div class="flex items-center justify-between gap-3">
            <div>
              <div class="text-sm font-semibold text-foreground">Profile properties — {{ selectedProfile?.name }}</div>
              <p class="text-[11px] text-muted-foreground">Generated from the selected profile's JSON Schema validator. Required properties block submission; recommended ones only warn.</p>
            </div>
            <Badge variant="secondary" class="text-[10px]">{{ profileLoading ? 'loading' : `${generatedProfileControls.length} inputs` }}</Badge>
          </div>
          <div v-if="profileLoadError" class="mt-2 flex items-start justify-between gap-3 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-300">
            <span>
              Profile inputs can't be generated or validated ({{ profileLoadError }}). You can still create the dataset — it will reference this profile via <code>conformsTo</code> when a profile URI is available.
            </span>
            <Button variant="outline" size="sm" class="shrink-0" @click="loadSelectedProfileSchema">Try again</Button>
          </div>
          <div v-if="profileCollisionKeys.length" class="mt-2 text-xs text-destructive">
            Profile field target collides with built-in dataset fields: {{ profileCollisionKeys.join(', ') }}.
          </div>
          <div v-if="profileControls.some((control) => builtInDatasetKeys.has(control.property))" class="mt-2 text-[11px] text-muted-foreground">
            This profile also validates the built-in fields (name, description, datePublished, license): {{ profileControls.filter((control) => builtInDatasetKeys.has(control.property)).map((control) => control.property).join(', ') }}.
            <p v-for="violation in profileViolations.filter((item) => builtInDatasetKeys.has(item.fieldId ?? ''))" :key="violation.ruleId + violation.pointer" class="mt-1" :class="violation.severity === 'error' ? 'text-destructive' : 'text-amber-800 dark:text-amber-300'">
              {{ violation.fieldId }}: {{ violation.message }}
            </p>
          </div>
          <div v-if="profileWarnings.length" class="mt-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-300">
            <span class="font-semibold">Recommended</span> — {{ profileWarnings.length }} recommended {{ profileWarnings.length === 1 ? 'property is' : 'properties are' }} missing or incomplete. This does not block submission.
          </div>
          <div v-if="generatedProfileControls.length" class="mt-3 grid gap-3 sm:grid-cols-2">
            <div v-for="control in generatedProfileControls" :key="control.property" :class="control.control === 'textarea' || control.control === 'tags' ? 'sm:col-span-2' : ''">
              <label class="text-xs font-medium text-foreground">
                {{ control.label }} <span v-if="control.required" class="text-destructive">*</span>
              </label>
              <Textarea
                v-if="control.control === 'textarea'"
                :model-value="fieldString(control.property)"
                class="mt-1"
                rows="3"
                @update:model-value="(value: string) => setGeneratedValue(control.property, value)"
              />
              <Select
                v-else-if="control.control === 'select'"
                :model-value="fieldString(control.property)"
                :options="(control.enumOptions ?? []).map((option) => ({ value: option, label: option }))"
                class="mt-1"
                placeholder="Choose an option"
                @update:model-value="(value: string) => setGeneratedValue(control.property, value)"
              />
              <label v-else-if="control.control === 'checkbox'" class="mt-2 flex items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-sm">
                <span>{{ control.description || 'Enabled' }}</span>
                <Switch :checked="Boolean(generatedValues[control.property])" @update:checked="(value: boolean) => setGeneratedValue(control.property, value)" />
              </label>
              <Input
                v-else
                :model-value="fieldString(control.property)"
                :type="control.control === 'integer' || control.control === 'number' ? 'number' : control.control === 'datetime-local' ? 'datetime-local' : control.control === 'tags' ? 'text' : control.control"
                class="mt-1"
                :placeholder="control.control === 'tags' ? 'Comma-separated values' : undefined"
                @update:model-value="(value: string | number) => setGeneratedValue(control.property, value)"
              />
              <p v-if="control.description && control.control !== 'checkbox'" class="mt-1 text-[11px] text-muted-foreground">{{ control.description }}</p>
              <p v-for="violation in profileViolations.filter((item) => item.fieldId === control.property)" :key="violation.ruleId" class="mt-1 text-[11px]" :class="violation.severity === 'error' ? 'text-destructive' : 'text-amber-800 dark:text-amber-300'">
                {{ violation.message }}
              </p>
            </div>
          </div>
          <div v-else-if="!profileLoading" class="mt-2 text-xs text-muted-foreground">This profile can be declared as conformance, but it has no additional generated fields beyond the built-in metadata inputs.</div>
        </section>

        <div class="grid gap-4 sm:grid-cols-2">
          <div>
            <label class="text-xs font-medium text-foreground">Keywords</label>
            <Input v-model="keywords" class="mt-1" placeholder="genomics, proteomics" />
            <p class="mt-1 text-[11px] text-muted-foreground">Optional, comma-separated.</p>
          </div>
          <div>
            <label class="text-xs font-medium text-foreground">Identifier</label>
            <Input v-model="identifier" class="mt-1" placeholder="https://doi.org/10.1234/abcd" />
            <p class="mt-1 text-[11px] text-muted-foreground">Optional persistent identifier, e.g. a DOI URL.</p>
          </div>
        </div>
        <div>
          <label class="text-xs font-medium text-foreground">Authors</label>
          <div v-for="(creator, index) in creators" :key="index" class="mt-1 flex items-center gap-2">
            <Input v-model="creators[index]" placeholder="Ada Lovelace" />
            <Button variant="ghost" size="icon-sm" aria-label="Remove author" @click="creators.splice(index, 1)">
              <X class="h-3.5 w-3.5" />
            </Button>
          </div>
          <Button variant="outline" size="sm" class="mt-1" @click="creators.push('')">
            <Plus class="h-3.5 w-3.5" /> Add author
          </Button>
        </div>
        <div>
          <label class="text-xs font-medium text-foreground">Data references</label>
          <div v-for="(entry, index) in dataRefs" :key="index" class="mt-1 flex items-center gap-2">
            <Input v-model="entry.label" placeholder="Label" class="w-2/5" />
            <Input v-model="entry.url" placeholder="s3://bucket/key or https://..." class="flex-1" />
            <Button variant="ghost" size="icon-sm" aria-label="Remove data reference" @click="dataRefs.splice(index, 1)">
              <X class="h-3.5 w-3.5" />
            </Button>
          </div>
          <Button variant="outline" size="sm" class="mt-1" @click="dataRefs.push({ label: '', url: '' })">
            <Plus class="h-3.5 w-3.5" /> Add data reference
          </Button>
          <p class="mt-1 text-[11px] text-muted-foreground">Each reference becomes a hasPart File entity in the RO-Crate.</p>
        </div>
        <label class="flex items-center justify-between rounded-md border border-border p-3 text-sm">
          <span>
            Public metadata
            <span class="block text-[11px] text-muted-foreground">Public documents are visible without a bearer token.</span>
          </span>
          <Switch :checked="isPublic" @update:checked="(v: boolean) => (isPublic = v)" />
        </label>
        <div v-if="selectedProfile" class="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-[11px] text-foreground/85">
          <Badge variant="secondary" class="mr-1 text-[10px]">profile</Badge>
          The RO-Crate will reference {{ selectedProfile.name }} using its saved graph IRI.
        </div>
        <div v-if="submitError" class="text-xs text-destructive">{{ submitError }}</div>
      </div>

      <DialogFooter>
        <DialogClose><Button variant="outline">Cancel</Button></DialogClose>
        <Button :disabled="!canSubmit || saving" @click="submit">
          {{ saving ? 'Creating...' : 'Create metadata' }}
        </Button>
      </DialogFooter>

      <CreateGroupDialog v-model:open="createGroupOpen" @created="(group) => (groupId = group.group_id)" />
    </DialogContent>
  </Dialog>
</template>
