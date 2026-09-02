<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref, shallowRef, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import PageHeader from '@/components/dashboard/PageHeader.vue'
import Button from '@/components/ui/Button.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import CreateGroupDialog from '@/components/groups/CreateGroupDialog.vue'
import ImportCrateDialog from '@/components/metadata/ImportCrateDialog.vue'
import DatasetLocationDialog from '@/components/metadata/editor/DatasetLocationDialog.vue'
import EntityBrowser from '@/components/metadata/editor/EntityBrowser.vue'
import EntityEditor from '@/components/metadata/editor/EntityEditor.vue'
import IssueDrawer from '@/components/metadata/editor/IssueDrawer.vue'
import NodeCheckPanel from '@/components/metadata/editor/NodeCheckPanel.vue'
import PidWithdraw from '@/components/metadata/PidWithdraw.vue'
import { profileReferenceIri, useAruna } from '@/composables/useAruna'
import { useGroupSelection } from '@/composables/useGroupSelection'
import { usePathPrefixes } from '@/composables/usePathPrefixes'
import { usePathTaken } from '@/composables/usePathTaken'
import { useProfilePreview } from '@/composables/useProfilePreview'
import { useDeviceStatus } from '@/composables/useDeviceStatus'
import { provideEditorBridge } from '@/composables/useAssistantEditor'
import { isDesktop } from '@/lib/desktop'
import { previewDeviceDraft, requireDevice } from '@/lib/deviceApi'
import { apiErrorMessage } from '@/lib/api'
import { errorMessage } from '@/lib/utils'
import { slugify } from '@/lib/profiles/emit'
import { isAssignableProfile } from '@/lib/profiles/assignable'
import { loadVocabIndex, type VocabIndex } from '@/lib/profiles/vocabulary'
import { collectIssues, rejectionIssues, type WriteIssue } from '@/lib/crate/issues'
import { joinPath, splitPath } from '@/lib/crate/paths'
import { applyProfile, clearProfile, profileExpectation } from '@/lib/crate/profileSeed'
import {
  entityName,
  findEntity,
  fromRoCrate,
  liveIssues,
  newDraft,
  partIds,
  rootEntity,
  rootId,
  toRoCrate,
  typeLabel,
  type CrateDraft,
  type LiveIssue,
  type ProfileExpectation,
} from '@/lib/crate/editor'
import { FileJson2, FolderTree } from '@lucide/vue'

// The graph carries Vue Flow and dagre; only the Graph tab pays for them.
const EditorGraph = defineAsyncComponent(() => import('@/components/metadata/editor/EditorGraph.vue'))

