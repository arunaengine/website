<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import PageHeader from '@/components/dashboard/PageHeader.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Textarea from '@/components/ui/Textarea.vue'
import Select from '@/components/ui/Select.vue'
import Badge from '@/components/ui/Badge.vue'
import GroupSelect from '@/components/groups/GroupSelect.vue'
import CreateGroupDialog from '@/components/groups/CreateGroupDialog.vue'
import ProfileControlField from '@/components/metadata/ProfileControlField.vue'
import DatasetEntityInstances from '@/components/metadata/DatasetEntityInstances.vue'
import ContextEntityList from '@/components/metadata/ContextEntityList.vue'
import AddContextDialog from '@/components/metadata/AddContextDialog.vue'
import DatasetPartsSection from '@/components/metadata/DatasetPartsSection.vue'
import DatasetReviewSection from '@/components/metadata/DatasetReviewSection.vue'
import ImportCrateDialog from '@/components/metadata/ImportCrateDialog.vue'
import { profileReferenceIri, useAruna } from '@/composables/useAruna'
import { useProfilePreview } from '@/composables/useProfilePreview'
import { useDeviceStatus } from '@/composables/useDeviceStatus'
import { buildDataset, signedInUserEntity, type ContextEntity, type DatasetDraft } from '@/lib/crate/build'
import { isDesktop } from '@/lib/desktop'
import { previewDeviceDraft, requireDevice } from '@/lib/deviceApi'
import { ApiError, profileValidationFindings, type RoCrateStructuralViolation } from '@/lib/api'
import { controlsFromRules, defaultControlValues, normalizeProfileValues } from '@/lib/profiles/controls'
import { emitEntityEntries, emitSelectObject, slugify } from '@/lib/profiles/emit'
import { type EntityEntry } from '@/lib/profiles/entityEntries'
import {
  entityTypeLabelFor,
  newEntityEntry,
  newRefEntry,
  subControlsFor,
  validateEntries,
  type EntryViolationNode,
} from '@/lib/profiles/entityTree'
import type {
  ProfileControl,
  ProfileEntityRule,
  ProfilePropertyRule,
  ProfileViolation,
} from '@/lib/profiles/types'
import type { ParsedProfileControls } from '@/lib/profiles/rocrate'
import { FileJson2, Plus, UserRoundPlus } from '@lucide/vue'

const router = useRouter()
const {
  groups,
  profiles,
  fullCrates,
  createMetadata,
  loadProfileCrate,
  saving,
  currentUser,
  apiBaseUrl,
  authToken,
} = useAruna()

const draft = reactive<DatasetDraft>({
  basics: {
    groupId: '',
    path: '',
    title: '',
    description: '',
    datePublished: new Date().toISOString().slice(0, 10),
    license: 'https://creativecommons.org/licenses/by/4.0/',
    keywords: [],
  },
  entities: [],
  parts: [],
  visibility: 'group',
})
const keywordsText = ref('')
const pathTouched = ref(false)
const createGroupOpen = ref(false)
const importCrateOpen = ref(false)
const contextOpen = ref(false)
const editingEntity = ref<ContextEntity | null>(null)
const activeSection = ref('basics')
const submitError = ref<string | null>(null)
const writeIssues = ref<Array<{
  code?: string
  message: string
  entityId?: string | null
  path?: string | null
  severity?: string
}>>([])

const groupOptions = computed(() => groups.value.map((group) => ({ value: group.id, label: group.name })))
watch(groups, (available) => {
  if (!draft.basics.groupId && available.length) draft.basics.groupId = available[0].id
}, { immediate: true })
watch(() => draft.basics.title, (title) => {
  if (!pathTouched.value) draft.basics.path = title.trim() ? `datasets/${slugify(title)}` : ''
})
watch(keywordsText, (value) => {
  draft.basics.keywords = value.split(',').map((keyword) => keyword.trim()).filter(Boolean)
})

const selectedProfileId = ref('none')
type ActiveProfileControls = Pick<
  ParsedProfileControls,
  'entityRules' | 'datasetPropertyRules' | 'schema' | 'contextTerms' | 'liftNotes'
