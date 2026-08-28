<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import PageHeader from '@/components/dashboard/PageHeader.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Textarea from '@/components/ui/Textarea.vue'
import Badge from '@/components/ui/Badge.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import ContextEntityList from '@/components/metadata/ContextEntityList.vue'
import AddContextDialog from '@/components/metadata/AddContextDialog.vue'
import CustomFieldsEditor from '@/components/metadata/CustomFieldsEditor.vue'
import DatasetPartsSection from '@/components/metadata/DatasetPartsSection.vue'
import DatasetReviewSection from '@/components/metadata/DatasetReviewSection.vue'
import LicenseField from '@/components/metadata/LicenseField.vue'
import RootReferenceField from '@/components/metadata/RootReferenceField.vue'
import { useAruna } from '@/composables/useAruna'
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
import { parseDatasetDraft } from '@/lib/crate/parse'
import { collectIssues, issueCounts, sectionOf } from '@/lib/crate/issues'
import { groupCustomFieldRows, seedCustomFieldRows, type CustomFieldRow } from '@/lib/customFields'
import { isDesktop } from '@/lib/desktop'
import { previewDeviceDraft, requireDevice } from '@/lib/deviceApi'
import { ApiError, profileValidationFindings, type RoCrateStructuralViolation } from '@/lib/api'
import { errorMessage } from '@/lib/utils'
import { ArrowLeft, Plus, UserRoundPlus } from '@lucide/vue'

const REFERENCE_FIELDS: Array<{ label: string; role: RootRole }> = [
  { label: 'Authors', role: 'author' },
  { label: 'Contributors', role: 'contributor' },
  { label: 'Publisher', role: 'publisher' },
  { label: 'Funder', role: 'funder' },
  { label: 'Cited works', role: 'citation' },
  { label: 'Contact', role: 'contactPoint' },
  { label: 'Location', role: 'spatialCoverage' },
]

const route = useRoute()
const router = useRouter()
const {
  fullCrates,
  getMetadataItem,
  fetchRoCrateRaw,
  replaceMetadataRoCrate,
  saving,
  currentUser,
  apiBaseUrl,
  authToken,
} = useAruna()

const documentId = computed(() => String(route.params.id ?? ''))
const draft = ref<DatasetDraft | null>(null)
const keywordsText = ref('')
const customRows = ref<CustomFieldRow[]>([])
const preservedCustom = ref<Record<string, unknown>>({})
const loading = ref(false)
const loadError = ref<string | null>(null)
const activeSection = ref('basics')
const reviewVisible = ref(false)
const contextOpen = ref(false)
const editingEntity = ref<ContextEntity | null>(null)
const referenceRole = ref<RootRole | null>(null)
const submitError = ref<string | null>(null)
const writeIssues = ref<Array<{
  code?: string
  message: string
  entityId?: string | null
  path?: string | null
  severity?: string
}>>([])

async function load() {
  if (!documentId.value) return
  loading.value = true
  loadError.value = null
  try {
    const [summary, crate] = await Promise.all([
      getMetadataItem(documentId.value),
      fetchRoCrateRaw(documentId.value),
    ])
    draft.value = parseDatasetDraft(crate, {
      groupId: summary.group_id,
      path: summary.document_path,
      public: summary.public,
    })
    keywordsText.value = draft.value.basics.keywords?.join(', ') ?? ''
    seedCustomRows(draft.value.custom)
  } catch (error) {
    loadError.value = errorMessage(error)
  } finally {
    loading.value = false
  }
}
watch(documentId, () => void load(), { immediate: true })
watch(keywordsText, (value) => {
  if (draft.value) draft.value.basics.keywords = value.split(',').map((entry) => entry.trim()).filter(Boolean)
})

// Scalar extras become editable rows; anything structured is preserved as-is.
function seedCustomRows(custom: Record<string, unknown> | undefined) {
  const seeded = seedCustomFieldRows(custom ?? {}, new Set())
  const preserved = new Set(seeded.preserved.map((entry) => entry.key))
  preservedCustom.value = Object.fromEntries(Object.entries(custom ?? {}).filter(([key]) => preserved.has(key)))
  customRows.value = seeded.rows
}
watch(customRows, (rows) => {
  if (draft.value) draft.value.custom = { ...preservedCustom.value, ...groupCustomFieldRows(rows) }
}, { deep: true })

