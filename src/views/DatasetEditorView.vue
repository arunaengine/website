<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, RouterLink, useRoute, useRouter, type RouteLocationRaw } from 'vue-router'
import AskAiButton from '@/components/assistant/AskAiButton.vue'
import PageHeader from '@/components/dashboard/PageHeader.vue'
import Button from '@/components/ui/Button.vue'
import Notice from '@/components/ui/Notice.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import DiscardDraftConfirm from '@/components/ui/DiscardDraftConfirm.vue'
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
import { getGroup } from '@/composables/aruna/groups'
import { grantPublicRead } from '@/composables/usePublicRead'
import { isGroupAdmin } from '@/lib/groupAdmin'
import { useDeviceStatus } from '@/composables/useDeviceStatus'
import { provideEditorBridge } from '@/composables/useAssistantEditor'
import { isDesktop } from '@/lib/desktop'
import { previewDeviceDraft, requireDevice } from '@/lib/deviceApi'
import { apiErrorMessage, type RestrictedFile } from '@/lib/api'
import { errorMessage } from '@/lib/utils'
import { slugify } from '@/lib/profiles/emit'
import { isAssignableProfile } from '@/lib/profiles/assignable'
import { loadVocabIndex, type VocabIndex } from '@/lib/profiles/vocabulary'
import { collectIssues, rejectionIssues, type WriteIssue } from '@/lib/crate/issues'
import { joinPath, splitPath } from '@/lib/crate/paths'
import { applyProfile, clearProfile, profileExpectation, seedNewEntities, unseedProfile } from '@/lib/crate/profileSeed'
import {
  alignValueKinds,
  entityName,
  findEntity,
  fromRoCrate,
  isDataType,
  liveIssues,
  newDraft,
  partIds,
  profileShape,
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
const CrateGraph = defineAsyncComponent(() => import('@/components/metadata/CrateGraph.vue'))

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

// Unsaved work: the baseline is the draft as the page settled it, so a form
// nobody edited leaves without a question.
function snapshot(): string {
  return JSON.stringify(draft.value)
}
const baseline = ref(snapshot())
const dirty = computed(() => baseline.value !== snapshot())
function markSettled() {
  baseline.value = snapshot()
}
// A change the page makes itself moves the baseline; a draft the user already
// changed keeps its unsaved work.
function keepSettled(change: () => void, own = true) {
  const clean = !dirty.value
  change()
  if (own && clean) markSettled()
}

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
// The contextual types the profile describes, offered first when adding an entity.
const profileTypes = computed(() => (selectedProfile.value?.entityRules ?? [])
  .filter((rule) => !isDataType(rule.type))
  .map((rule) => ({ type: rule.type, label: rule.label, description: rule.description })))

const groupId = computed({
  get: () => draft.value.groupId ?? '',
  set: (value: string) => {
    // The first group the portal offers is the page's own; a switch is the user's.
    keepSettled(() => {
      draft.value = { ...draft.value, groupId: value }
    }, !draft.value.groupId)
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
  if (mode.value !== 'create') return
  // The offered folder and the slug the name derives are the page's own; a
  // location the user picked is unsaved work.
  keepSettled(() => {
    draft.value = { ...draft.value, path: name ? joinPath(prefix, name) : '' }
  }, folder.value === null && slug.value === null)
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
    markSettled()
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
    draft.value = alignValueKinds(draft.value, vocab.value, expectation.value)
    markSettled()
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
  isPublic: () => draft.value.visibility === 'public',
  ...(desktop
    ? {
        request: (rocrate: unknown, signal: AbortSignal) =>
          previewDeviceDraft(rocrate, requireDevice(deviceStatus?.deviceClient.value, 'draft validation'), signal, draft.value.groupId, draft.value.visibility === 'public'),
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
  // The last verdict spoke about another draft; it must not stand in for one
  // the node has not seen.
  else preview.reset()
})

// A crate may carry a number as text or the other way round; the rules that
// apply, and the vocabulary once loaded, decide which the node should see.
watch([expectation, vocab], ([rules, index]) => {
  keepSettled(() => {
    const aligned = alignValueKinds(draft.value, index, rules)
    if (aligned !== draft.value) draft.value = aligned
  })
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
  rules: (entityId, types) => {
    const entity = findEntity(draft.value, entityId) ?? { id: entityId, types: types ?? [], properties: {} }
    const shape = profileShape(draft.value, entity, expectation.value)
    return shape ? [...shape.required, ...shape.recommended, ...shape.optional] : []
  },
  applyProfile: pickProfile,
  validate: async () => {
    await preview.verify(crate.value)
    return preview.result.value
  },
})

// An entity created while a profile is picked starts with the rows its shape asks for.
function update(next: CrateDraft) {
  const profile = selectedProfile.value
  draft.value = profile ? seedNewEntities(draft.value, next, profile) : next
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
  draft.value = alignValueKinds(draft.value, vocab.value, expectation.value)
}

function hasRules(rules: ProfileExpectation | null): boolean {
  if (!rules) return false
  const shapes = [rules.root, ...Object.values(rules.shapes)]
  return shapes.some((shape) => shape.required.length || shape.recommended.length || shape.optional.length)
    || Boolean(rules.types.length || rules.contents.length)
}

function pickProfile(id: string) {
  preferredProfileInitialized.value = true
  // Findings belong to the profile that produced them, so the change drops them.
  preview.reset()
  saveIssues.value = []
  submitError.value = null
  const previous = selectedProfile.value
  const previousIri = profileReferenceIri(previous)
  profileId.value = id
  const profile = selectedProfile.value
  // The rows the left profile seeded and nobody filled leave with it.
  const kept = previous && previous.id !== id ? unseedProfile(draft.value, previous) : draft.value
  draft.value = profile
    ? applyProfile(kept, profile, profileReferenceIri(profile), previousIri)
    : clearProfile(kept, previousIri)
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
  keepSettled(() => {
    draft.value = applyProfile(draft.value, profile, iri, iri)
  })
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
  if (available.some((profile) => profile.id === preferred)) keepSettled(() => pickProfile(preferred))
}, { immediate: true })

// A create link may name the profile to start from; a pick already made wins.
watch([() => String(route.query?.profile ?? ''), selectableProfiles], ([wanted, available]) => {
  if (mode.value !== 'create' || !wanted || profileId.value) return
  const match = available.find((profile) => profile.documentId === wanted || profile.id === wanted)
  if (match) keepSettled(() => pickProfile(match.id))
}, { immediate: true })

// Leaving the editor or switching to another dataset (Discard, a nav click,
// the browser back button) with unsaved work asks first; the view's own
// navigation after a save or a confirmed discard leaves silently.
const confirmDiscardOpen = ref(false)
const allowLeave = ref(false)
let leave: ((allowed: boolean) => void) | null = null

function askBeforeLeaving(): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    if (allowLeave.value || !dirty.value) {
      resolve(true)
      return
    }
    leave = resolve
    confirmDiscardOpen.value = true
  })
}