>
const parsedProfile = ref<ActiveProfileControls | null>(null)
const profileLoading = ref(false)
const profileError = ref<string | null>(null)
const profileValues = ref<Record<string, unknown>>({})
const profileEntries = ref<Record<string, EntityEntry[]>>({})
const selectedProfile = computed(() => profiles.value.find((profile) => profile.id === selectedProfileId.value))
const profileOptions = computed(() => [
  { value: 'none', label: 'No profile reference' },
  ...(draft.profile?.iri && !profiles.value.some((profile) =>
    profileReferenceIri(profile) === draft.profile?.iri
    || profile.profileUri === draft.profile?.iri
    || profile.graphIri === draft.profile?.iri)
    ? [{ value: draft.profile.iri, label: draft.profile.name ?? draft.profile.iri }]
    : []),
  ...profiles.value.filter((profile) => profile.managed).map((profile) => ({ value: profile.id, label: profile.name })),
])

watch(selectedProfileId, async () => {
  const profile = selectedProfile.value
  profileError.value = null
  parsedProfile.value = null
  profileValues.value = {}
  profileEntries.value = {}
  if (!profile) {
    if (selectedProfileId.value === draft.profile?.iri) return
    draft.profile = undefined
    return
  }
  const iri = profileReferenceIri(profile)
  draft.profile = iri ? {
    iri,
    name: profile.name,
    version: profile.version,
    contextTerms: profile.contextTerms,
  } : undefined
  profileLoading.value = true
  try {
    const loaded: ActiveProfileControls = profile.documentId
      ? await loadProfileCrate(profile.documentId)
      : {
          entityRules: profile.entityRules,
          datasetPropertyRules: profile.propertyRules,
          schema: profile.schema,
          contextTerms: profile.contextTerms,
          liftNotes: [],
        }
    parsedProfile.value = loaded
    if (draft.profile) draft.profile.contextTerms = loaded.contextTerms
    profileValues.value = defaultControlValues(profileControls.value)
  } catch (error) {
    profileError.value = error instanceof Error ? error.message : String(error)
  } finally {
    profileLoading.value = false
  }
})

async function seedDraftFromCrate(imported: DatasetDraft) {
  const groupId = draft.basics.groupId
  const visibility = draft.visibility
  const profileIri = imported.profile?.iri
  const registeredProfile = profileIri
    ? profiles.value.find((profile) =>
        profileReferenceIri(profile) === profileIri || profile.profileUri === profileIri || profile.graphIri === profileIri)
    : undefined
  selectedProfileId.value = registeredProfile?.id ?? profileIri ?? 'none'
  await nextTick()
  Object.assign(draft, imported)
  draft.basics.groupId = groupId
  draft.visibility = visibility
  keywordsText.value = imported.basics.keywords?.join(', ') ?? ''
  pathTouched.value = false
  profileValues.value = {}
  profileEntries.value = {}
  submitError.value = null
  writeIssues.value = []
}

const profileRules = computed<ProfilePropertyRule[]>(() => parsedProfile.value?.datasetPropertyRules ?? [])
const profileEntityRules = computed<ProfileEntityRule[]>(() => parsedProfile.value?.entityRules ?? [])
const profileControls = computed(() => controlsFromRules(profileRules.value, profileEntityRules.value))
const basicProperties = new Set(['name', 'description', 'datePublished', 'license', 'keywords'])
const profileScalarControls = computed(() => profileControls.value.filter((control) =>
  control.control !== 'entity' && !basicProperties.has(control.property),
))
const profileEntityControls = computed(() => profileControls.value.filter((control) => control.control === 'entity'))
const partOptions = computed(() => draft.parts
  .filter((part) => part.kind !== 'dataset')
  .map((part) => ({
    value: part.kind === 'object' ? part.id : part.url,
    label: part.kind === 'object' ? part.name : part.name || part.url,
  })))
const partIds = computed(() => new Set(partOptions.value.map((option) => option.value)))

function addProfileEntry(control: ProfileControl, source: 'new' | 'existing') {
  const entry = source === 'new' ? newEntityEntry(control, profileEntityRules.value, 1) : newRefEntry()
  profileEntries.value = {
    ...profileEntries.value,
    [control.property]: [...(profileEntries.value[control.property] ?? []), entry],
  }
}

