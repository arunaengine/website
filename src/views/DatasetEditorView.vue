<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PageHeader from '@/components/dashboard/PageHeader.vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Textarea from '@/components/ui/Textarea.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import GroupSelect from '@/components/groups/GroupSelect.vue'
import CreateGroupDialog from '@/components/groups/CreateGroupDialog.vue'
import VisibilitySelect from '@/components/metadata/VisibilitySelect.vue'
import ImportCrateDialog from '@/components/metadata/ImportCrateDialog.vue'
import EntityBrowser from '@/components/metadata/editor/EntityBrowser.vue'
import EntityEditor from '@/components/metadata/editor/EntityEditor.vue'
import IssueDrawer from '@/components/metadata/editor/IssueDrawer.vue'
import NodeCheckPanel from '@/components/metadata/editor/NodeCheckPanel.vue'
import { profileReferenceIri, useAruna } from '@/composables/useAruna'
import { useProfilePreview } from '@/composables/useProfilePreview'
import { useDeviceStatus } from '@/composables/useDeviceStatus'
import { isDesktop } from '@/lib/desktop'
import { previewDeviceDraft, requireDevice } from '@/lib/deviceApi'
import { ApiError, profileValidationFindings, type RoCrateStructuralViolation } from '@/lib/api'
import { errorMessage } from '@/lib/utils'
import { slugify } from '@/lib/profiles/emit'
import { loadVocabIndex, type VocabIndex } from '@/lib/profiles/vocabulary'
import type { WriteIssue } from '@/lib/crate/issues'
import { applyProfile, profileExpectation } from '@/lib/crate/profileSeed'
import {
  entityName,
  findEntity,
  fromRoCrate,
  liveIssues,
  newDraft,
  rootEntity,
  rootId,
  ROOT_ID,
  toRoCrate,
  updateValue,
  type CrateDraft,
} from '@/lib/crate/editor'
import { FileJson2, Plus } from '@lucide/vue'

const route = useRoute()
const router = useRouter()
const {
  groups,
  profiles,
  createMetadata,
  getMetadataItem,
  fetchRoCrateRaw,
  replaceMetadataRoCrate,
  saving,
  apiBaseUrl,
  authToken,
} = useAruna()

const mode = computed<'create' | 'edit'>(() => (route.name === 'dataset-edit' ? 'edit' : 'create'))
const documentId = computed(() => String(route.params.id ?? ''))

const draft = ref<CrateDraft>(newDraft())
const vocab = shallowRef<VocabIndex | null>(null)
const selected = ref(ROOT_ID)
const started = ref(false)
const startName = ref('')
const startDescription = ref('')
const loading = ref(false)
const loadError = ref<string | null>(null)
const importOpen = ref(false)
const createGroupOpen = ref(false)
const profileId = ref('')
const submitError = ref<string | null>(null)
const writeIssues = ref<WriteIssue[]>([])

onMounted(() => void loadVocabIndex().then((index) => (vocab.value = index)))

const rootName = computed(() => entityName(rootEntity(draft.value)))
const title = computed(() => rootName.value || (mode.value === 'edit' ? 'Edit dataset' : 'New dataset'))
const groupOptions = computed(() => groups.value.map((group) => ({ value: group.id, label: group.name })))
const groupName = computed(() =>
  groups.value.find((group) => group.id === draft.value.groupId)?.name ?? draft.value.groupId ?? '')
const profileOptions = computed(() =>
  profiles.value.map((profile) => ({ value: profile.id, label: profile.name })))
const expectation = computed(() => {
  const profile = profiles.value.find((candidate) => candidate.id === profileId.value)
  return profile ? profileExpectation(profile) : null
})

watch(groups, (available) => {
  if (mode.value === 'create' && !draft.value.groupId && available.length) draft.value.groupId = available[0].id
}, { immediate: true })

// The path follows the dataset name; nothing else derives it.
watch(rootName, (name) => {
  if (mode.value !== 'create') return
  draft.value.path = name ? `datasets/${slugify(name)}` : ''
})