const route = useRoute()
const router = useRouter()
const {
  groups,
  profiles,
  currentUser,
  createMetadata,
  getMetadataItem,
  fetchRoCrateRaw,
  loadProfileCrate,
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
const locationOpen = ref(false)
const createGroupOpen = ref(false)
const profileId = ref('')
const preferredProfileInitialized = ref(false)
// The picked profile whose rules had not arrived yet, so it can seed once they do.
const pendingSeed = ref('')
const profileRulesLoading = ref(false)
const profileRulesError = ref<string | null>(null)
const submitError = ref<string | null>(null)
const saveIssues = ref<WriteIssue[]>([])
const submitting = ref(false)

onMounted(() => void loadVocabIndex().then((index) => (vocab.value = index)))

const rootName = computed(() => entityName(rootEntity(draft.value)))
const title = computed(() => rootName.value || (mode.value === 'edit' ? 'Edit dataset' : 'New dataset'))
const groupOptions = computed(() => groups.value.map((group) => ({ value: group.id, label: group.name })))
const groupName = computed(() => groups.value.find((group) => group.id === draft.value.groupId)?.name ?? '')
const visibilityText = computed(() =>
  draft.value.visibility === 'public' ? 'Public' : 'Visible to the group')
const selectableProfiles = computed(() =>
  profiles.value.filter((profile) => isAssignableProfile(profile, draft.value.groupId)))
const profileOptions = computed(() =>
  selectableProfiles.value.map((profile) => ({ value: profile.id, label: profile.name })))
const selectedProfile = computed(() => profiles.value.find((candidate) => candidate.id === profileId.value))
const expectation = computed(() => (selectedProfile.value ? profileExpectation(selectedProfile.value) : null))

const groupId = computed({
  get: () => draft.value.groupId ?? '',
  set: (value: string) => {
    draft.value = { ...draft.value, groupId: value }
  },
})
useGroupSelection(groupId)
const prefixes = usePathPrefixes(computed(() => draft.value.groupId))

// A new dataset lands at <folder>/<slug>: the folder follows the group's
// offer and the slug follows the name until the location dialog sets them.
const folder = ref<string | null>(null)
const slug = ref<string | null>(null)
const location = computed(() => (mode.value === 'create'
  ? { prefix: folder.value ?? prefixes.preselected.value, slug: slug.value ?? slugify(rootName.value) }
  : splitPath(draft.value.path ?? '')))
watch(location, ({ prefix, slug: name }) => {
  if (mode.value === 'create') draft.value = { ...draft.value, path: name ? joinPath(prefix, name) : '' }
}, { immediate: true })
watch(() => draft.value.groupId, () => (folder.value = null))

// Only a new dataset can still collide; a stored one owns its path.
const { taken: pathTaken, checking: pathChecking } = usePathTaken(
  computed(() => draft.value.groupId),
  computed(() => (mode.value === 'create' ? draft.value.path ?? '' : '')),
  prefixes.documentPaths,
)
const locationPath = computed(() => joinPath(location.value.prefix, location.value.slug || '…'))

let loadGeneration = 0
async function load() {
  const generation = ++loadGeneration
  const id = documentId.value
  if (mode.value !== 'edit' || !id) {
    draft.value = newDraft({ groupId: draft.value.groupId })
    selected.value = rootId(draft.value)
    profileId.value = ''
    pendingSeed.value = ''
    preferredProfileInitialized.value = false
    folder.value = null
    slug.value = null
    tab.value = 'editor'
    loading.value = false
    loadError.value = null
    submitError.value = null
    saveIssues.value = []
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
    draft.value = {
      ...fromRoCrate(crate, {
        groupId: summary.group_id,
        path: summary.document_path,
        visibility: summary.public ? 'public' : 'group',
      }),
      documentId: summary.document_id,
    }
    selected.value = rootId(draft.value)
    pendingSeed.value = ''
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

function declaredIris(): Set<string> {
  return new Set((rootEntity(draft.value)?.properties.conformsTo ?? []).map((value) => value.value))
}

function declaredProfile(): string {
  const declared = declaredIris()
  return profiles.value.find((profile) => {
    const iri = profileReferenceIri(profile)
    return Boolean(iri && declared.has(iri))
  })?.id ?? ''
}

// The picker follows what the root declares, so an import, a hand-edited
// conformsTo row or a profile list that resolves late cannot leave it stale.
function syncProfileId() {
  const current = profileReferenceIri(selectedProfile.value)
  if (current && declaredIris().has(current)) return
  profileId.value = declaredProfile()
}
watch([profiles, () => rootEntity(draft.value)?.properties.conformsTo], syncProfileId)

const crate = computed(() => toRoCrate(draft.value))
// A taken path blocks the save, so it belongs on the name that derives it, not
// only in the header line.
const issues = computed<LiveIssue[]>(() => {
  const live = liveIssues(draft.value, vocab.value, expectation.value)
  if (!pathTaken.value) return live
  return [...live, {
    key: 'path:taken',
    severity: 'error',
    message: `A dataset already exists at ${locationPath.value}. Change the name or pick another location.`,
    entityId: rootId(draft.value),
    property: 'name',
  }]
})

const desktop = isDesktop()
const deviceStatus = desktop ? useDeviceStatus() : null
const preview = useProfilePreview({
  client: () => ({ baseUrl: apiBaseUrl.value, token: authToken.value ?? undefined }),
  groupId: () => draft.value.groupId,
  ...(desktop
    ? {
        request: (rocrate: unknown, signal: AbortSignal) =>
          previewDeviceDraft(rocrate, requireDevice(deviceStatus?.deviceClient.value, 'draft validation'), signal),
      }
    : {}),
})

// What the node refused, from the last preview and the last write attempt.
const writeIssues = computed(() => [...rejectionIssues(preview.rejection.value), ...saveIssues.value])
const nodeIssues = computed(() => collectIssues(preview.result.value, writeIssues.value, draft.value))
const blockers = computed(() => issues.value.filter((issue) => issue.severity === 'error'))
const violations = computed(() => nodeIssues.value.filter((issue) => issue.severity === 'violation'))

// Nothing invalid is offered to the node: what the editor found, what the node
// last refused and a check still in flight all hold the save back.
const canSave = computed(() => Boolean(draft.value.groupId && draft.value.path)
  && !blockers.value.length && !violations.value.length && !preview.running.value)
const saveBlocked = computed(() => {
  if (canSave.value) return null
  if (!draft.value.groupId || !draft.value.path) return 'Choose a group and a location for this dataset.'
  if (preview.running.value) return 'Waiting for the validation to finish.'
  if (violations.value.length) return 'The node would reject this dataset.'
  const count = blockers.value.length
  return `Fix ${count === 1 ? '1 problem' : `${count} problems`} before saving.`
})

// Every edit and every profile change re-checks the draft with the node, and
// drops what the last refused write said about a draft that no longer exists.
// A draft the editor itself still refuses is not worth the node's time; the
// explicit Validate action runs it anyway.
watch([crate, profileId], () => {
  saveIssues.value = []
  submitError.value = null
  if (!blockers.value.length) preview.preview(crate.value)
})

// What the assistant may do to the open draft while this view is mounted. It
// never saves: the check below is the same one the Save button runs first.
provideEditorBridge({
  draft: () => draft.value,
  update,
  summary: () => ({
    profileId: profileId.value,
    rootName: rootName.value,
    entityCount: draft.value.entities.length,
    partCount: partIds(draft.value).size,
    types: [...new Set(draft.value.entities.flatMap((entity) => entity.types.map(typeLabel)))],
  }),
  profiles: () => selectableProfiles.value.map((profile) => ({ id: profile.id, name: profile.name })),
  applyProfile: pickProfile,
  validate: async () => {
    await preview.verify(crate.value)
    return preview.result.value
  },
})

function update(next: CrateDraft) {
  draft.value = next
  if (!findEntity(next, selected.value)) selected.value = rootId(next)
}

function open(entityId: string) {
  selected.value = entityId
  tab.value = 'editor'
}

function imported(next: CrateDraft) {
  draft.value = { ...next, groupId: draft.value.groupId, path: draft.value.path, visibility: draft.value.visibility }
  selected.value = rootId(draft.value)
  preview.reset()
  syncProfileId()
}

function hasRules(rules: ProfileExpectation | null): boolean {
  return Boolean(rules && (rules.properties.length || rules.types.length || rules.contents.length))
}

function pickProfile(id: string) {
  preferredProfileInitialized.value = true
  // Findings belong to the profile that produced them, so the change drops them.
  preview.reset()
  saveIssues.value = []
  submitError.value = null
  const previousIri = profileReferenceIri(selectedProfile.value)
  profileId.value = id
  const profile = selectedProfile.value
  draft.value = profile
    ? applyProfile(draft.value, profile, profileReferenceIri(profile), previousIri)
    : clearProfile(draft.value, previousIri)
  pendingSeed.value = profile && !hasRules(expectation.value) ? profile.id : ''
}

// A public profile keeps its shapes outside the catalog summary, so its rules
// exist only after its own crate is fetched and lifted.
let rulesGeneration = 0
function loadProfileRules(id: string, force = false) {
  const generation = ++rulesGeneration
  profileRulesError.value = null
  profileRulesLoading.value = true
  void (force ? loadProfileCrate(id, { force: true }) : loadProfileCrate(id))
    .catch(() => {
      if (generation === rulesGeneration) profileRulesError.value = 'The rules of this profile could not be loaded.'
    })
    .finally(() => {
      if (generation === rulesGeneration) profileRulesLoading.value = false
    })
}
function retryProfileRules() {
  const id = selectedProfile.value?.documentId
  if (id) loadProfileRules(id, true)
}
watch(() => selectedProfile.value?.documentId, (id) => {
  if (!id) {
    rulesGeneration += 1
    profileRulesLoading.value = false
    profileRulesError.value = null
    return
  }
  loadProfileRules(id)
}, { immediate: true })

// Seeding runs at the pick, when a public profile still has no rules; the
// first expectation that carries them seeds the form once more.
watch(expectation, (rules) => {
  const profile = selectedProfile.value
  if (!profile || profile.id !== pendingSeed.value || !hasRules(rules)) return
  pendingSeed.value = ''
  const iri = profileReferenceIri(profile)
  draft.value = applyProfile(draft.value, profile, iri, iri)
})

// A profile the newly chosen group may not use cannot stay declared.
watch(() => draft.value.groupId, () => {
  if (profileId.value && !selectableProfiles.value.some((profile) => profile.id === profileId.value)) pickProfile('')
})

watch([mode, currentUser, selectableProfiles], ([currentMode, user, available]) => {
  if (currentMode !== 'create') {
    preferredProfileInitialized.value = false
    return
  }
  if (preferredProfileInitialized.value || !user) return
  const preferred = user.preferredProfileId
  if (!preferred) {
    preferredProfileInitialized.value = true
    return
  }
  if (available.some((profile) => profile.id === preferred)) pickProfile(preferred)
}, { immediate: true })

// A create link may name the profile to start from; a pick already made wins.
watch([() => String(route.query?.profile ?? ''), selectableProfiles], ([wanted, available]) => {
  if (mode.value !== 'create' || !wanted || profileId.value) return
  const match = available.find((profile) => profile.documentId === wanted || profile.id === wanted)
  if (match) pickProfile(match.id)
}, { immediate: true })

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
  saveIssues.value = []
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
    // A refused write states its own findings; only anything else needs a line.
    const refused = rejectionIssues(error)
    saveIssues.value = refused
    submitError.value = refused.length ? null : apiErrorMessage(error)
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div>
    <PageHeader eyebrow="Datasets" :title="title">
      <template #description>
        <span class="inline-flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
          <RouterLink
            v-if="groupName"
            :to="{ name: 'group', params: { id: draft.groupId } }"
            class="font-medium text-foreground hover:underline"
            title="Group"
          >{{ groupName }}</RouterLink>
          <Button
            v-else
            variant="link"
            size="sm"
            class="h-auto p-0 text-sm"
            @click="locationOpen = true"
          >
            Choose a group
          </Button>
          <span>›</span>
          <span class="break-all font-mono text-xs">{{ locationPath }}</span>
          <span>·</span>
          <span>{{ visibilityText }}</span>
          <span v-if="pathTaken" class="text-destructive">already in use</span>
          <Button variant="link" size="sm" class="h-auto p-0 text-sm" @click="locationOpen = true">
            Change
          </Button>
        </span>
      </template>
      <template #actions>
        <Button variant="outline" size="sm" @click="locationOpen = true">
          <FolderTree class="h-3.5 w-3.5" /> Location
        </Button>
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
      <div class="container flex flex-col gap-4 py-6 md:flex-row md:items-start md:gap-5">
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
              :profile-name="selectedProfile?.name"
              :profile-loading="profileRulesLoading"
              :profile-error="profileRulesError"
              :blocked="saveBlocked"
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
              @retry-profile="retryProfileRules"
              @save="save"
              @jump="open"
            />
            <PidWithdraw v-if="mode === 'edit'" :document-id="documentId" />
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

      <IssueDrawer :draft="draft" :issues="issues" :node-issues="nodeIssues" @jump="open" />
    </template>

    <DatasetLocationDialog
      v-model:open="locationOpen"
      :draft="draft"
      :mode="mode"
      :group-options="groupOptions"
      :folder="location.prefix"
      :slug="location.slug"
      :document-paths="prefixes.documentPaths.value"
      :grants="prefixes.grants.value"
      :loading="prefixes.loading.value"
      :taken="pathTaken"
      :checking="pathChecking"
      @update="update"
      @folder="(value) => (folder = value)"
      @slug="(value) => (slug = value || null)"
      @create-group="createGroupOpen = true"
    />
    <ImportCrateDialog v-if="mode === 'create'" v-model:open="importOpen" @imported="imported" />
    <CreateGroupDialog v-model:open="createGroupOpen" @created="(group) => (groupId = group.group_id)" />
  </div>
</template>