function patchProfileEntry(property: string, index: number, changes: Partial<EntityEntry>) {
  const entries = [...(profileEntries.value[property] ?? [])]
  const current = entries[index]
  if (!current) return
  entries[index] = { ...current, ...changes }
  profileEntries.value = { ...profileEntries.value, [property]: entries }
}

function removeProfileEntry(property: string, index: number) {
  const entries = [...(profileEntries.value[property] ?? [])]
  entries.splice(index, 1)
  profileEntries.value = { ...profileEntries.value, [property]: entries }
}

function updateProfileEntryValue(property: string, index: number, key: string, value: unknown) {
  const current = profileEntries.value[property]?.[index]
  if (!current || current.source !== 'new') return
  patchProfileEntry(property, index, { instance: { ...(current.instance ?? {}), [key]: value } })
}

function profileEntryViolations(control: ProfileControl): EntryViolationNode[] {
  return validateEntries(profileEntries.value[control.property] ?? [], control, {
    entityRules: profileEntityRules.value,
    crateIds: partIds.value,
  }, 1)
}

function profilePresenceViolations(_control: ProfileControl): ProfileViolation[] {
  return []
}

const assembledDraft = computed<DatasetDraft>(() => {
  const entities = draft.entities.map((entity) => ({
    ...entity,
    properties: { ...entity.properties },
    roles: [...entity.roles],
  }))
  const custom = {
    ...(draft.custom ?? {}),
    ...normalizeProfileValues(profileValues.value, profileScalarControls.value, { omitEmpty: true }),
  }
  const usedSyntheticIds = new Set<string>()
  const addEntity = (raw: Record<string, unknown>) => {
    const id = typeof raw['@id'] === 'string' ? raw['@id'] : ''
    const type = raw['@type']
    if (!id || (typeof type !== 'string' && !Array.isArray(type))) return
    const { ['@id']: _id, ['@type']: _type, ...properties } = raw
    entities.push({ id, type: type as string | string[], properties, roles: [] })
  }
  const emitContext = {
    entityRules: profileEntityRules.value,
    contextTerms: parsedProfile.value?.contextTerms ?? {},
    validCrateIds: partIds.value,
    usedSyntheticIds,
    addEntity,
  }
  for (const control of profileEntityControls.value) {
    const refs = emitEntityEntries(control, profileEntries.value[control.property] ?? [], emitContext, 1)
    if (refs.length) custom[control.property] = control.multiple ? refs : refs[0]
  }
  for (const control of profileScalarControls.value) {
    if (control.control !== 'select-object') continue
    const ref = emitSelectObject(control, profileValues.value[control.property], addEntity)
    if (ref) custom[control.property] = ref
  }
  return {
    basics: {
      ...draft.basics,
      title: draft.basics.title.trim(),
      description: draft.basics.description.trim(),
      path: draft.basics.path?.trim(),
      license: draft.basics.license.trim(),
      keywords: [...(draft.basics.keywords ?? [])],
    },
    entities,
    parts: [...draft.parts],
    visibility: draft.visibility,
    ...(draft.profile ? { profile: { ...draft.profile } } : {}),
    custom,
  }
})
const built = computed(() => buildDataset(assembledDraft.value))

const reusableEntities = computed<ContextEntity[]>(() => {
  const found = new Map<string, ContextEntity>()
  for (const crate of Object.values(fullCrates.value)) {
    if (!crate || typeof crate !== 'object' || Array.isArray(crate)) continue
    const graph = (crate as Record<string, unknown>)['@graph']
    if (!Array.isArray(graph)) continue
    const records = graph.filter((entry): entry is Record<string, unknown> =>
      Boolean(entry && typeof entry === 'object' && !Array.isArray(entry)),
    )
    const root = records.find((entry) => entry['@id'] === './')
    const roles = new Map<string, string[]>()
    for (const [property, value] of Object.entries(root ?? {})) {
      if (property.startsWith('@')) continue
      const values = Array.isArray(value) ? value : [value]
      for (const candidate of values) {
        if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue
        const id = (candidate as Record<string, unknown>)['@id']
        if (typeof id === 'string') roles.set(id, [...(roles.get(id) ?? []), property])
      }
    }
    for (const record of records) {
      const id = typeof record['@id'] === 'string' ? record['@id'] : ''
      const rawType = record['@type']
      const types = Array.isArray(rawType) ? rawType.map(String) : typeof rawType === 'string' ? [rawType] : []
      if (!id || id === './' || id === 'ro-crate-metadata.json' || types.includes('File') || found.has(id)) continue
      const { ['@id']: _id, ['@type']: _type, ...properties } = record
      found.set(id, {
        id,
        type: Array.isArray(rawType) ? types : types[0] || 'Thing',
        properties,
        roles: (roles.get(id) ?? []) as ContextEntity['roles'],
      })
    }
  }
  return [...found.values()]
})