onBeforeRouteLeave(askBeforeLeaving)
onBeforeRouteUpdate(askBeforeLeaving)

// A push that was aborted or failed keeps the draft here, so the guard must
// ask again the next time instead of staying open.
async function leaveTo(target: RouteLocationRaw): Promise<void> {
  allowLeave.value = true
  try {
    if (await router.push(target)) allowLeave.value = false
  } catch {
    allowLeave.value = false
  }
}

// The chat belongs to this draft alone, so reopening the editor for another
// dataset never resumes the conversation about the one before it.
const assistantSubject = computed(() => `the dataset draft ${documentId.value || 'new'}`)

function leaveEditor() {
  void leaveTo(mode.value === 'edit'
    ? { name: 'dataset', params: { id: documentId.value } }
    : { name: 'datasets' })
}

function discard() {
  if (dirty.value) confirmDiscardOpen.value = true
  else leaveEditor()
}

function keepDraft() {
  confirmDiscardOpen.value = false
  leave?.(false)
  leave = null
}

function discardDraft() {
  confirmDiscardOpen.value = false
  if (!leave) {
    leaveEditor()
    return
  }
  leave(true)
  leave = null
}

// A reload or a closed tab would drop the draft just as silently.
function warnUnload(event: BeforeUnloadEvent) {
  if (dirty.value) event.preventDefault()
}
onMounted(() => {
  if (typeof window !== 'undefined') window.addEventListener('beforeunload', warnUnload)
})
onUnmounted(() => {
  if (typeof window !== 'undefined') window.removeEventListener('beforeunload', warnUnload)
})

