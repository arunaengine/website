<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import PageHeader from '@/components/dashboard/PageHeader.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Textarea from '@/components/ui/Textarea.vue'
import Select from '@/components/ui/Select.vue'
import Badge from '@/components/ui/Badge.vue'
import Notice from '@/components/ui/Notice.vue'
import GroupSelect from '@/components/groups/GroupSelect.vue'
import CreateGroupDialog from '@/components/groups/CreateGroupDialog.vue'
import ProfileControlField from '@/components/metadata/ProfileControlField.vue'
import DatasetEntityInstances from '@/components/metadata/DatasetEntityInstances.vue'
import ContextEntityList from '@/components/metadata/ContextEntityList.vue'
import AddContextDialog from '@/components/metadata/AddContextDialog.vue'
import CustomFieldsEditor from '@/components/metadata/CustomFieldsEditor.vue'
import DatasetPartsSection from '@/components/metadata/DatasetPartsSection.vue'
import DatasetReviewSection from '@/components/metadata/DatasetReviewSection.vue'
import ImportCrateDialog from '@/components/metadata/ImportCrateDialog.vue'
import LicenseField from '@/components/metadata/LicenseField.vue'
import RootReferenceField from '@/components/metadata/RootReferenceField.vue'
import { profileReferenceIri, useAruna } from '@/composables/useAruna'
import { useProfilePreview } from '@/composables/useProfilePreview'
import { useDeviceStatus } from '@/composables/useDeviceStatus'
import {
  buildDataset,
  signedInUserEntity,
  type ContextEntity,
  type DatasetDraft,
  type Part,
  type RootRole,
} from '@/lib/crate/build'
import { collectIssues, issueCounts, sectionOf } from '@/lib/crate/issues'
import { groupCustomFieldRows, seedCustomFieldRows, type CustomFieldRow } from '@/lib/customFields'
import { isDesktop } from '@/lib/desktop'
import { previewDeviceDraft, requireDevice } from '@/lib/deviceApi'
import { ApiError, profileValidationFindings, type RoCrateStructuralViolation } from '@/lib/api'
import { errorMessage } from '@/lib/utils'
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

const REFERENCE_FIELDS: Array<{ label: string; role: RootRole }> = [
  { label: 'Authors', role: 'author' },
  { label: 'Contributors', role: 'contributor' },
  { label: 'Publisher', role: 'publisher' },
  { label: 'Funder', role: 'funder' },
  { label: 'Cited works', role: 'citation' },
  { label: 'Contact', role: 'contactPoint' },
  { label: 'Location', role: 'spatialCoverage' },
]

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
    license: '',
    keywords: [],
  },
  entities: [],
  parts: [],
  visibility: 'group',
})
const keywordsText = ref('')
const pathTouched = ref(false)
const pathEditing = ref(false)
const customRows = ref<CustomFieldRow[]>([])
const createGroupOpen = ref(false)
const importCrateOpen = ref(false)
const contextOpen = ref(false)
const editingEntity = ref<ContextEntity | null>(null)
const referenceRole = ref<RootRole | null>(null)
const activeSection = ref('basics')
const reviewVisible = ref(false)
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
    profileError.value = errorMessage(error)
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
  seedCustomRows(imported.custom)
  profileValues.value = {}
  profileEntries.value = {}
  submitError.value = null
  writeIssues.value = []
}

// Scalar extras become editable rows; anything structured stays on the draft.
function seedCustomRows(custom: Record<string, unknown> | undefined) {
  const seeded = seedCustomFieldRows(custom ?? {}, new Set())
  customRows.value = seeded.rows
  const preserved = new Set(seeded.preserved.map((entry) => entry.key))
  draft.custom = Object.fromEntries(Object.entries(custom ?? {}).filter(([key]) => preserved.has(key)))
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

function partEntityId(part: Part): string {
  if (part.kind === 'object') return part.id
  return part.kind === 'external' ? part.url : part.link.iri
}
const partEntityIds = computed(() => new Set(draft.parts.map(partEntityId)))

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
    ...groupCustomFieldRows(customRows.value),
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
  referenceRole.value = null
  contextOpen.value = true
}

function editContext(entity: ContextEntity) {
  editingEntity.value = entity
  referenceRole.value = null
  contextOpen.value = true
}

