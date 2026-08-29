<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PageHeader from '@/components/dashboard/PageHeader.vue'
import Button from '@/components/ui/Button.vue'
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
  toRoCrate,
  type CrateDraft,
} from '@/lib/crate/editor'
import { FileJson2, Plus } from '@lucide/vue'

// The graph carries Vue Flow and dagre; only the Graph tab pays for them.
const EditorGraph = defineAsyncComponent(() => import('@/components/metadata/editor/EditorGraph.vue'))

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
const selected = ref(rootId(draft.value))
const tab = ref<'editor' | 'graph'>('editor')
const loading = ref(false)
const loadError = ref<string | null>(null)
const importOpen = ref(false)
const createGroupOpen = ref(false)
const profileId = ref('')
const submitError = ref<string | null>(null)
const writeIssues = ref<WriteIssue[]>([])
const submitting = ref(false)

onMounted(() => void loadVocabIndex().then((index) => (vocab.value = index)))

const rootName = computed(() => entityName(rootEntity(draft.value)))
const title = computed(() => rootName.value || (mode.value === 'edit' ? 'Edit dataset' : 'New dataset'))
const groupOptions = computed(() => groups.value.map((group) => ({ value: group.id, label: group.name })))
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

let loadGeneration = 0
async function load() {
  const generation = ++loadGeneration
  const id = documentId.value
  if (mode.value !== 'edit' || !id) {
    draft.value = newDraft({ groupId: groups.value[0]?.id })
    selected.value = rootId(draft.value)
    profileId.value = ''
    tab.value = 'editor'
    loading.value = false
    loadError.value = null
    submitError.value = null
    writeIssues.value = []
    return
  }
  loading.value = true
  loadError.value = null
  try {
    const [summary, crate] = await Promise.all([
      getMetadataItem(id),
      fetchRoCrateRaw(id),
    ])
    if (generation !== loadGeneration || mode.value !== 'edit' || documentId.value !== id) return
    draft.value = fromRoCrate(crate, {
      groupId: summary.group_id,
      path: summary.document_path,
      visibility: summary.public ? 'public' : 'group',
    })
    selected.value = rootId(draft.value)
    profileId.value = declaredProfile()
  } catch (error) {
    if (generation === loadGeneration && mode.value === 'edit' && documentId.value === id) {
      loadError.value = errorMessage(error)
    }
  } finally {
    if (generation === loadGeneration) loading.value = false
  }
}
watch([mode, documentId], () => void load(), { immediate: true })

function declaredProfile(): string {
  const declared = new Set((rootEntity(draft.value)?.properties.conformsTo ?? []).map((value) => value.value))
  return profiles.value.find((profile) => {
    const iri = profileReferenceIri(profile)
    return Boolean(iri && declared.has(iri))
  })?.id ?? ''
}

const crate = computed(() => toRoCrate(draft.value))
const issues = computed(() => liveIssues(draft.value, vocab.value, expectation.value))

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

const canSave = computed(() => Boolean(rootName.value && draft.value.groupId))

function update(next: CrateDraft) {
  draft.value = next
  if (!findEntity(next, selected.value)) selected.value = rootId(next)
}

function open(entityId: string) {
  selected.value = entityId
  tab.value = 'editor'
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

// The node validates the crate before every write; a rejected verdict stops
// here and the panel shows what it found.
async function save() {
  if (!canSave.value || saving.value || submitting.value) return
  submitting.value = true
  submitError.value = null
  writeIssues.value = []
  let verified = false
  try {
    verified = await preview.verify(crate.value)
  } finally {
    if (!verified) submitting.value = false
  }
  if (!verified || !submitting.value) return
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
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div>
    <PageHeader
      eyebrow="Datasets"
      :title="title"
      description="Describe the dataset and everything it refers to, then validate it with the node."
    >
      <template #breadcrumbs>
        <GroupSelect
          v-model="draft.groupId"
          :options="groupOptions"
          class="h-7 w-44 text-xs"
          placeholder="Choose a group"
          aria-label="Group"
        >
          <template #action>
            <Button variant="link" size="sm" class="h-auto p-0 text-xs" @click="createGroupOpen = true">
              <Plus class="h-3.5 w-3.5" /> Create a group
            </Button>
          </template>
        </GroupSelect>
        <VisibilitySelect
          compact
          :model-value="draft.visibility"
          :group-id="draft.groupId"
          @update:model-value="(value) => (draft.visibility = value)"
        />
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
          @graph="tab = 'graph'"
        />
        <div class="min-w-0 flex-1 space-y-5">
          <div class="inline-flex items-center rounded-md border border-border p-0.5" role="tablist">
            <button
              v-for="pane in (['editor', 'graph'] as const)"
              :key="pane"
              type="button"
              role="tab"
              class="rounded-[3px] px-3 py-1 text-xs font-medium"
              :class="tab === pane ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:text-foreground'"
              :aria-selected="tab === pane"
              @click="tab = pane"
            >
              {{ pane === 'editor' ? 'Editor' : 'Graph' }}
            </button>
          </div>

          <template v-if="tab === 'editor'">
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
              :saving="saving || submitting"
              :can-save="canSave"
              :action-label="mode === 'edit' ? 'Save changes' : 'Create dataset'"
              :busy-label="mode === 'edit' ? 'Saving' : 'Creating'"
              @preview="preview.previewNow(crate)"
              @save="save"
              @jump="open"
            />
          </template>
          <EditorGraph
            v-else
            :draft="draft"
            :vocab="vocab"
            :selected="selected"
            @select="(id) => (selected = id)"
            @open="open"
            @update="update"
          />
        </div>
      </div>

      <IssueDrawer :draft="draft" :issues="issues" @jump="open" />
    </template>

    <ImportCrateDialog
      v-if="mode === 'create'"
      v-model:open="importOpen"
      @imported="(imported) => {
        draft = { ...imported, groupId: draft.groupId, visibility: draft.visibility }
        selected = rootId(draft)
      }"
    />
    <CreateGroupDialog v-model:open="createGroupOpen" @created="(group) => (draft.groupId = group.group_id)" />
  </div>
</template>
