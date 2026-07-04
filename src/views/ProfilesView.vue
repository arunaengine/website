<script setup lang="ts">
import PageHeader from '@/components/dashboard/PageHeader.vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Pagination from '@/components/ui/Pagination.vue'
import NewProfileDialog from '@/components/metadata/NewProfileDialog.vue'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAruna } from '@/composables/useAruna'
import { ListChecks, Plus, Star, Lock, CheckCircle2, Circle } from '@lucide/vue'
import { PROFILE_VALUE_KIND_LABELS, PROFILE_OBLIGATION_LABELS } from '@/lib/profiles/labels'
import type { MetadataProfile } from '@/data/types'
import type { ProfileObligation, ProfilePropertyRule } from '@/lib/profiles/types'

const route = useRoute()
const router = useRouter()
const { profiles, currentUser, updateUserProfile, saving, loadRoCrate } = useAruna()
const showNewProfile = ref(false)

const selectedId = computed(() => (route.params.profileId as string) || profiles.value[0]?.id || '')
const selected = computed(() => profiles.value.find((profile) => profile.id === selectedId.value))
const preferredId = computed(() => currentUser.value?.preferredProfileId ?? '')

function select(id: string) {
  router.push({ name: 'profile-detail', params: { profileId: id } })
}

async function setPreferred(id: string) {
  await updateUserProfile({ set_attributes: { 'ui.preferred_profile_path': `profiles/${id}` } })
}

// Obligation → Badge variant and the order rules are grouped in.
const OBLIGATION_BADGE: Record<ProfileObligation, 'royal' | 'warn' | 'secondary'> = {
  MUST: 'royal',
  SHOULD: 'warn',
  MAY: 'secondary',
}
const OBLIGATION_ORDER: ProfileObligation[] = ['MUST', 'SHOULD', 'MAY']

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