async function load() {
  if (mode.value !== 'edit' || !documentId.value) return
  loading.value = true
  loadError.value = null
  try {
    const [summary, crate] = await Promise.all([
      getMetadataItem(documentId.value),
      fetchRoCrateRaw(documentId.value),
    ])
    draft.value = fromRoCrate(crate, {
      groupId: summary.group_id,
      path: summary.document_path,
      visibility: summary.public ? 'public' : 'group',
    })
    selected.value = rootId(draft.value)
    profileId.value = declaredProfile()
  } catch (error) {
    loadError.value = errorMessage(error)
  } finally {
    loading.value = false
  }
}
watch(documentId, () => void load(), { immediate: true })

function declaredProfile(): string {
  const declared = new Set((rootEntity(draft.value)?.properties.conformsTo ?? []).map((value) => value.value))
  return profiles.value.find((profile) => {
    const iri = profileReferenceIri(profile)
    return Boolean(iri && declared.has(iri))
  })?.id ?? ''
}

const crate = computed(() => toRoCrate(draft.value))
const issues = computed(() => liveIssues(draft.value, vocab.value, expectation.value))
const editing = computed(() => mode.value === 'edit' || started.value)

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

const canSave = computed(() => Boolean(rootName.value))

function begin() {
  let next = newDraft({ groupId: draft.value.groupId, visibility: draft.value.visibility })
  next = updateValue(next, ROOT_ID, 'name', 0, startName.value.trim())
  next = updateValue(next, ROOT_ID, 'description', 0, startDescription.value.trim())
  draft.value = next
  selected.value = ROOT_ID
  started.value = true
}

function update(next: CrateDraft) {
  draft.value = next
  if (!findEntity(next, selected.value)) selected.value = rootId(next)
}

function pickProfile(id: string) {
  profileId.value = id
  const profile = profiles.value.find((candidate) => candidate.id === id)
  if (profile) draft.value = applyProfile(draft.value, profile, profileReferenceIri(profile))
}

function structuralViolations(error: unknown): RoCrateStructuralViolation[] {
  const violations = error instanceof ApiError ? error.details?.violations : undefined
  return Array.isArray(violations)
    ? violations.filter((value): value is RoCrateStructuralViolation =>
        Boolean(value && typeof value === 'object' && !Array.isArray(value)
          && typeof (value as Record<string, unknown>).message === 'string'))
    : []
}

function discard() {
  void router.push(mode.value === 'edit'
    ? { name: 'dataset', params: { id: documentId.value } }
    : { name: 'datasets' })
}

// The node checks the crate before every write; a rejected verdict stops here
// and the panel shows what it found.
async function save() {
  if (!canSave.value || saving.value) return
  submitError.value = null
  writeIssues.value = []
  if (!(await preview.verify(crate.value))) return
  const isPublic = draft.value.visibility === 'public'
  try {
    if (mode.value === 'edit') {
      await replaceMetadataRoCrate(documentId.value, { rocrate: crate.value, public: isPublic })
      await router.push({ name: 'dataset', params: { id: documentId.value } })
      return
    }
    const result = await createMetadata({
      group_id: draft.value.groupId ?? '',
      path: draft.value.path?.trim() ?? '',
      public: isPublic,
      rocrate: crate.value,
    })
    await router.push({ name: 'dataset', params: { id: result.document_id } })
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
  }
}
</script>