function openAddContext() {
  editingEntity.value = null
  contextOpen.value = true
}

function saveContext(value: { entity: ContextEntity; relatedEntities: ContextEntity[] }) {
  const oldId = editingEntity.value?.id
  const next = oldId
    ? draft.entities.map((entity) => entity.id === oldId ? value.entity : entity)
    : [...draft.entities, value.entity]
  for (const related of value.relatedEntities) {
    if (!next.some((entity) => entity.id === related.id)) next.push(related)
  }
  draft.entities = next
  editingEntity.value = null
}

function reuseContext(entity: ContextEntity) {
  const index = draft.entities.findIndex((candidate) => candidate.id === entity.id)
  if (index >= 0) draft.entities.splice(index, 1, entity)
  else draft.entities.push(entity)
  editingEntity.value = null
}

function addYourself() {
  if (!currentUser.value) return
  reuseContext(signedInUserEntity(currentUser.value))
}
const signedInUserId = computed(() => currentUser.value ? signedInUserEntity(currentUser.value).id : '')

const desktop = isDesktop()
const deviceStatus = desktop ? useDeviceStatus() : null
const preview = useProfilePreview({
  client: () => ({ baseUrl: apiBaseUrl.value, token: authToken.value ?? undefined }),
  ...(desktop
    ? {
        request: (rocrate: unknown, signal: AbortSignal) =>
          previewDeviceDraft(rocrate, requireDevice(deviceStatus?.deviceClient.value, 'draft validation'), signal),
      }
    : {}),
})

const basicsComplete = computed(() => Boolean(
  draft.basics.groupId
  && draft.basics.path?.trim()
  && draft.basics.title.trim()
  && draft.basics.description.trim()
  && draft.basics.datePublished
  && draft.basics.license.trim(),
))
const sections = computed(() => [
  { id: 'basics', label: 'Basics', complete: basicsComplete.value },
  { id: 'context', label: 'Context', complete: true },
  { id: 'parts', label: 'Parts', complete: true },
  { id: 'review', label: 'Review', complete: basicsComplete.value },
])

