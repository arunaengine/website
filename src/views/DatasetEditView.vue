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
import DatasetPartsSection from '@/components/metadata/DatasetPartsSection.vue'
import DatasetReviewSection from '@/components/metadata/DatasetReviewSection.vue'
import { useAruna } from '@/composables/useAruna'
import { useProfilePreview } from '@/composables/useProfilePreview'
import { useDeviceStatus } from '@/composables/useDeviceStatus'
import { buildDataset, type ContextEntity, type DatasetDraft } from '@/lib/crate/build'
import { parseDatasetDraft } from '@/lib/crate/parse'
import { isDesktop } from '@/lib/desktop'
import { previewDeviceDraft, requireDevice } from '@/lib/deviceApi'
import { ApiError, profileValidationFindings, type RoCrateStructuralViolation } from '@/lib/api'
import { errorMessage } from '@/lib/utils'
import { ArrowLeft, Plus } from '@lucide/vue'

const route = useRoute()
const router = useRouter()
const {
  fullCrates,
  getMetadataItem,
  fetchRoCrateRaw,
  replaceMetadataRoCrate,
  saving,
  apiBaseUrl,
  authToken,
} = useAruna()

const documentId = computed(() => String(route.params.id ?? ''))
const draft = ref<DatasetDraft | null>(null)
const keywordsText = ref('')
const loading = ref(false)
const loadError = ref<string | null>(null)
const activeSection = ref('basics')
const contextOpen = ref(false)
const editingEntity = ref<ContextEntity | null>(null)
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

const built = computed(() => draft.value ? buildDataset(draft.value) : null)
const basicsComplete = computed(() => Boolean(
  draft.value?.basics.title.trim()
  && draft.value.basics.description.trim()
  && draft.value.basics.datePublished
  && draft.value.basics.license.trim(),
))
const sections = computed(() => [
  { id: 'basics', label: 'Basics', complete: basicsComplete.value },
  { id: 'context', label: 'Context', complete: true },
  { id: 'parts', label: 'Parts', complete: true },
  { id: 'review', label: 'Review', complete: basicsComplete.value },
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

function removeContext(id: string) {
  if (draft.value) draft.value.entities = draft.value.entities.filter((entity) => entity.id !== id)
}

function setVisibility(value: 'group' | 'public') {
  if (draft.value) draft.value.visibility = value
}

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

function goToSection(id: string) {
  activeSection.value = id
  globalThis.document?.getElementById(`dataset-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  if (id === 'review' && built.value) preview.previewNow(built.value.rocrate)
}

function structuralViolations(error: unknown): RoCrateStructuralViolation[] {
  const violations = error instanceof ApiError ? error.details?.violations : undefined
  return Array.isArray(violations)
    ? violations.filter((value): value is RoCrateStructuralViolation =>
        Boolean(value && typeof value === 'object' && !Array.isArray(value) && typeof (value as Record<string, unknown>).message === 'string'))
    : []
}

async function save() {
  if (!draft.value || !built.value || !basicsComplete.value) return
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
    <PageHeader title="Edit dataset" description="Edit and review the complete RO-Crate dataset.">
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
            <Badge :variant="section.complete ? 'success' : 'warn'">{{ section.complete ? 'Complete' : 'Incomplete' }}</Badge>
          </button>
        </nav>
      </aside>

      <main class="space-y-8">
        <section id="dataset-basics" class="surface scroll-mt-24 space-y-5 p-6">
          <header>
            <h2 class="font-display text-lg font-semibold text-foreground">Basics</h2>
            <p class="mt-1 text-sm text-muted-foreground">Edit the root dataset fields. Group and path stay fixed for this dataset.</p>
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
            <div>
              <label class="text-xs font-medium text-foreground">License URL <span class="text-destructive">*</span></label>
              <Input v-model="draft.basics.license" type="url" class="mt-1" />
            </div>
            <div class="sm:col-span-2">
              <label class="text-xs font-medium text-foreground">Keywords</label>
              <Input v-model="keywordsText" class="mt-1" />
            </div>
          </div>
          <p v-if="draft.profile" class="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            Profile reference: <span class="font-medium text-foreground">{{ draft.profile.name || draft.profile.iri }}</span>
          </p>
        </section>

        <section id="dataset-context" class="surface scroll-mt-24 space-y-5 p-6">
          <header class="flex items-center justify-between gap-3">
            <div>
              <h2 class="font-display text-lg font-semibold text-foreground">Context</h2>
              <p class="mt-1 text-sm text-muted-foreground">Entities without a recognized root role are retained under Other.</p>
            </div>
            <Button size="sm" @click="editingEntity = null; contextOpen = true"><Plus class="h-3.5 w-3.5" /> Add context</Button>
          </header>
          <ContextEntityList
            :root-name="draft.basics.title"
            :entities="draft.entities"
            @edit="(entity) => { editingEntity = entity; contextOpen = true }"
            @remove="removeContext"
          />
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
            <p class="mt-1 text-sm text-muted-foreground">Validate and save the rebuilt dataset.</p>
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
            action-label="Save changes"
            busy-label="Saving"
            @update:visibility="setVisibility"
            @preview="preview.previewNow(built.rocrate)"
            @create="save"
            @jump="(entityId) => goToSection(entityId === './' ? 'basics' : 'context')"
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
      @save="saveContext"
      @reuse="reuseContext"
    />
  </div>
</template>
