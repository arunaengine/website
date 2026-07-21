<script setup lang="ts">
import PageHeader from '@/components/dashboard/PageHeader.vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogClose from '@/components/ui/DialogClose.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import NewProfileDialog from '@/components/metadata/NewProfileDialog.vue'
import ExternalLink from '@/components/ui/ExternalLink.vue'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAruna } from '@/composables/useAruna'
import { ListChecks, Pencil, Plus, Star, Lock, Download, Trash2 } from '@lucide/vue'
import {
  OBLIGATION_ACCENT,
  OBLIGATION_ORDER,
  PROFILE_OBLIGATION_LABELS,
  PROFILE_VALUE_KIND_LABELS,
  obligationBadgeVariant,
} from '@/lib/profiles/labels'
import { deriveEntityObligation, entityRulesToMode } from '@/lib/profiles/mode'
import { buildProfileCrate } from '@/lib/profiles/rocrate'
import { isRecord } from '@/lib/profiles/uri'
import { entityTypeLabel } from '@/lib/profiles/entityTypes'
import type { MetadataProfile } from '@/data/types'
import type { ProfilePropertyRule } from '@/lib/profiles/types'

const route = useRoute()
const router = useRouter()
const { profiles, profileItems, currentUser, userInfo, updateUserProfile, saving, loadRoCrate, deleteMetadataDocument, fullCrates } = useAruna()
const showNewProfile = ref(false)
// Set while the dialog edits an existing profile; null keeps it in create mode.
const editingProfile = ref<MetadataProfile | null>(null)
const showDelete = ref(false)
const deleteError = ref<string | null>(null)

const selectedId = computed(() => (route.params.profileId as string) || profiles.value[0]?.id || '')
const selected = computed(() => profiles.value.find((profile) => profile.id === selectedId.value))
const preferredId = computed(() => currentUser.value?.preferredProfileId ?? '')

function select(id: string) {
  router.push({ name: 'profile-detail', params: { profileId: id } })
}

// Membership in the owning group is the same write heuristic the metadata
// detail view uses; the backend still enforces the actual permission.
const canEditSelected = computed(() => {
  const item = profileItems.value.find((entry) => entry.document_id === selected.value?.documentId)
  return Boolean(item && userInfo.value?.groups.some((group) => group.group_id === item.group_id))
})

function openEdit(profile: MetadataProfile) {
  editingProfile.value = profile
  showNewProfile.value = true
}

function openCreate() {
  editingProfile.value = null
  showNewProfile.value = true
}

async function confirmDelete() {
  if (!selected.value?.documentId) return
  deleteError.value = null
  try {
    await deleteMetadataDocument(selected.value.documentId)
    showDelete.value = false
    router.push({ name: 'profiles' })
  } catch (err) {
    deleteError.value = err instanceof Error ? err.message : String(err)
  }
}

async function setPreferred(id: string) {
  await updateUserProfile({ set_attributes: { 'ui.preferred_profile_path': `profiles/${id}` } })
}

// Profile list summaries can omit the structured rule entities. When the selected
// profile lacks entity rules but has a backing document, fetch the full crate once
// so the reactive `profiles` computed re-maps with the parsed rules. Guarded by a
// per-document loading flag so we neither double-fetch nor spin forever on errors.
const loadingCrateIds = ref<Record<string, boolean>>({})
async function ensureFullProfile(profile: MetadataProfile | undefined) {
  if (!profile?.documentId) return
  const docId = profile.documentId
  if (profile.entityRules.length || loadingCrateIds.value[docId]) return
  loadingCrateIds.value = { ...loadingCrateIds.value, [docId]: true }
  try {
    await loadRoCrate(docId)
  } catch {
    // Includes CrateNotReadyError (transient, just materializing). Stay quiet and
    // keep showing the summary view; a later re-selection can retry.
  } finally {
    loadingCrateIds.value = { ...loadingCrateIds.value, [docId]: false }
  }
}
watch(selected, (profile) => { void ensureFullProfile(profile) }, { immediate: true })