// Files a public dataset would list without everyone being able to read them.
const restrictedFiles = ref<RestrictedFile[]>([])
const publicUnchecked = ref(false)
const canGrantPublic = ref(false)
const grantBusy = ref(false)
const grantError = ref<string | null>(null)
const grantUnresolved = ref<RestrictedFile[]>([])
const owningGroups = computed(() => [...new Set(restrictedFiles.value.flatMap((file) => file.group_id ? [file.group_id] : []))])
let publicationGeneration = 0
watch([crate, () => draft.value.visibility, () => draft.value.groupId, () => draft.value.path, apiBaseUrl, authToken], () => {
  publicationGeneration += 1
  restrictedFiles.value = []
  publicUnchecked.value = false
  grantUnresolved.value = []
  canGrantPublic.value = false
  grantError.value = null
})

function fileLabel(file: RestrictedFile): string {
  return file.bucket && file.key ? `${file.bucket}/${file.key}` : file.entity_id
}

// Only a group administrator may add the public role; anyone else is pointed
// at the group's roles.
async function checkGrantAccess() {
  const userId = currentUser.value?.id
  const generation = publicationGeneration
  const groupIds = owningGroups.value
  canGrantPublic.value = false
  if (!userId) return
  const allowed = await Promise.all(groupIds.map(async (groupId) => {
    try { return isGroupAdmin(await getGroup(groupId), userId) } catch { return false }
  }))
  if (generation === publicationGeneration && userId === currentUser.value?.id) canGrantPublic.value = allowed.some(Boolean)
}

async function makePublic() {
  const userId = currentUser.value?.id
  const generation = publicationGeneration
  if (!userId || grantBusy.value) return
  grantBusy.value = true
  grantError.value = null
  try {
    if (!await preview.verify(crate.value) || generation !== publicationGeneration) return
    if (!preview.result.value) {
      grantError.value = 'File access could not be checked. Try again before granting access.'
      return
    }
    const result = await grantPublicRead(`Public read: ${locationPath.value}`, preview.result.value.restricted_files ?? [], userId)
    if (generation !== publicationGeneration) return
    grantUnresolved.value = result.unresolved
    restrictedFiles.value = result.unresolved
    if (result.failed) grantError.value = 'Some access changes could not be completed. Check the remaining groups’ roles.'
    if (!result.unresolved.length) await save()
  } catch (error) {
    if (generation === publicationGeneration) grantError.value = errorMessage(error)
  } finally {
    grantBusy.value = false
  }
}