<template>
  <div>
    <PageHeader
      eyebrow="Datasets"
      :title="title"
      description="Describe the dataset and everything it refers to, then check it with the node."
    >
      <template #breadcrumbs>
        <template v-if="editing">
          <Badge v-if="groupName" variant="outline" size="sm">{{ groupName }}</Badge>
          <VisibilitySelect
            compact
            :model-value="draft.visibility"
            :group-id="draft.groupId"
            @update:model-value="(value) => (draft.visibility = value)"
          />
        </template>
      </template>
      <template #actions>
        <Button v-if="mode === 'create'" variant="outline" size="sm" @click="importOpen = true">
          <FileJson2 class="h-3.5 w-3.5" /> Import an RO-Crate
        </Button>
        <Button variant="outline" size="sm" @click="discard">Discard</Button>
      </template>
    </PageHeader>

    <div v-if="loading" class="container space-y-3 py-6">
      <Skeleton class="h-40" />
      <Skeleton class="h-64" />
    </div>
    <div v-else-if="loadError" class="container py-6">
      <ErrorPanel :message="loadError" @retry="load" />
    </div>

    <div v-else-if="!editing" class="container py-10">
      <section class="surface mx-auto max-w-lg space-y-5 p-6">
        <div>
          <h2 class="font-display text-sm font-semibold text-aruna-navy">Start a dataset</h2>
          <p class="mt-1 text-xs text-muted-foreground">
            Three answers and the editor opens. Everything else can follow later.
          </p>
        </div>
        <div>
          <label class="text-xs font-medium text-foreground">Group</label>
          <GroupSelect
            v-model="draft.groupId"
            :options="groupOptions"
            class="mt-1"
            placeholder="Choose a group"
            aria-label="Group"
          >
            <template #action>
              <Button variant="link" size="sm" class="h-auto p-0 text-xs" @click="createGroupOpen = true">
                <Plus class="h-3.5 w-3.5" /> Create a group
              </Button>
            </template>
          </GroupSelect>
        </div>
        <div>
          <label class="text-xs font-medium text-foreground" for="start-name">Name</label>
          <Input
            id="start-name"
            v-model="startName"
            class="mt-1"
            aria-label="Dataset name"
            placeholder="What this dataset is called"
            @keydown.enter="startName.trim() && begin()"
          />
        </div>
        <div>
          <label class="text-xs font-medium text-foreground" for="start-description">Description</label>
          <Textarea
            id="start-description"
            v-model="startDescription"
            rows="3"
            class="mt-1 font-sans"
            aria-label="Dataset description"
            placeholder="What it contains and how it was made"
          />
        </div>
        <div class="flex justify-end">
          <Button :disabled="!startName.trim()" @click="begin">Continue</Button>
        </div>
      </section>
    </div>

    <template v-else>
      <div class="container flex items-start gap-5 py-6">
        <EntityBrowser
          :draft="draft"
          :vocab="vocab"
          :selected="selected"
          :issues="issues"
          :group-id="draft.groupId"
          @select="(id) => (selected = id)"
          @update="update"
        />
        <div class="min-w-0 flex-1 space-y-5">
          <EntityEditor
            :draft="draft"
            :selected="selected"
            :vocab="vocab"
            :issues="issues"
            :profiles="profileOptions"
            :profile-id="profileId"
            @update="update"
            @select="(id) => (selected = id)"
            @profile="pickProfile"
          />
          <NodeCheckPanel
            :draft="draft"
            :rocrate="crate"
            :preview-result="preview.result.value"
            :preview-running="preview.running.value"
            :preview-error="preview.error.value"
            :preview-unavailable="preview.unavailable.value"
            :write-issues="writeIssues"
            :submit-error="submitError"
            :saving="saving"
            :can-save="canSave"
            :action-label="mode === 'edit' ? 'Save changes' : 'Create dataset'"
            :busy-label="mode === 'edit' ? 'Saving' : 'Creating'"
            @preview="preview.previewNow(crate)"
            @save="save"
            @jump="(id) => (selected = id)"
          />
        </div>
      </div>

      <IssueDrawer :draft="draft" :issues="issues" @jump="(id) => (selected = id)" />
    </template>

    <ImportCrateDialog
      v-if="mode === 'create'"
      v-model:open="importOpen"
      @imported="(imported) => {
        draft = { ...imported, groupId: draft.groupId, visibility: draft.visibility }
        selected = rootId(draft)
        started = true
      }"
    />
    <CreateGroupDialog v-model:open="createGroupOpen" @created="(group) => (draft.groupId = group.group_id)" />
  </div>
</template>