const selectedLoadingFull = computed(() => {
  const docId = selected.value?.documentId
  return Boolean(docId && loadingCrateIds.value[docId] && !selected.value?.entityRules.length)
})

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
// fails do we rebuild from the record's fields — and then omit datePublished /
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

// Secondary export: the Describo/Crate-O mode file — form structure only. The
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
  const parts = [profile.shapesText, profile.customShapesText].filter((text): text is string => Boolean(text?.trim()))
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

// Compact, human-readable constraint chips — only the ones that are actually set.
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
      title="Metadata profiles"
      description="Profiles are ordinary RO-Crate metadata documents stored under profiles/."
    >
      <template #actions>
        <Button @click="openCreate" :disabled="!currentUser">
          <Plus class="h-4 w-4" /> New profile
        </Button>
      </template>
    </PageHeader>

    <div class="container grid gap-6 py-8 lg:grid-cols-[360px_1fr]">
      <aside class="surface max-h-[80vh] overflow-y-auto scrollbar-thin">
        <ul v-if="profiles.length" class="divide-y divide-border">
          <li v-for="profile in profiles" :key="profile.id">
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
                  <Star v-if="preferredId === profile.id" class="h-3.5 w-3.5 shrink-0 text-amber-500" fill="currentColor" />
                  <Lock v-if="profile.managed" class="h-3 w-3 shrink-0 text-muted-foreground" title="Public profile" />
                </div>
                <div class="text-[11px] text-muted-foreground">{{ profile.domain }} · {{ propertyCount(profile) }} properties</div>
                <p class="mt-1 line-clamp-2 text-[11px] text-muted-foreground/90">{{ profile.description || 'No description in RO-Crate.' }}</p>
              </div>
            </button>
          </li>
        </ul>
        <div v-else class="p-8 text-center text-xs text-muted-foreground">
          No visible profile documents under <code>profiles/</code>.
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
                <div class="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
                  <span>{{ selected.domain }}</span>
                  <span v-if="selected.managed" class="inline-flex items-center gap-1"><Lock class="h-3 w-3" /> public</span>
                </div>
                <h1 class="mt-1 font-display text-2xl font-semibold tracking-tight text-aruna-navy">{{ selected.name }}</h1>
                <p class="mt-1 max-w-3xl text-sm text-muted-foreground">{{ selected.description || 'No description in RO-Crate.' }}</p>
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
                v-if="canEditSelected"
                variant="outline"
                size="sm"
                class="text-destructive hover:text-destructive"
                @click="deleteError = null; showDelete = true"
              >
                <Trash2 class="h-3.5 w-3.5" /> Delete
              </Button>
              <Button
                variant="outline"
                size="sm"
                :disabled="downloadingCrate"
                @click="downloadProfileCrate(selected)"
                title="Full-fidelity RO-Crate profile, validation rules and form structure travel together"
              >
                <Download class="h-3.5 w-3.5" /> {{ downloadingCrate ? 'Preparing…' : 'Download profile crate' }}
              </Button>
              <Button
                variant="outline"
                size="sm"
                @click="downloadModeFile(selected)"
                title="Mode file (Describo/Crate-O), structure only; validation rules travel in the profile crate"
              >
                <Download class="h-3.5 w-3.5" /> Mode file (Describo/Crate-O)
              </Button>
              <Button
                v-if="selected.shapesText || selected.customShapesText"
                variant="outline"
                size="sm"
                @click="downloadShapes(selected)"
                title="SHACL shapes generated from this profile's rules (plus attached shapes, when present), usable in any SHACL validator"
              >
                <Download class="h-3.5 w-3.5" /> SHACL shapes
              </Button>
              <Button v-if="currentUser && preferredId !== selected.id" variant="outline" size="sm" :disabled="saving" @click="setPreferred(selected.id)">
                <Star class="h-3.5 w-3.5" /> Set as my default
              </Button>
              <Badge v-else-if="preferredId === selected.id" variant="accent" class="inline-flex items-center gap-1 px-2 py-1 text-[11px]">
                <Star class="h-3 w-3" fill="currentColor" /> Your default
              </Badge>
            </div>
          </div>

          <div class="mt-5 grid gap-3 md:grid-cols-3">
            <div class="surface-muted p-3">
              <div class="text-[11px] uppercase tracking-wider text-muted-foreground">Required properties</div>
              <div class="mt-1 font-display text-lg font-semibold text-aruna-navy">
                {{ requiredPropertyCount }}
                <span class="text-sm font-normal text-muted-foreground">/ {{ allPropertyRules.length }} total</span>
              </div>
            </div>
            <div class="surface-muted p-3">
              <div class="text-[11px] uppercase tracking-wider text-muted-foreground">Used by</div>
              <div class="mt-1 font-display text-lg font-semibold text-aruna-navy">{{ selected.usedCount }} <span class="text-sm font-normal text-muted-foreground">metadata docs</span></div>
            </div>
            <div class="surface-muted p-3">
              <div class="text-[11px] uppercase tracking-wider text-muted-foreground">Suggested keywords</div>
              <div class="mt-1 flex flex-wrap gap-1">
                <span v-for="keyword in selected.suggestedKeywords" :key="keyword" class="rounded-full bg-card px-2 py-0.5 text-[10px] text-foreground/70">#{{ keyword }}</span>
                <span v-if="!selected.suggestedKeywords.length" class="text-xs text-muted-foreground">None</span>
              </div>
            </div>
          </div>
        </div>

        <div v-if="selectedLoadingFull" class="flex items-center gap-2 px-1 text-xs text-muted-foreground">
          <span class="h-3.5 w-3.5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" aria-hidden="true" />
          Loading full profile…
        </div>

        <!-- Grouped entity-rule sections: what entities this profile expects and how they must be described. -->
        <template v-if="selected.entityRules.length">
          <div v-for="entry in entityRulesWithObligation" :key="entry.rule.id" class="surface overflow-hidden">
            <header class="border-b border-border px-5 py-4">
              <div class="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-foreground">
                <span>This profile</span>
                <Badge :variant="obligationBadgeVariant(entry.obligation)" class="text-[10px] font-semibold uppercase tracking-wide">{{ entry.obligation }}</Badge>
                <span>include an entity of type</span>
                <b class="font-semibold text-aruna-navy">{{ entityTypeLabel(entry.rule.type) }}</b>
                <span v-if="entry.rule.label && entry.rule.label.toLowerCase() !== entityTypeLabel(entry.rule.type).toLowerCase()" class="text-muted-foreground">- {{ entry.rule.label }}</span>
                <!-- Derived obligation is explained by the property that references this type. -->
                <span v-if="entry.via" class="text-[11px] text-muted-foreground">via <code class="hash rounded bg-muted px-1 py-0.5 text-foreground/70">{{ entry.via.valueName }}</code></span>
              </div>
              <p v-if="entry.rule.description" class="mt-1.5 text-xs text-muted-foreground">{{ entry.rule.description }}</p>
              <p class="mt-1 text-[11px] text-muted-foreground">{{ PROFILE_OBLIGATION_LABELS[entry.obligation].help }}</p>
            </header>

            <div v-if="entry.rule.propertyRules.length">
              <div v-for="group in groupByObligation(entry.rule.propertyRules)" :key="group.obligation" class="border-l-2" :class="OBLIGATION_ACCENT[group.obligation]">
                <div class="flex flex-wrap items-center gap-2 bg-muted/20 px-5 py-2">
                  <Badge :variant="obligationBadgeVariant(group.obligation)" class="text-[10px] font-semibold uppercase tracking-wide">{{ group.obligation }}</Badge>
                  <span class="text-xs font-semibold text-foreground">{{ PROFILE_OBLIGATION_LABELS[group.obligation].label }}</span>
                  <span class="text-[11px] text-muted-foreground">{{ PROFILE_OBLIGATION_LABELS[group.obligation].help }}</span>
                </div>
                <ul class="divide-y divide-border/60">
                  <li v-for="rule in group.rules" :key="rule.id" class="px-5 py-3">
                    <div class="flex flex-wrap items-center gap-2">
                      <span class="text-sm font-medium text-foreground">{{ rule.label }}</span>
                      <code class="hash rounded bg-muted px-1.5 py-0.5 text-foreground/70">{{ rule.valueName }}</code>
                      <span class="text-[10px] uppercase tracking-wide text-muted-foreground">{{ PROFILE_VALUE_KIND_LABELS[rule.kind] }}</span>
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
                    <p v-if="rule.description" class="mt-0.5 text-[12px] text-muted-foreground">{{ rule.description }}</p>
                    <!-- Entity-reference targets: the entity types this property points at. -->
                    <div v-if="rule.kind === 'entity' && rule.entityTypes?.length" class="mt-1 flex flex-wrap items-center gap-1">
                      <span v-for="type in rule.entityTypes" :key="type" class="rounded-full bg-card px-2 py-0.5 text-[10px] text-foreground/70 ring-1 ring-inset ring-border">references {{ entityTypeLabel(type) }}</span>
                    </div>
                    <div v-if="rule.example" class="mt-1 font-mono text-[11px] text-foreground/60">e.g. {{ rule.example }}</div>
                    <div v-if="rule.enumOptions?.length" class="mt-1 flex flex-wrap items-center gap-1">
                      <span class="text-[10px] text-muted-foreground">one of:</span>
                      <span v-for="option in rule.enumOptions" :key="option" class="rounded-full bg-card px-2 py-0.5 text-[10px] text-foreground/70 ring-1 ring-inset ring-border">{{ option }}</span>
                    </div>
                    <div v-if="constraintSummary(rule).length" class="mt-1 flex flex-wrap gap-1.5">
                      <span v-for="part in constraintSummary(rule)" :key="part" class="rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">{{ part }}</span>
                    </div>
                  </li>
                </ul>
              </div>
            </div>
            <div v-else class="px-5 py-6 text-center text-xs text-muted-foreground">
              No property rules defined for this entity type.
            </div>
          </div>
        </template>

        <!-- Profiles without a mode.json artifact surface with no machine-readable rules. -->
        <div v-else class="surface px-5 py-10 text-center text-sm text-muted-foreground">
          This profile has no machine-readable rules.
        </div>
      </section>

      <section v-else class="surface p-10 text-center text-sm text-muted-foreground">
        Select a visible profile document.
      </section>
    </div>

    <Dialog :open="showDelete" @update:open="(value: boolean) => (showDelete = value)">
      <DialogContent class="max-w-md">
        <DialogHeader>
          <DialogTitle>Delete metadata profile</DialogTitle>
          <DialogDescription>
            Deletes <span class="font-medium text-foreground">{{ selected?.name }}</span> and its graph from the catalog. Published S3 artifacts are not touched.
          </DialogDescription>
        </DialogHeader>
        <p v-if="deleteError" class="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">{{ deleteError }}</p>
        <DialogFooter>
          <DialogClose><Button variant="outline">Cancel</Button></DialogClose>
          <Button variant="destructive" :disabled="saving" @click="confirmDelete">{{ saving ? 'Deleting…' : 'Delete' }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <NewProfileDialog
      v-model:open="showNewProfile"
      :edit-profile="editingProfile"
      @created="(profile) => router.push({ name: 'profile-detail', params: { profileId: profile.id } })"
      @updated="editingProfile = null"
    />
  </div>
</template>