function addReference(role: RootRole) {
  editingEntity.value = null
  referenceRole.value = role
  contextOpen.value = true
}

function selectReference(role: RootRole, entity: ContextEntity) {
  draft.entities = draft.entities.map((candidate) => candidate.id === entity.id
    ? { ...candidate, roles: [...new Set([...candidate.roles, role])] }
    : candidate)
}

// Dropping a role keeps the entity while another role still points at it.
function removeReference(role: RootRole, entity: ContextEntity) {
  const roles = entity.roles.filter((candidate) => candidate !== role)
  draft.entities = roles.length
    ? draft.entities.map((candidate) => candidate.id === entity.id ? { ...candidate, roles } : candidate)
    : draft.entities.filter((candidate) => candidate.id !== entity.id)
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
  && draft.basics.title.trim()
  && draft.basics.description.trim()
  && draft.basics.datePublished,
))
// The node's last verdict blocks the write; a check that could not run does not.
const nodeRejected = computed(() => preview.result.value ? !preview.result.value.accepted : false)
const canCreate = computed(() => basicsComplete.value && !nodeRejected.value)
const checkIssues = computed(() => collectIssues(preview.result.value, writeIssues.value))
const problemCounts = computed(() => issueCounts(checkIssues.value, partEntityIds.value))
const sections = computed(() => [
  { id: 'basics', label: 'Basics', problems: problemCounts.value.basics },
  { id: 'context', label: 'Context', problems: problemCounts.value.context },
  { id: 'parts', label: 'Parts', problems: problemCounts.value.parts },
  { id: 'review', label: 'Review', problems: 0 },
])

