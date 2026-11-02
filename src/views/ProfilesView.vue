<script setup lang="ts">
import PageHeader from '@/components/dashboard/PageHeader.vue'
import InfoHint from '@/components/ui/InfoHint.vue'
import OverviewCell from '@/components/dashboard/OverviewCell.vue'
import SectionHeading from '@/components/ui/SectionHeading.vue'
import DropdownMenu from '@/components/ui/DropdownMenu.vue'
import DropdownMenuTrigger from '@/components/ui/DropdownMenuTrigger.vue'
import DropdownMenuContent from '@/components/ui/DropdownMenuContent.vue'
import DropdownMenuItem from '@/components/ui/DropdownMenuItem.vue'
import Button from '@/components/ui/Button.vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogClose from '@/components/ui/DialogClose.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import LiftNotesPanel from '@/components/metadata/profile-builder/LiftNotesPanel.vue'
import ExternalLink from '@/components/ui/ExternalLink.vue'
import { computed, ref, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { profileRulesLoadState, useAruna } from '@/composables/useAruna'
import { Asterisk, ChevronDown, CircleDashed, FileJson2, Lightbulb, ListChecks, Pencil, Plus, Star, Lock, Download, Globe, Tag, Trash2 } from '@lucide/vue'
import { GROUP_PROFILE_HINT, profileScope } from '@/lib/profiles/assignable'
import {
  OBLIGATION_ORDER,
  PROFILE_OBLIGATION_LABELS,
  PROFILE_VALUE_KIND_LABELS,
} from '@/lib/profiles/labels'
import { deriveEntityObligation, entityRulesToMode } from '@/lib/profiles/mode'
import { buildProfileCrate } from '@/lib/profiles/rocrate'
import { isRecord } from '@/lib/profiles/uri'
import { entityTypeLabel } from '@/lib/profiles/entityTypes'
import { cloneLiftNotes } from '@/lib/shacl/lift'
import type { MetadataProfile } from '@/data/types'
import type { ProfilePropertyRule } from '@/lib/profiles/types'
import { errorMessage } from '@/lib/utils'
import Notice from '@/components/ui/Notice.vue'
import Spinner from '@/components/ui/Spinner.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import ListSkeleton from '@/components/ui/ListSkeleton.vue'
import SectionSkeleton from '@/components/ui/SectionSkeleton.vue'
import { useFirstPaint } from '@/composables/useFirstPaint'

const route = useRoute()
const router = useRouter()
const {
  profiles,
  profileItems,
  currentUser,
  userInfo,
  loading,
  bootstrapped,
  updateUserProfile,
  saving,
  loadRoCrate,
  loadProfileCrate,
  profileCrateParses,
  deleteMetadataDocument,
  fullCrates,
  refreshProfiles,
} = useAruna()

// Profiles can appear from other nodes or sessions; entering the tab
// revalidates in the background while the current set stays rendered.
onMounted(() => void refreshProfiles())
const showDelete = ref(false)
const deleteError = ref<string | null>(null)

const visibleProfiles = computed(() => profiles.value)

// A persistent profile link names the document id; the list names profiles by their slug.
const selectedId = computed(() => {
  const asked = route.params.profileId as string
  const byDocument = asked ? visibleProfiles.value.find((profile) => profile.documentId === asked)?.id : undefined
  return byDocument || asked || visibleProfiles.value[0]?.id || ''
})
const selected = computed(() => visibleProfiles.value.find((profile) => profile.id === selectedId.value))
const preferredId = computed(() => currentUser.value?.preferredProfileId ?? '')

function select(id: string) {
  router.push({ name: 'profile', params: { profileId: id } })
}

// Membership in the owning group is the same write heuristic the metadata
// detail view uses; the backend still enforces the actual permission.
const canEditSelected = computed(() => {
  const item = profileItems.value.find((entry) => entry.document_id === selected.value?.documentId)
  return Boolean(item && userInfo.value?.groups.some((group) => group.group_id === item.group_id))
})

function openEdit(profile: MetadataProfile) {
  router.push({ name: 'profile-edit', params: { profileId: profile.id } })
}

function openCreate() {
  router.push({ name: 'profile-new' })
}

// Opens the builder on this profile with the public choice preselected; the
// author still confirms it by saving.
function makePublic(profile: MetadataProfile) {
  router.push({ name: 'profile-edit', params: { profileId: profile.id }, query: { visibility: 'public' } })
}

async function confirmDelete() {
  if (!selected.value?.documentId) return
  deleteError.value = null
  try {
    await deleteMetadataDocument(selected.value.documentId)
    showDelete.value = false
    router.push({ name: 'profiles' })
  } catch (err) {
    deleteError.value = errorMessage(err)
  }
}

async function setPreferred(id: string) {
  await updateUserProfile({ set_attributes: { 'ui.preferred_profile_path': `profiles/${id}` } })
}

// Profile list summaries can omit rule artifacts. Fetch the selected full crate
// once so stored SHACL-only profiles can be lifted and unsupported constraints
// can be presented. Failures stay explicit and Retry starts the same bounded
// materialization load again.
const loadingCrateIds = ref<Record<string, boolean>>({})
const loadedCrateIds = ref<Record<string, boolean>>({})
const profileLoadErrors = ref<Record<string, string>>({})
async function ensureFullProfile(profile: MetadataProfile | undefined, force = false) {
  if (!profile?.documentId) return
  const docId = profile.documentId
  if (loadingCrateIds.value[docId]) return
  if (!force && (profileCrateParses.value[docId] || loadedCrateIds.value[docId])) return
  loadingCrateIds.value = { ...loadingCrateIds.value, [docId]: true }
  const { [docId]: _cleared, ...otherErrors } = profileLoadErrors.value
  profileLoadErrors.value = otherErrors
  try {
    await loadProfileCrate(docId, { force })
    loadedCrateIds.value = { ...loadedCrateIds.value, [docId]: true }
  } catch (err) {
    profileLoadErrors.value = {
      ...profileLoadErrors.value,
      [docId]: errorMessage(err),
    }
  } finally {
    loadingCrateIds.value = { ...loadingCrateIds.value, [docId]: false }
  }
}
watch(selected, (profile) => { void ensureFullProfile(profile) }, { immediate: true })

const selectedProfileParse = computed(() => {
  const docId = selected.value?.documentId
  return docId ? profileCrateParses.value[docId] : undefined
})
const selectedLoadError = computed(() => {
  const docId = selected.value?.documentId
  return docId ? profileLoadErrors.value[docId] : undefined
})
const selectedHasRules = computed(() => Boolean(
  selected.value?.entityRules.length
    || selected.value?.propertyRules.length
    || selected.value?.schema
    || selected.value?.shapesText
    || selected.value?.customShapesText,
))
const selectedRuleState = computed(() => {
  const profile = selected.value
  const docId = profile?.documentId
  return profileRulesLoadState({
    loading: Boolean(docId && loadingCrateIds.value[docId]),
    unavailable: Boolean(selectedLoadError.value),
    complete: Boolean(profile && (!docId || selectedProfileParse.value || loadedCrateIds.value[docId])),
    hasRules: selectedHasRules.value,
  })
})
const selectedLoadingFull = computed(() => selectedRuleState.value === 'loading')
// The list and the selected profile's rules paint together; switching the
// selection waits for its rules once, a later revalidation refreshes in place.
const painted = useFirstPaint(
  () => bootstrapped.value && !loading.value && !selectedLoadingFull.value,
  () => selectedId.value,
)
const additionalRequirements = computed(() => cloneLiftNotes(selectedProfileParse.value?.liftNotes ?? []))

function propertyCount(profile: MetadataProfile): number {
  return profile.entityRules.length
    ? profile.entityRules.reduce((sum, rule) => sum + rule.propertyRules.length, 0)
    : profile.propertyRules.length
}

// All property rules across every entity rule (fallback: the flat root-Dataset rules).
const allPropertyRules = computed<ProfilePropertyRule[]>(() => {
  const profile = selected.value
  if (!profile) return []
  return profile.entityRules.length
    ? profile.entityRules.flatMap((rule) => rule.propertyRules)
    : profile.propertyRules
})
const requiredPropertyCount = computed(() => allPropertyRules.value.filter((rule) => rule.obligation === 'MUST').length)
const recommendedPropertyCount = computed(() => allPropertyRules.value.filter((rule) => rule.obligation === 'SHOULD').length)
const OBLIGATION_ICON = { MUST: Asterisk, SHOULD: Lightbulb, MAY: CircleDashed } as const
// A long description reads as its first line; the whole of it is behind the hint.
const LONG_DESCRIPTION = 120

// Entity-level obligation is derived (not stored): an entity type is required /
// recommended iff a MUST / SHOULD property references it via its entityTypes.
// `via` names the strongest referencing property so the header can explain it.
const entityRulesWithObligation = computed(() => {
  const entities = selected.value?.entityRules ?? []
  return entities.map((rule) => ({ rule, ...deriveEntityObligation(rule.type, entities) }))
})

function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

// Full-fidelity export (D1): the profile's stored crate carries mode + schema
// losslessly. Prefer the already-loaded crate; when it is not loaded yet, fetch it
// on demand (L9) rather than rebuilding with fabricated basics. Only if the fetch
// fails do we rebuild from the record's fields, and then omit datePublished /
// license (buildProfileCrate drops empty ones) instead of inventing them.
const downloadingCrate = ref(false)
async function downloadProfileCrate(profile: MetadataProfile) {
  let crate = profile.documentId ? fullCrates.value[profile.documentId] : undefined
  if (!(isRecord(crate) && Array.isArray(crate['@graph'])) && profile.documentId) {
    downloadingCrate.value = true
    try {
      crate = await loadRoCrate(profile.documentId)
    } catch {
      crate = undefined
    } finally {
      downloadingCrate.value = false
    }
  }
  const finalCrate =
    isRecord(crate) && Array.isArray(crate['@graph'])
      ? crate
      : buildProfileCrate({
          slug: profile.id,
          name: profile.name,
          description: profile.description,
          version: profile.version,
          datePublished: '',
          license: '',
          entityRules: profile.entityRules,
          importedMode: profile.mode ?? undefined,
          // An attached shapes.custom.ttl survives the best-effort rebuild too.
          customShapesText: profile.customShapesText,
        })
  downloadJson(finalCrate, `${profile.id}.crate.json`)
}

// Secondary export: the Describo/Crate-O mode file: form structure only. The
// verbatim imported mode when present, else generated from the entity rules.
function downloadModeFile(profile: MetadataProfile) {
  const mode =
    profile.mode ??
    entityRulesToMode(
      { name: profile.name, description: profile.description, version: profile.version ?? '' },
      profile.entityRules,
    )
  downloadJson(mode, `${profile.id}.mode.json`)
}

// SHACL export: the stored generated shapes (plus attached custom shapes when
// present) as .ttl files, so the profile's constraints are usable in any SHACL
// tool outside the portal.
function downloadShapes(profile: MetadataProfile) {
  const parts = [...new Set(
    [profile.shapesText, profile.customShapesText].filter((text): text is string => Boolean(text?.trim())),
  )]
  if (!parts.length) return
  const blob = new Blob([parts.join('\n\n')], { type: 'text/turtle' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${profile.id}.shapes.ttl`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

function groupByObligation(rules: ProfilePropertyRule[]) {
  return OBLIGATION_ORDER
    .map((obligation) => ({ obligation, rules: rules.filter((rule) => rule.obligation === obligation) }))
    .filter((group) => group.rules.length)
}

// Compact, human-readable constraint chips: only the ones that are actually set.
function constraintSummary(rule: ProfilePropertyRule): string[] {
  const parts: string[] = []
  if (rule.pattern) parts.push(`pattern ${rule.pattern}`)
  if (rule.minLength != null) parts.push(`min length ${rule.minLength}`)
  if (rule.maxLength != null) parts.push(`max length ${rule.maxLength}`)
  if (rule.minValue != null) parts.push(`min ${rule.minValue}`)
  if (rule.maxValue != null) parts.push(`max ${rule.maxValue}`)
  if (rule.stepValue != null) parts.push(`step ${rule.stepValue}`)
  if (rule.multipleValues) parts.push('multiple values')
  return parts
}
</script>

<template>
  <div>
    <PageHeader
      :title="route.name === 'profile' ? (selected?.name ?? selectedId) : 'Profiles'"
      :crumbs="route.name === 'profile' ? [{ label: selected?.name ?? selectedId }] : []"
      :docs="{ topic: 'profiles-conformance', section: 'Profiles define minimum requirements' }"
    >
      <template #actions>
        <Button size="sm" @click="openCreate" :disabled="!currentUser">
          <Plus class="h-4 w-4" /> New profile
        </Button>
      </template>
    </PageHeader>

    <div v-if="!painted" class="w-full px-4 sm:px-6 grid gap-6 py-6 lg:grid-cols-[360px_1fr]">
      <ListSkeleton :rows="5" label="Loading profiles" />
      <div class="space-y-5">
        <SectionSkeleton :header="false" :lines="3" :tiles="3" />
        <SectionSkeleton :lines="4" />
      </div>
    </div>

    <div v-else class="w-full px-4 sm:px-6 grid gap-6 py-6 lg:grid-cols-[360px_1fr]">
      <aside aria-labelledby="profiles-list-heading">
        <SectionHeading id="profiles-list-heading" title="All profiles" :icon="ListChecks" info="Profiles are RO-Crate datasets stored under profiles/.">
          <template #actions>
            <span class="text-sm text-muted-foreground"><b class="font-medium text-foreground">{{ visibleProfiles.length }}</b> visible</span>
          </template>
        </SectionHeading>
        <div class="surface max-h-[80vh] overflow-y-auto scrollbar-thin">
        <ul v-if="visibleProfiles.length" class="divide-y divide-border">
          <li v-for="profile in visibleProfiles" :key="profile.id">
            <button
              type="button"
              class="flex w-full items-start gap-3 border-l-2 px-4 py-3 text-left transition-colors hover:bg-muted/30"
              :class="selectedId === profile.id ? 'border-primary bg-primary/5' : 'border-transparent'"
              @click="select(profile.id)"
            >
              <div class="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-white" :style="{ backgroundColor: profile.iconColor }">
                <ListChecks class="h-4 w-4" />
              </div>
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-1.5">
                  <span class="truncate text-sm font-medium text-foreground">{{ profile.name }}</span>
                  <Star v-if="preferredId === profile.id" class="h-3.5 w-3.5 shrink-0 text-amber-500" fill="currentColor" aria-label="Your default" />
                </div>
                <div class="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                  <span class="inline-flex items-center gap-1"><component :is="profile.managed ? Globe : Lock" class="size-3.5" />{{ profileScope(profile) }}</span>
                  <span><b class="font-medium text-foreground">{{ propertyCount(profile) }}</b> properties</span>
                </div>
                <p v-if="profile.description" class="mt-1 line-clamp-2 text-xs text-muted-foreground/90">{{ profile.description }}</p>
              </div>
            </button>
          </li>
        </ul>
        <div v-else class="p-8 text-center text-xs text-muted-foreground">
          No visible profiles under <code>profiles/</code>.
        </div>
        </div>
      </aside>

      <section v-if="selected" class="space-y-5">
        <div class="surface p-6">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="flex min-w-0 items-start gap-3">
              <div class="grid h-12 w-12 shrink-0 place-items-center rounded-xl text-white" :style="{ backgroundColor: selected.iconColor }">
                <ListChecks class="h-6 w-6" />
              </div>
              <div class="min-w-0">
                <h2 class="type-section-title">{{ selected.name }}</h2>
                <div class="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <span class="inline-flex items-center gap-1.5"><FileJson2 class="size-4" />{{ selected.domain }}</span>
                  <span class="inline-flex items-center gap-1.5"><component :is="selected.managed ? Globe : Lock" class="size-4" />{{ profileScope(selected) }}</span>
                </div>
                <p v-if="selected.description" class="mt-2 max-w-3xl text-sm text-muted-foreground">{{ selected.description }}</p>
                <p v-if="!selected.managed && !selected.builtIn" class="mt-1 max-w-3xl text-xs text-muted-foreground">
                  {{ GROUP_PROFILE_HINT }}
                </p>
              </div>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <Button
                v-if="canEditSelected"
                variant="outline"
                size="sm"
                :disabled="selectedLoadingFull"
                title="Edit this profile's rules and details in the builder"
                @click="openEdit(selected)"
              >
                <Pencil class="h-3.5 w-3.5" /> Edit
              </Button>
              <Button
                v-if="canEditSelected && !selected.managed && !selected.builtIn"
                variant="outline"
                size="sm"
                @click="makePublic(selected)"
              >
                <Globe class="h-3.5 w-3.5" /> Make public
              </Button>
              <Button
                v-if="canEditSelected"
                variant="outline"
                size="sm"
                class="text-destructive hover:text-destructive"
                @click="deleteError = null; showDelete = true"
              >
                <Trash2 class="h-3.5 w-3.5" /> Delete
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger as-child>
                  <Button variant="outline" size="sm"><Download class="h-3.5 w-3.5" /> Download <ChevronDown class="h-3.5 w-3.5" /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" class="w-64">
                  <DropdownMenuItem :disabled="downloadingCrate" @click="downloadProfileCrate(selected)">
                    <Download class="h-3.5 w-3.5" /> {{ downloadingCrate ? 'Preparing…' : 'Profile RO-Crate' }}
                  </DropdownMenuItem>
                  <DropdownMenuItem @click="downloadModeFile(selected)"><Download class="h-3.5 w-3.5" /> Mode file (Describo/Crate-O)</DropdownMenuItem>
                  <DropdownMenuItem v-if="selected.shapesText || selected.customShapesText" @click="downloadShapes(selected)">
                    <Download class="h-3.5 w-3.5" /> SHACL shapes
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button v-if="currentUser && preferredId !== selected.id" variant="outline" size="sm" :disabled="saving" @click="setPreferred(selected.id)">
                <Star class="h-3.5 w-3.5" /> Set as my default
              </Button>
              <span v-else-if="preferredId === selected.id" class="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                <Star class="h-3.5 w-3.5 text-amber-500" fill="currentColor" /> Your default
              </span>
            </div>
          </div>

        </div>

        <div class="grid grid-cols-2 gap-3 sm:gap-4" :class="selected.usedCount !== undefined ? 'xl:grid-cols-3' : ''">
          <OverviewCell label="Required properties" :icon="ListChecks" info="Properties this profile leaves out stay allowed unless a closed SHACL rule says otherwise.">
            <template #value>{{ requiredPropertyCount }}</template>
            <template #unit>of {{ allPropertyRules.length }}</template>
            <span><Lightbulb /><b>{{ recommendedPropertyCount }}</b> recommended</span>
            <span><CircleDashed /><b>{{ allPropertyRules.length - requiredPropertyCount - recommendedPropertyCount }}</b> optional</span>
          </OverviewCell>
          <!-- "Used by" needs a server-side count: the catalog is paged, so it
               cannot be counted client-side. Hidden until one is served. -->
          <OverviewCell v-if="selected.usedCount !== undefined" label="Used by" :icon="FileJson2" tone="sky">
            <template #value>{{ selected.usedCount }}</template>
            <template #unit>datasets</template>
          </OverviewCell>
          <OverviewCell label="Suggested keywords" :icon="Tag" tone="aqua">
            <template #value>{{ selected.suggestedKeywords.length }}</template>
            <span v-for="keyword in selected.suggestedKeywords.slice(0, 6)" :key="keyword">#{{ keyword }}</span>
          </OverviewCell>
        </div>

        <Spinner v-if="selectedLoadingFull" label="Preparing profile rules…" show-label class="px-1" />

        <Notice
          v-else-if="selectedRuleState === 'unavailable'"
          tone="error"
          title="Profile rules are unavailable."
          class="px-5 py-4"
        >
          <p class="mt-1">{{ selectedLoadError }}</p>
          <p class="mt-1">The profile may still be materializing. Retry runs the same bounded preparation check again.</p>
          <Button variant="outline" size="sm" class="mt-3" @click="ensureFullProfile(selected, true)">Retry</Button>
        </Notice>

        <section v-if="selectedRuleState === 'ready' && additionalRequirements.length" class="surface space-y-2 p-5">
          <div>
            <h3 class="text-sm font-semibold text-foreground">Additional requirements</h3>
            <p class="mt-0.5 text-xs text-muted-foreground">Read-only SHACL requirements retained for authoritative validation.</p>
          </div>
          <LiftNotesPanel :notes="additionalRequirements" attached />
        </section>

        <!-- Grouped entity-rule sections: what entities this profile expects and how they must be described. -->
        <template v-if="selectedRuleState !== 'unavailable' && selected.entityRules.length">
          <div v-for="entry in entityRulesWithObligation" :key="entry.rule.id" class="surface overflow-hidden">
            <header class="border-b border-border px-5 py-4">
              <div class="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-foreground">
                <component :is="OBLIGATION_ICON[entry.obligation]" class="size-4 text-muted-foreground" aria-hidden="true" />
                <b class="font-semibold text-aruna-navy">{{ entityTypeLabel(entry.rule.type) }}</b>
                <span v-if="entry.rule.label && entry.rule.label.toLowerCase() !== entityTypeLabel(entry.rule.type).toLowerCase()" class="text-muted-foreground">- {{ entry.rule.label }}</span>
                <!-- Derived obligation is explained by the property that references this type. -->
                <span v-if="entry.via" class="text-[11px] text-muted-foreground">via <code class="hash rounded bg-muted px-1 py-0.5 text-foreground/70">{{ entry.via.valueName }}</code></span>
              </div>
              <p class="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                {{ PROFILE_OBLIGATION_LABELS[entry.obligation].label }} entity<template v-if="entry.rule.description">, {{ entry.rule.description }}</template>
              </p>
            </header>

            <div v-if="entry.rule.propertyRules.length">
              <div v-for="group in groupByObligation(entry.rule.propertyRules)" :key="group.obligation">
                <h4 class="flex items-center gap-2 px-5 pb-1 pt-4 text-sm font-semibold text-foreground">
                  <component :is="OBLIGATION_ICON[group.obligation]" class="size-4 text-muted-foreground" aria-hidden="true" />
                  {{ PROFILE_OBLIGATION_LABELS[group.obligation].label }}
                  <span class="font-normal tabular-nums text-muted-foreground">{{ group.rules.length }}</span>
                  <InfoHint :label="PROFILE_OBLIGATION_LABELS[group.obligation].help" :name="`About ${PROFILE_OBLIGATION_LABELS[group.obligation].label}`" />
                </h4>
                <ul class="divide-y divide-border/60">
                  <li v-for="rule in group.rules" :key="rule.id" class="px-5 py-3">
                    <div class="flex flex-wrap items-center gap-2">
                      <span class="text-sm font-medium text-foreground">{{ rule.label }}</span>
                      <code class="hash rounded bg-muted px-1.5 py-0.5 text-foreground/70">{{ rule.valueName }}</code>
                      <span class="text-xs text-muted-foreground">{{ PROFILE_VALUE_KIND_LABELS[rule.kind] }}</span>
                      <!-- Absolute property term URI (mode input `id`), truncated; an
                           http(s) term IRI is a link to its vocabulary definition. -->
                      <ExternalLink
                        v-if="rule.propertyUri"
                        :href="rule.propertyUri"
                        :show-icon="false"
                        class="inline-block max-w-[240px] truncate align-middle font-mono text-[10px] text-muted-foreground/70 hover:text-primary"
                        :title="rule.propertyUri"
                      />
                    </div>
                    <p v-if="rule.description" class="mt-0.5 flex min-w-0 items-center gap-1.5 text-[12px] text-muted-foreground">
                      <span :class="rule.description.length > LONG_DESCRIPTION ? 'truncate' : ''">{{ rule.description }}</span>
                      <InfoHint v-if="rule.description.length > LONG_DESCRIPTION" :label="rule.description" :name="`About ${rule.label}`" />
                    </p>
                    <!-- What else the profile says of the value, as one plain line. -->
                    <p
                      v-if="(rule.kind === 'entity' && rule.entityTypes?.length) || rule.example || rule.enumOptions?.length || constraintSummary(rule).length"
                      class="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-muted-foreground"
                    >
                      <span v-if="rule.kind === 'entity' && rule.entityTypes?.length">References {{ rule.entityTypes.map(entityTypeLabel).join(', ') }}</span>
                      <span v-if="rule.example" class="font-mono">e.g. {{ rule.example }}</span>
                      <span v-if="rule.enumOptions?.length">One of {{ rule.enumOptions.join(', ') }}</span>
                      <span v-if="constraintSummary(rule).length">{{ constraintSummary(rule).join(', ').replace(/^./, (first) => first.toUpperCase()) }}</span>
                    </p>
                  </li>
                </ul>
              </div>
            </div>
            <EmptyState v-else compact title="No property rules defined for this entity type." />
          </div>
        </template>

        <EmptyState
          v-else-if="selectedRuleState === 'ready' && (selected.shapesText || selected.customShapesText)"
          title="No editable controls could be generated."
          description="The retained SHACL requirements still apply during validation."
        />
        <EmptyState v-else-if="selectedRuleState === 'empty'" title="No rules are defined for this profile." />
      </section>

      <EmptyState v-else title="Select a visible profile." />
    </div>

    <Dialog :open="showDelete" @update:open="(value: boolean) => (showDelete = value)">
      <DialogContent class="max-w-md">
        <DialogHeader>
          <DialogTitle>Delete metadata profile</DialogTitle>
          <DialogDescription>
            Deletes <span class="font-medium text-foreground">{{ selected?.name }}</span> and its graph from the catalog. Published S3 artifacts are not touched.
          </DialogDescription>
        </DialogHeader>
        <Notice v-if="deleteError" tone="error">{{ deleteError }}</Notice>
        <DialogFooter>
          <DialogClose as-child><Button variant="outline">Cancel</Button></DialogClose>
          <Button variant="destructive" :disabled="saving" @click="confirmDelete">{{ saving ? 'Deleting…' : 'Delete' }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

  </div>
</template>