function goToSection(id: string) {
  activeSection.value = id
  globalThis.document?.getElementById(`dataset-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  if (id === 'review') preview.previewNow(built.value.rocrate)
}

function writeStructuralViolations(error: unknown): RoCrateStructuralViolation[] {
  const violations = error instanceof ApiError ? error.details?.violations : undefined
  return Array.isArray(violations)
    ? violations.filter((value): value is RoCrateStructuralViolation =>
        Boolean(value && typeof value === 'object' && !Array.isArray(value) && typeof (value as Record<string, unknown>).message === 'string'))
    : []
}

async function create() {
  if (!basicsComplete.value) return
  submitError.value = null
  writeIssues.value = []
  try {
    const result = await createMetadata({
      group_id: draft.basics.groupId ?? '',
      path: draft.basics.path?.trim() ?? '',
      public: built.value.public,
      rocrate: built.value.rocrate,
    })
    await router.push({ name: 'dataset', params: { id: result.document_id } })
  } catch (error) {
    submitError.value = error instanceof Error ? error.message : String(error)
    writeIssues.value = [
      ...writeStructuralViolations(error).map((issue) => ({
        code: issue.code,
        message: issue.message,
        entityId: issue.entity_id,
        path: issue.pointer,
        severity: 'violation',
      })),
      ...profileValidationFindings(error).map((finding) => ({
        code: finding.code,
        message: finding.message,
        entityId: finding.focus_node,
        path: finding.path,
        severity: finding.severity,
      })),
    ]
    goToSection('review')
  }
}
</script>

<template>
  <div>
    <PageHeader title="New dataset" description="Create and review one complete RO-Crate dataset." />

    <div class="container grid gap-8 py-8 lg:grid-cols-[220px_minmax(0,1fr)]">
      <aside class="lg:sticky lg:top-20 lg:self-start">
        <nav aria-label="Dataset sections" class="surface space-y-1 p-2">
          <button
            v-for="section in sections"
            :key="section.id"
            type="button"
            class="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm"
            :class="activeSection === section.id ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted/40'"
            @click="goToSection(section.id)"
          >
            <span>{{ section.label }}</span>
            <Badge :variant="section.complete ? 'success' : 'warn'">{{ section.complete ? 'Complete' : 'Incomplete' }}</Badge>
          </button>
        </nav>
      </aside>

      <main class="space-y-8">
        <section id="dataset-basics" class="surface scroll-mt-24 space-y-5 p-6">
          <header class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 class="font-display text-lg font-semibold text-foreground">Basics</h2>
              <p class="mt-1 text-sm text-muted-foreground">Name, location, profile, and descriptive fields.</p>
            </div>
            <Button type="button" variant="outline" size="sm" @click="importCrateOpen = true">
              <FileJson2 class="h-3.5 w-3.5" /> Start from RO-Crate JSON-LD
            </Button>
          </header>

          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <label class="text-xs font-medium text-foreground">Group <span class="text-destructive">*</span></label>
              <GroupSelect v-model="draft.basics.groupId" :options="groupOptions" class="mt-1" placeholder="Choose a group">
                <template #action>
                  <Button variant="link" size="sm" class="h-auto p-0 text-xs" @click="createGroupOpen = true"><Plus class="h-3.5 w-3.5" /> Create a group</Button>
                </template>
              </GroupSelect>
            </div>
            <div>
              <label class="text-xs font-medium text-foreground">Profile</label>
              <Select v-model="selectedProfileId" :options="profileOptions" class="mt-1" aria-label="Dataset profile" />
              <p v-if="profileLoading" class="mt-1 text-[11px] text-muted-foreground">Loading profile controls.</p>
              <p v-if="profileError" class="mt-1 text-[11px] text-destructive">{{ profileError }}</p>
            </div>
            <div>
              <label class="text-xs font-medium text-foreground">Title <span class="text-destructive">*</span></label>
              <Input v-model="draft.basics.title" class="mt-1" />
            </div>
            <div>
              <label class="text-xs font-medium text-foreground">Path <span class="text-destructive">*</span></label>
              <Input
                :model-value="draft.basics.path"
                class="mt-1 font-mono text-xs"
                @update:model-value="(value: string | number) => { draft.basics.path = String(value); pathTouched = true }"
              />
            </div>
            <div class="sm:col-span-2">
              <label class="text-xs font-medium text-foreground">Description <span class="text-destructive">*</span></label>
              <Textarea v-model="draft.basics.description" rows="4" class="mt-1" />
            </div>
            <div>
              <label class="text-xs font-medium text-foreground">Date published <span class="text-destructive">*</span></label>
              <Input v-model="draft.basics.datePublished" type="date" class="mt-1" />
            </div>
            <div>
              <label class="text-xs font-medium text-foreground">License URL <span class="text-destructive">*</span></label>
              <Input v-model="draft.basics.license" type="url" class="mt-1" />
            </div>
            <div class="sm:col-span-2">
              <label class="text-xs font-medium text-foreground">Keywords</label>
              <Input v-model="keywordsText" class="mt-1" placeholder="genomics, microscopy" />
            </div>
          </div>

          <div v-if="profileScalarControls.length" class="grid gap-4 border-t border-border pt-5 sm:grid-cols-2">
            <ProfileControlField
              v-for="control in profileScalarControls"
              :key="control.property"
              :control="control"
              :model-value="profileValues[control.property]"
              @update:model-value="(value) => (profileValues = { ...profileValues, [control.property]: value })"
            />
          </div>
          <div v-if="parsedProfile?.liftNotes.length" class="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
            <p class="font-medium">Additional SHACL requirements</p>
            <ul class="mt-1 list-disc space-y-1 pl-4">
              <li v-for="(note, index) in parsedProfile.liftNotes" :key="index">{{ note.message }}</li>
            </ul>
          </div>
        </section>

        <section id="dataset-context" class="surface scroll-mt-24 space-y-5 p-6">
          <header class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 class="font-display text-lg font-semibold text-foreground">Context</h2>
              <p class="mt-1 text-sm text-muted-foreground">People, organizations, publications, terms, and other entities around the root.</p>
            </div>
            <div class="flex items-center gap-2">
              <Button v-if="currentUser && !draft.entities.some((entity) => entity.id === signedInUserId)" variant="outline" size="sm" @click="addYourself">
                <UserRoundPlus class="h-3.5 w-3.5" /> Add yourself
              </Button>
              <Button size="sm" @click="openAddContext"><Plus class="h-3.5 w-3.5" /> Add context</Button>
            </div>
          </header>
          <ContextEntityList
            :root-name="draft.basics.title"
            :entities="draft.entities"
            @edit="(entity) => { editingEntity = entity; contextOpen = true }"
            @remove="(id) => (draft.entities = draft.entities.filter((entity) => entity.id !== id))"
          />

          <div v-if="profileEntityControls.length" class="space-y-4 border-t border-border pt-5">
            <h3 class="text-sm font-semibold text-foreground">Profile entity instances</h3>
            <DatasetEntityInstances
              v-for="control in profileEntityControls"
              :key="control.property"
              :control="control"
              :sub-controls="subControlsFor(control, profileEntityRules)"
              :entries="profileEntries[control.property] ?? []"
              :entry-violations="profileEntryViolations(control)"
              :presence-violations="profilePresenceViolations(control)"
              :type-label="entityTypeLabelFor(control)"
              :crate-options="partOptions"
              :entity-rules="profileEntityRules"
              :depth="1"
              @add-new="addProfileEntry(control, 'new')"
              @add-existing="addProfileEntry(control, 'existing')"
              @remove="(index) => removeProfileEntry(control.property, index)"
              @switch-source="(index, source) => patchProfileEntry(control.property, index, source === 'new' ? newEntityEntry(control, profileEntityRules, 1) : newRefEntry())"
              @update="(index, property, value) => updateProfileEntryValue(control.property, index, property, value)"
              @update-ref="(index, value) => patchProfileEntry(control.property, index, { ref: value })"
              @update-custom-id="(index, value) => patchProfileEntry(control.property, index, { customId: value })"
            />
          </div>
        </section>

        <section id="dataset-parts" class="surface scroll-mt-24 space-y-5 p-6">
          <header>
            <h2 class="font-display text-lg font-semibold text-foreground">Parts</h2>
            <p class="mt-1 text-sm text-muted-foreground">Objects, external URLs, and existing datasets linked through hasPart.</p>
          </header>
          <DatasetPartsSection v-model="draft.parts" />
        </section>

        <section id="dataset-review" class="surface scroll-mt-24 space-y-5 p-6">
          <header>
            <h2 class="font-display text-lg font-semibold text-foreground">Review</h2>
            <p class="mt-1 text-sm text-muted-foreground">Validate the complete crate and choose who can see it.</p>
          </header>
          <DatasetReviewSection
            :rocrate="built.rocrate"
            :visibility="draft.visibility"
            :group-id="draft.basics.groupId"
            :preview-result="preview.result.value"
            :preview-running="preview.running.value"
            :preview-error="preview.error.value"
            :write-issues="writeIssues"
            :submit-error="submitError"
            :saving="saving"
            :can-create="basicsComplete"
            @update:visibility="(value) => (draft.visibility = value)"
            @preview="preview.previewNow(built.rocrate)"
            @create="create"
            @jump="(entityId) => goToSection(entityId === './' ? 'basics' : 'context')"
          />
        </section>
      </main>
    </div>

    <ImportCrateDialog v-model:open="importCrateOpen" @imported="seedDraftFromCrate" />
    <CreateGroupDialog v-model:open="createGroupOpen" @created="(group) => (draft.basics.groupId = group.group_id)" />
    <AddContextDialog
      v-model:open="contextOpen"
      :entities="draft.entities"
      :dataset-entities="reusableEntities"
      :editing="editingEntity"
      @save="saveContext"
      @reuse="reuseContext"
    />
  </div>
</template>