const built = computed(() => draft.value ? buildDataset(draft.value) : null)
const basicsComplete = computed(() => Boolean(
  draft.value?.basics.title.trim()
  && draft.value.basics.description.trim()
  && draft.value.basics.datePublished,
))

function partEntityId(part: Part): string {
  if (part.kind === 'object') return part.id
  return part.kind === 'external' ? part.url : part.link.iri
}
const partEntityIds = computed(() => new Set((draft.value?.parts ?? []).map(partEntityId)))

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

// The node's last verdict blocks the write; a check that could not run does not.
const nodeRejected = computed(() => preview.result.value ? !preview.result.value.accepted : false)
const canSave = computed(() => basicsComplete.value && !nodeRejected.value)
const checkIssues = computed(() => collectIssues(preview.result.value, writeIssues.value))
const problemCounts = computed(() => issueCounts(checkIssues.value, partEntityIds.value))
const sections = computed(() => [
  { id: 'basics', label: 'Basics', problems: problemCounts.value.basics },
  { id: 'context', label: 'Context', problems: problemCounts.value.context },
  { id: 'parts', label: 'Parts', problems: problemCounts.value.parts },
  { id: 'review', label: 'Review', problems: 0 },
])

const reusableEntities = computed(() => {
  const entities = new Map<string, ContextEntity>()
  for (const crate of Object.values(fullCrates.value)) {
    for (const entity of parseDatasetDraft(crate).entities) {
      if (!entities.has(entity.id)) entities.set(entity.id, entity)
    }
  }
  return [...entities.values()]
})

const signedInUserId = computed(() => currentUser.value ? signedInUserEntity(currentUser.value).id : '')

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
  if (!draft.value) return
  draft.value.entities = draft.value.entities.map((candidate) => candidate.id === entity.id
    ? { ...candidate, roles: [...new Set([...candidate.roles, role])] }
    : candidate)
}

// Dropping a role keeps the entity while another role still points at it.
function removeReference(role: RootRole, entity: ContextEntity) {
  if (!draft.value) return
  const roles = entity.roles.filter((candidate) => candidate !== role)
  draft.value.entities = roles.length
    ? draft.value.entities.map((candidate) => candidate.id === entity.id ? { ...candidate, roles } : candidate)
    : draft.value.entities.filter((candidate) => candidate.id !== entity.id)
}

function saveContext(value: { entity: ContextEntity; relatedEntities: ContextEntity[] }) {
  if (!draft.value) return
  const oldId = editingEntity.value?.id
  const next = oldId
    ? draft.value.entities.map((entity) => entity.id === oldId ? value.entity : entity)
    : [...draft.value.entities, value.entity]
  for (const related of value.relatedEntities) {
    if (!next.some((entity) => entity.id === related.id)) next.push(related)
  }
  draft.value.entities = next
  editingEntity.value = null
}

function reuseContext(entity: ContextEntity) {
  if (!draft.value) return
  const index = draft.value.entities.findIndex((candidate) => candidate.id === entity.id)
  if (index >= 0) draft.value.entities.splice(index, 1, entity)
  else draft.value.entities.push(entity)
  editingEntity.value = null
}

function addYourself() {
  if (!currentUser.value) return
  reuseContext(signedInUserEntity(currentUser.value))
}

function removeContext(id: string) {
  if (draft.value) draft.value.entities = draft.value.entities.filter((entity) => entity.id !== id)
}

function setVisibility(value: 'group' | 'public') {
  if (draft.value) draft.value.visibility = value
}