// The node validates the crate before every write; a rejected verdict stops
// here and the panel shows what it found. A public draft with files not
// everyone can read pauses for a choice unless it is saved anyway.
async function save(anyway = false) {
  if (!canSave.value || saving.value || submitting.value) return
  const generation = publicationGeneration
  const source = crate.value
  const targetId = documentId.value
  const sourceMode = mode.value
  const isPublic = draft.value.visibility === 'public'
  const groupId = draft.value.groupId ?? ''
  const path = draft.value.path?.trim() ?? ''
  submitting.value = true
  submitError.value = null
  saveIssues.value = []
  let verified = false
  try {
    verified = await preview.verify(source)
  } finally {
    if (!verified) submitting.value = false
  }
  if (generation !== publicationGeneration || source !== crate.value || sourceMode !== mode.value || targetId !== documentId.value
    || groupId !== (draft.value.groupId ?? '') || path !== (draft.value.path?.trim() ?? '')) {
    submitting.value = false
    return
  }
  if (!verified || !submitting.value) return
  const restricted = isPublic ? preview.result.value?.restricted_files ?? [] : []
  const unchecked = isPublic && preview.result.value?.restricted_files_complete !== true
  if ((restricted.length || unchecked) && !anyway) {
    restrictedFiles.value = restricted
    publicUnchecked.value = unchecked
    grantUnresolved.value = []
    grantError.value = null
    submitting.value = false
    void checkGrantAccess()
    return
  }
  restrictedFiles.value = []
  publicUnchecked.value = false
  try {
    if (sourceMode === 'edit') {
      await replaceMetadataRoCrate(targetId, { rocrate: source, public: isPublic })
      await leaveTo({ name: 'dataset', params: { id: targetId } })
      return
    }
    const result = await createMetadata({
      group_id: groupId,
      path,
      public: isPublic,
      rocrate: source,
    })
    await leaveTo({ name: 'dataset', params: { id: result.document_id } })
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
  <div class="relative">
    <PageHeader eyebrow="Datasets" :title="title" :docs="{ topic: 'first-dataset', section: 'Describe the dataset' }">
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
        <AskAiButton size="sm" prompt="Help me describe this dataset." :subject="assistantSubject" />
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
          :profile-types="profileTypes"
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
              :profile-rules="expectation"
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
              @save="save()"
              @jump="open"
            >
              <Notice v-if="restrictedFiles.length || publicUnchecked" tone="warning" :title="restrictedFiles.length ? 'Not everyone can read these files' : 'Some file access could not be checked'">
                <p v-if="restrictedFiles.length">The dataset is public, but these files are not publicly readable. Readers will see them listed and cannot download them.</p>
                <p v-if="publicUnchecked">Some files could not be checked. Retry the check, or save anyway knowing that readers may not be able to download all files.</p>
                <ul class="mt-1 list-disc space-y-0.5 pl-4 font-mono text-[11px]">
                  <li v-for="file in restrictedFiles" :key="file.entity_id" class="break-all">{{ fileLabel(file) }}</li>
                </ul>
                <p v-if="grantUnresolved.length" class="mt-1">
                  Access could not be granted for these files. An administrator of each owning group can change their roles.
                </p>
                <p v-else-if="!canGrantPublic" class="mt-1">
                  A group administrator can add a public role with read access to these files under the group's roles.
                </p>
                <p v-if="grantError" class="mt-1 text-destructive">{{ grantError }}</p>
                <span class="mt-2 flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" :disabled="grantBusy" @click="restrictedFiles = []; publicUnchecked = false">Back</Button>
                  <Button
                    v-if="canGrantPublic && !grantUnresolved.length"
                    variant="outline"
                    size="sm"
                    :disabled="grantBusy"
                    @click="makePublic"
                  >
                    {{ grantBusy ? 'Granting access' : 'Make the data public' }}
                  </Button>
                  <Button v-for="groupId in !canGrantPublic || grantUnresolved.length ? owningGroups : []" :key="groupId" variant="outline" size="sm" as-child>
                    <RouterLink :to="{ name: 'group', params: { id: groupId }, query: { tab: 'roles' } }">{{ groups.find((group) => group.id === groupId)?.name ?? 'Owning group' }} roles</RouterLink>
                  </Button>
                  <Button size="sm" :disabled="grantBusy" @click="save(true)">Save anyway</Button>
                </span>
              </Notice>
            </NodeCheckPanel>
            <PidWithdraw v-if="mode === 'edit'" :document-id="documentId" />
          </template>
          <CrateGraph
            v-else
            :source="draft"
            mode="edit"
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
    <DiscardDraftConfirm :open="confirmDiscardOpen" @keep="keepDraft" @discard="discardDraft" />
  </div>
</template>