// Short human type name from a schema.org / URI type ("http://schema.org/Dataset" → "Dataset").
function shortType(type: string): string {
  if (!type) return 'entity'
  return type.split(/[#/]/).filter(Boolean).pop() ?? type
}

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

// Pagination is kept only for the flat fallback list (legacy/external profiles).
const PROPERTY_PAGE_SIZE = 8
const propertyPage = ref(1)
watch(selectedId, () => { propertyPage.value = 1 })
const fallbackRules = computed(() => selected.value?.propertyRules ?? [])
const fallbackPaged = computed(() =>
  fallbackRules.value.slice((propertyPage.value - 1) * PROPERTY_PAGE_SIZE, propertyPage.value * PROPERTY_PAGE_SIZE),
)
</script>

<template>
  <div>
    <PageHeader
      title="Metadata profiles"
      description="Profiles are ordinary RO-Crate metadata documents stored under profiles/."
    >
      <template #actions>
        <Button @click="showNewProfile = true" :disabled="!currentUser">
          <Plus class="h-4 w-4" /> New profile
        </Button>
      </template>
    </PageHeader>

    <div class="container grid max-w-[1400px] gap-6 py-8 lg:grid-cols-[360px_1fr]">
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
          <div v-for="entityRule in selected.entityRules" :key="entityRule.id" class="surface overflow-hidden">
            <header class="border-b border-border px-5 py-4">
              <div class="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-foreground">
                <span>This profile</span>
                <Badge :variant="OBLIGATION_BADGE[entityRule.obligation]" class="text-[10px] font-semibold uppercase tracking-wide">{{ entityRule.obligation }}</Badge>
                <span>include an entity of type</span>
                <b class="font-semibold text-aruna-navy">{{ shortType(entityRule.type) }}</b>
                <span v-if="entityRule.label && entityRule.label.toLowerCase() !== shortType(entityRule.type).toLowerCase()" class="text-muted-foreground">— {{ entityRule.label }}</span>
              </div>
              <p v-if="entityRule.description" class="mt-1.5 text-xs text-muted-foreground">{{ entityRule.description }}</p>
              <p class="mt-1 text-[11px] text-muted-foreground">{{ PROFILE_OBLIGATION_LABELS[entityRule.obligation].help }}</p>
            </header>

            <div v-if="entityRule.propertyRules.length">
              <div v-for="group in groupByObligation(entityRule.propertyRules)" :key="group.obligation">
                <div class="flex flex-wrap items-center gap-2 bg-muted/20 px-5 py-2">
                  <Badge :variant="OBLIGATION_BADGE[group.obligation]" class="text-[10px] font-semibold uppercase tracking-wide">{{ group.obligation }}</Badge>
                  <span class="text-xs font-semibold text-foreground">{{ PROFILE_OBLIGATION_LABELS[group.obligation].label }}</span>
                  <span class="text-[11px] text-muted-foreground">{{ PROFILE_OBLIGATION_LABELS[group.obligation].help }}</span>
                </div>
                <ul class="divide-y divide-border/60">
                  <li v-for="rule in group.rules" :key="rule.id" class="px-5 py-3">
                    <div class="flex flex-wrap items-center gap-2">
                      <span class="text-sm font-medium text-foreground">{{ rule.label }}</span>
                      <code class="hash rounded bg-muted px-1.5 py-0.5 text-foreground/70">{{ rule.valueName }}</code>
                      <span class="text-[10px] uppercase tracking-wide text-muted-foreground">{{ PROFILE_VALUE_KIND_LABELS[rule.kind] }}</span>
                    </div>
                    <p v-if="rule.description" class="mt-0.5 text-[12px] text-muted-foreground">{{ rule.description }}</p>
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

        <!-- Fallback: legacy/external profiles with no structured entity rules render the flat property list. -->
        <div v-else class="surface overflow-hidden">
          <header class="border-b border-border px-5 py-3">
            <h3 class="font-display text-sm font-semibold text-aruna-navy">Property rules</h3>
            <p class="text-xs text-muted-foreground">This profile has no structured entity rules; showing the flat property rules parsed from its JSON Schema validator.</p>
          </header>
          <ul class="divide-y divide-border">
            <li v-for="rule in fallbackPaged" :key="rule.id" class="flex items-start gap-3 px-5 py-3">
              <CheckCircle2 v-if="rule.obligation === 'MUST'" class="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <Circle v-else class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/60" />
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="text-sm font-medium text-foreground">{{ rule.label }}</span>
                  <code class="hash rounded bg-muted px-1.5 py-0.5 text-foreground/70">{{ rule.valueName }}</code>
                  <Badge :variant="OBLIGATION_BADGE[rule.obligation]" class="text-[10px] font-semibold uppercase tracking-wide">{{ rule.obligation }}</Badge>
                  <span class="text-[10px] text-muted-foreground">· {{ PROFILE_VALUE_KIND_LABELS[rule.kind] }}</span>
                </div>
                <p v-if="rule.description" class="mt-0.5 text-[12px] text-muted-foreground">{{ rule.description }}</p>
                <div v-if="rule.example" class="mt-1 font-mono text-[11px] text-foreground/60">e.g. {{ rule.example }}</div>
                <div v-if="rule.enumOptions?.length" class="mt-1 flex flex-wrap items-center gap-1">
                  <span class="text-[10px] text-muted-foreground">one of:</span>
                  <span v-for="option in rule.enumOptions" :key="option" class="rounded-full bg-card px-2 py-0.5 text-[10px] text-foreground/70 ring-1 ring-inset ring-border">{{ option }}</span>
                </div>
                <div v-if="constraintSummary(rule).length" class="mt-1 flex flex-wrap gap-1.5">
                  <span v-for="part in constraintSummary(rule)" :key="part" class="rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">{{ part }}</span>
                </div>
              </div>
            </li>
            <li v-if="!fallbackRules.length" class="px-5 py-8 text-center text-xs text-muted-foreground">
              This profile has no parseable property rules.
            </li>
          </ul>
          <Pagination v-if="fallbackRules.length > PROPERTY_PAGE_SIZE" v-model:page="propertyPage" :page-size="PROPERTY_PAGE_SIZE" :total="fallbackRules.length" label="properties" />
        </div>
      </section>

      <section v-else class="surface p-10 text-center text-sm text-muted-foreground">
        Select a visible profile document.
      </section>
    </div>

    <NewProfileDialog v-model:open="showNewProfile" @created="(profile) => router.push({ name: 'profile-detail', params: { profileId: profile.id } })" />
  </div>
</template>