function goToSection(id: string) {
  activeSection.value = id
  globalThis.document?.getElementById(`dataset-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  if (id === 'review' && built.value) preview.previewNow(built.value.rocrate)
}

function reviewEntered() {
  reviewVisible.value = true
  if (built.value) preview.previewNow(built.value.rocrate)
}
watch(built, (value) => {
  if (value && reviewVisible.value) preview.preview(value.rocrate)
})

function structuralViolations(error: unknown): RoCrateStructuralViolation[] {
  const violations = error instanceof ApiError ? error.details?.violations : undefined
  return Array.isArray(violations)
    ? violations.filter((value): value is RoCrateStructuralViolation =>
        Boolean(value && typeof value === 'object' && !Array.isArray(value) && typeof (value as Record<string, unknown>).message === 'string'))
    : []
}

async function save() {
  if (!draft.value || !built.value || !canSave.value) return
  submitError.value = null
  writeIssues.value = []
  try {
    await replaceMetadataRoCrate(documentId.value, {
      rocrate: built.value.rocrate,
      public: built.value.public,
    })
    await router.push({ name: 'dataset', params: { id: documentId.value } })
  } catch (error) {
    submitError.value = errorMessage(error)
    writeIssues.value = [
      ...structuralViolations(error).map((issue) => ({
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
    <PageHeader title="Edit dataset" description="Change what the dataset says, then check it with the node.">
      <template #actions>
        <Button variant="outline" as-child>
          <RouterLink :to="{ name: 'dataset', params: { id: documentId } }"><ArrowLeft class="h-4 w-4" /> Dataset</RouterLink>
        </Button>
      </template>
    </PageHeader>

    <div v-if="loading" class="container space-y-3 py-8">
      <Skeleton class="h-40" />
      <Skeleton class="h-64" />
    </div>
    <div v-else-if="loadError" class="container py-8">
      <ErrorPanel :message="loadError" @retry="load" />
    </div>

    <div v-else-if="draft && built" class="container grid gap-8 py-8 lg:grid-cols-[220px_minmax(0,1fr)]">
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
          <header>
            <h2 class="font-display text-lg font-semibold text-foreground">Basics</h2>
            <p class="mt-1 text-sm text-muted-foreground">What the dataset is and who made it. Group and path stay fixed.</p>
          </header>
          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <label class="text-xs font-medium text-foreground">Group</label>
              <Input :model-value="draft.basics.groupId" class="mt-1 font-mono text-xs" disabled />
            </div>
            <div>
              <label class="text-xs font-medium text-foreground">Path</label>
              <Input :model-value="draft.basics.path" class="mt-1 font-mono text-xs" disabled />
            </div>
            <div class="sm:col-span-2">
              <label class="text-xs font-medium text-foreground">Title <span class="text-destructive">*</span></label>
              <Input v-model="draft.basics.title" class="mt-1" />
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
              <Input v-model="keywordsText" class="mt-1" />
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

          <p v-if="draft.profile" class="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            Profile reference: <span class="font-medium text-foreground">{{ draft.profile.name || draft.profile.iri }}</span>
          </p>

          <details class="border-t border-border pt-4">
            <summary class="cursor-pointer text-xs font-medium text-foreground">Other properties</summary>
            <div class="mt-3">
              <CustomFieldsEditor :rows="customRows" @update:rows="(rows) => (customRows = rows)" />
            </div>
          </details>
        </section>

        <section id="dataset-context" class="surface scroll-mt-24 space-y-5 p-6">
          <header class="flex items-center justify-between gap-3">
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
            @remove="removeContext"
          />
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
            :profile-name="draft.profile?.name"
            :preview-result="preview.result.value"
            :preview-running="preview.running.value"
            :preview-error="preview.error.value"
            :preview-unavailable="preview.unavailable.value"
            :write-issues="writeIssues"
            :submit-error="submitError"
            :saving="saving"
            :can-create="canSave"
            action-label="Save changes"
            busy-label="Saving"
            @update:visibility="setVisibility"
            @preview="preview.previewNow(built.rocrate)"
            @visible="reviewEntered"
            @create="save"
            @jump="(entityId) => goToSection(sectionOf(entityId, partEntityIds))"
          />
        </section>
      </main>
    </div>

    <AddContextDialog
      v-if="draft"
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
