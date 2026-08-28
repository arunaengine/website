<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PageHeader from '@/components/dashboard/PageHeader.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import GroupSelect from '@/components/groups/GroupSelect.vue'
import CreateGroupDialog from '@/components/groups/CreateGroupDialog.vue'
import VisibilitySelect from '@/components/metadata/VisibilitySelect.vue'
import ImportCrateDialog from '@/components/metadata/ImportCrateDialog.vue'
import EntityList from '@/components/metadata/editor/EntityList.vue'
import IssueSummary from '@/components/metadata/editor/IssueSummary.vue'
import NodeCheckPanel from '@/components/metadata/editor/NodeCheckPanel.vue'
import { useAruna } from '@/composables/useAruna'
import { useProfilePreview } from '@/composables/useProfilePreview'
import { useDeviceStatus } from '@/composables/useDeviceStatus'
import { isDesktop } from '@/lib/desktop'
import { previewDeviceDraft, requireDevice } from '@/lib/deviceApi'
import { ApiError, profileValidationFindings, type RoCrateStructuralViolation } from '@/lib/api'
import { errorMessage } from '@/lib/utils'
import { slugify } from '@/lib/profiles/emit'
import { loadVocabIndex, type VocabIndex } from '@/lib/profiles/vocabulary'
import type { WriteIssue } from '@/lib/crate/issues'
import {
  displayName,
  fromRoCrate,
  liveIssues,
  newDraft,
  rootEntity,
  toRoCrate,
  type CrateDraft,
} from '@/lib/crate/editor'
import { FileJson2, Plus } from '@lucide/vue'

const route = useRoute()
const router = useRouter()
const {
  groups,
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
const loading = ref(false)
const loadError = ref<string | null>(null)
const importOpen = ref(false)
const createGroupOpen = ref(false)
const pathTouched = ref(false)
const pathEditing = ref(false)
const checkVisible = ref(false)
const submitError = ref<string | null>(null)
const writeIssues = ref<WriteIssue[]>([])
const list = ref<{ focus: (entityId: string) => void } | null>(null)

onMounted(() => void loadVocabIndex().then((index) => (vocab.value = index)))

const rootName = computed(() => displayName(rootEntity(draft.value)).trim())
const title = computed(() => rootName.value || (mode.value === 'edit' ? 'Edit dataset' : 'New dataset'))
const groupOptions = computed(() => groups.value.map((group) => ({ value: group.id, label: group.name })))

watch(groups, (available) => {
  if (mode.value === 'create' && !draft.value.groupId && available.length) draft.value.groupId = available[0].id
}, { immediate: true })

// The path follows the dataset name until someone edits it themselves.
watch(rootName, (name) => {
  if (mode.value !== 'create' || pathTouched.value) return
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
  } catch (error) {
    loadError.value = errorMessage(error)
  } finally {
    loading.value = false
  }
}
watch(documentId, () => void load(), { immediate: true })

const crate = computed(() => toRoCrate(draft.value))
const issues = computed(() => liveIssues(draft.value, vocab.value))

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
const nodeRejected = computed(() => (preview.result.value ? !preview.result.value.accepted : false))
const canSave = computed(() => Boolean(rootName.value) && !nodeRejected.value)

function checkEntered() {
  checkVisible.value = true
  preview.previewNow(crate.value)
}
watch(crate, (value) => {
  if (checkVisible.value) preview.preview(value)
})

function focusEntity(entityId: string) {
  list.value?.focus(entityId)
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

async function save() {
  if (!canSave.value) return
  submitError.value = null
  writeIssues.value = []
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

    <div v-else class="container space-y-5 py-6">
      <div class="surface grid gap-4 px-5 py-3.5 sm:grid-cols-3">
        <div>
          <label class="text-xs font-medium text-foreground">Group</label>
          <GroupSelect
            v-if="mode === 'create'"
            v-model="draft.groupId"
            :options="groupOptions"
            class="mt-1"
            placeholder="Choose a group"
          >
            <template #action>
              <Button variant="link" size="sm" class="h-auto p-0 text-xs" @click="createGroupOpen = true">
                <Plus class="h-3.5 w-3.5" /> Create a group
              </Button>
            </template>
          </GroupSelect>
          <p v-else class="mt-1 truncate rounded-md border border-border bg-muted/30 px-3 py-2 font-mono text-xs text-muted-foreground">
            {{ draft.groupId }}
          </p>
        </div>
        <div>
          <div class="flex items-center justify-between gap-2">
            <label class="text-xs font-medium text-foreground">Path</label>
            <Button
              v-if="mode === 'create'"
              variant="link"
              size="sm"
              class="h-auto p-0 text-xs"
              @click="pathEditing = !pathEditing"
            >
              {{ pathEditing ? 'Done' : 'Edit' }}
            </Button>
          </div>
          <Input
            v-if="pathEditing"
            :model-value="draft.path"
            aria-label="Dataset path"
            class="mt-1 font-mono text-xs"
            @update:model-value="(value: string | number) => { draft.path = String(value); pathTouched = true }"
          />
          <p v-else class="mt-1 truncate rounded-md border border-border bg-muted/30 px-3 py-2 font-mono text-xs text-muted-foreground">
            {{ draft.path || 'Generated from the name.' }}
          </p>
        </div>
        <VisibilitySelect
          :model-value="draft.visibility"
          :group-id="draft.groupId"
          @update:model-value="(value) => (draft.visibility = value)"
        />
      </div>

      <EntityList ref="list" :draft="draft" :vocab="vocab" @update="(next) => (draft = next)" />

      <IssueSummary :issues="issues" @jump="focusEntity" />

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
        @visible="checkEntered"
        @save="save"
        @jump="focusEntity"
      />
    </div>

    <ImportCrateDialog
      v-if="mode === 'create'"
      v-model:open="importOpen"
      @imported="(imported) => (draft = { ...imported, groupId: draft.groupId, visibility: draft.visibility })"
    />
    <CreateGroupDialog v-model:open="createGroupOpen" @created="(group) => (draft.groupId = group.group_id)" />
  </div>
</template>