function goToSection(id: string) {
  activeSection.value = id
  globalThis.document?.getElementById(`dataset-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  if (id === 'review') preview.previewNow(built.value.rocrate)
}

function reviewEntered() {
  reviewVisible.value = true
  preview.previewNow(built.value.rocrate)
}
watch(built, (value) => {
  if (reviewVisible.value) preview.preview(value.rocrate)
})

function writeStructuralViolations(error: unknown): RoCrateStructuralViolation[] {
  const violations = error instanceof ApiError ? error.details?.violations : undefined
  return Array.isArray(violations)
    ? violations.filter((value): value is RoCrateStructuralViolation =>
        Boolean(value && typeof value === 'object' && !Array.isArray(value) && typeof (value as Record<string, unknown>).message === 'string'))
    : []
}

async function create() {
  if (!canCreate.value) return
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
    submitError.value = errorMessage(error)
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
    <PageHeader title="New dataset" description="Describe your dataset, add people and files, then create it." />

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
            <Badge v-if="section.problems" variant="destructive">{{ section.problems }}</Badge>
          </button>
        </nav>
      </aside>

      <main class="space-y-8">
        <section id="dataset-basics" class="surface scroll-mt-24 space-y-5 p-6">
          <header class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 class="font-display text-lg font-semibold text-foreground">Basics</h2>
              <p class="mt-1 text-sm text-muted-foreground">What the dataset is and who made it.</p>
            </div>
            <Button type="button" variant="outline" size="sm" @click="importCrateOpen = true">
              <FileJson2 class="h-3.5 w-3.5" /> Import an RO-Crate
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
              <div class="flex items-center justify-between gap-2">
                <label class="text-xs font-medium text-foreground">Path</label>
                <Button variant="link" size="sm" class="h-auto p-0 text-xs" @click="pathEditing = !pathEditing">
                  {{ pathEditing ? 'Done' : 'Edit' }}
                </Button>
              </div>
              <Input
                v-if="pathEditing"
                :model-value="draft.basics.path"
                aria-label="Dataset path"
                class="mt-1 font-mono text-xs"
                @update:model-value="(value: string | number) => { draft.basics.path = String(value); pathTouched = true }"
              />
              <p v-else class="mt-1 truncate rounded-md border border-border bg-muted/30 px-3 py-2 font-mono text-xs text-muted-foreground">
                {{ draft.basics.path || 'Generated from the title.' }}
              </p>
            </div>
            <div class="sm:col-span-2">
              <label class="text-xs font-medium text-foreground">Description <span class="text-destructive">*</span></label>
              <Textarea v-model="draft.basics.description" rows="4" class="mt-1" />
            </div>
            <div>
              <label class="text-xs font-medium text-foreground">Date published <span class="text-destructive">*</span></label>
              <Input v-model="draft.basics.datePublished" type="date" class="mt-1" />
            </div>
            <LicenseField v-model="draft.basics.license" />
            <div class="sm:col-span-2">
              <label class="text-xs font-medium text-foreground">Keywords</label>
              <Input v-model="keywordsText" class="mt-1" placeholder="genomics, microscopy" />
            </div>
          </div>

          <div class="grid gap-4 border-t border-border pt-5 sm:grid-cols-2">
            <RootReferenceField
              v-for="field in REFERENCE_FIELDS"
              :key="field.role"
              :label="field.label"
              :role="field.role"
              :entities="draft.entities"
              @add="addReference"
              @select="selectReference"
              @remove="removeReference"
            >
              <template #action>
                <Button
                  v-if="field.role === 'author' && currentUser && !draft.entities.some((entity) => entity.id === signedInUserId)"
                  variant="link"
                  size="sm"
                  class="h-auto p-0 text-xs"
                  @click="addYourself"
                >
                  <UserRoundPlus class="h-3.5 w-3.5" /> Add yourself
                </Button>
              </template>
            </RootReferenceField>
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
          <Notice
            v-if="parsedProfile?.liftNotes.length"
            tone="warning"
            title="Additional profile requirements"
            :lines="parsedProfile.liftNotes.map((note) => note.message)"
          />

          <details class="border-t border-border pt-4">
            <summary class="cursor-pointer text-xs font-medium text-foreground">Other properties</summary>
            <div class="mt-3">
              <CustomFieldsEditor :rows="customRows" @update:rows="(rows) => (customRows = rows)" />
            </div>
          </details>
        </section>

        <section id="dataset-context" class="surface scroll-mt-24 space-y-5 p-6">
          <header class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 class="font-display text-lg font-semibold text-foreground">Context</h2>
              <p class="mt-1 text-sm text-muted-foreground">Everything this dataset refers to. Authors and publishers added above appear here too.</p>
            </div>
            <Button size="sm" @click="openAddContext"><Plus class="h-3.5 w-3.5" /> Add entity</Button>
          </header>
          <ContextEntityList
            :root-name="draft.basics.title"
            :entities="draft.entities"
            @edit="editContext"
            @remove="(id) => (draft.entities = draft.entities.filter((entity) => entity.id !== id))"
          />

          <div v-if="profileEntityControls.length" class="space-y-4 border-t border-border pt-5">
            <h3 class="text-sm font-semibold text-foreground">Required by the profile</h3>
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
            <p class="mt-1 text-sm text-muted-foreground">Files from your buckets, external links, and other datasets.</p>
          </header>
          <DatasetPartsSection v-model="draft.parts" />
        </section>

        <section id="dataset-review" class="surface scroll-mt-24 space-y-5 p-6">
          <header>
            <h2 class="font-display text-lg font-semibold text-foreground">Review</h2>
            <p class="mt-1 text-sm text-muted-foreground">Check the dataset with the node and choose who can see it.</p>
          </header>
          <DatasetReviewSection
            :rocrate="built.rocrate"
            :visibility="draft.visibility"
            :group-id="draft.basics.groupId"
            :entities="draft.entities"
            :root-name="draft.basics.title"
            :part-ids="[...partEntityIds]"
            :profile-name="selectedProfile?.name ?? draft.profile?.name"
            :preview-result="preview.result.value"
            :preview-running="preview.running.value"
            :preview-error="preview.error.value"
            :preview-unavailable="preview.unavailable.value"
            :write-issues="writeIssues"
            :submit-error="submitError"
            :saving="saving"
            :can-create="canCreate"
            @update:visibility="(value) => (draft.visibility = value)"
            @preview="preview.previewNow(built.rocrate)"
            @visible="reviewEntered"
            @create="create"
            @jump="(entityId) => goToSection(sectionOf(entityId, partEntityIds))"
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
      :role="referenceRole"
      @save="saveContext"
      @reuse="reuseContext"
    />
  </div>
</template>
