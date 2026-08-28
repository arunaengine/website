<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Input from '@/components/ui/Input.vue'
import Select from '@/components/ui/Select.vue'
import Switch from '@/components/ui/Switch.vue'
import { ChevronDown, ChevronRight, Lock } from '@lucide/vue'
import { OBLIGATION_ACCENT, PROFILE_OBLIGATION_LABELS } from '@/lib/profiles/labels'
import {
  isSchemaOrgUri,
  loadCustomPropertyTerms,
  mintTermUri,
  propertyTermsForType,
  saveCustomPropertyTerm,
  termNameFromUri,
  type PropertyTermOption,
} from '@/lib/profiles/propertyCatalog'
import { isAbsoluteUri, isValidPropertyTermName, normalizeTypeUri, sameSchemaOrgType, SCHEMA_ORG } from '@/lib/profiles/uri'
import { isHasPartUri } from '@/lib/profiles/emit'
import { datatypeKind, vocabKind, type VocabTerm } from '@/lib/profiles/vocabulary'
import VocabSuggestions from './VocabSuggestions.vue'
import AllowedUrls from './rules/AllowedUrls.vue'
import AllowedValues from './rules/AllowedValues.vue'
import CardinalityFields from './rules/CardinalityFields.vue'
import EntitySources from './rules/EntitySources.vue'
import EntityTargets from './rules/EntityTargets.vue'
import RequiredContents from './rules/RequiredContents.vue'
import ScalarConstraints from './rules/ScalarConstraints.vue'
import {
  VALUE_KIND_OPTIONS,
  hasPreservedUrlOptions,
  propertyName,
  trimmed,
  type DraftEntityRule,
  type DraftPropertyRule,
  type ProfileBuilder,
} from './useProfileBuilder'

const props = defineProps<{
  // The builder, used to read the profile's entity rules for grouped target
  // options and to run the "create entity rule" quick action.
  builder: ProfileBuilder
  property: DraftPropertyRule
  entityTypeName: string
  // Owning entity type URI (drives the curated property-term catalogue).
  ownerType: string
  // Live profile slug, used to preview the minted URI of custom terms.
  slug: string
}>()
const emit = defineEmits<{ (e: 'remove'): void }>()

// Never capture the reactive prop by value: with index keys, removing a card
// used to leave surviving cards bound to the wrong (or a deleted) draft. Read
// through a computed so the card always tracks its live prop; the parent keys
// each card on the draft uid so it stays pinned to one draft.
const property = computed(() => props.property)

// Baseline rules carry a builder-session lock (see DraftLock in useProfileBuilder).
// `full` (unused on properties today) locks everything; `structural` fixes identity
// (label / property name / term / removal) but opens the specific affordances the
// RO-Crate baseline allows. `anyLock` gates the identity + generic fields.
const anyLock = computed(() => Boolean(property.value.lock))
const structural = computed(() => property.value.lock === 'structural')
const isEntity = computed(() => property.value.kind === 'entity')

// Which structural baseline rule this is, by term URI; drives the opened
// affordances. license: kind url↔select-url, everything else frozen. The
// obligation select (and its baseline clamp mirror) lives on PropertyRuleRow,
// via obligationEditDisabled/obligationOptionsFor in useProfileBuilder.
const isLicenseRule = computed(() => sameSchemaOrgType(property.value.propertyUri, `${SCHEMA_ORG}license`))
// Kind stays editable on unlocked rules; on a structural rule only license switches
// (url↔select-url), everything else is frozen.
const kindDisabled = computed(() => property.value.lock === 'full' || (structural.value && !isLicenseRule.value))

// select-object is import-only/read-only. select-url IS authorable, so it appears
// in the dropdown; a structural license is restricted to url↔select-url.
const kindOptions = computed(() => {
  if (structural.value && isLicenseRule.value) {
    return VALUE_KIND_OPTIONS.filter((option) => option.value === 'url' || option.value === 'select-url')
  }
  return VALUE_KIND_OPTIONS.filter((option) => option.value !== 'select-object' || option.value === property.value.kind)
})

// M4: surface the property-name format/collision error inline under the field,
// mirroring the step-gate wording so the fix is obvious at the point of editing.
const valueNameError = computed(() => {
  const typed = trimmed(property.value.valueName)
  if (!typed) return ''
  if (!isValidPropertyTermName(typed)) {
    return 'Property names start with a lowercase letter and use only letters and digits, e.g. assayType.'
  }
  const classNames = new Set(
    props.builder.entities.map((item) => entityClassName(item).toLowerCase()).filter(Boolean),
  )
  if (classNames.has(typed.toLowerCase())) {
    return 'This name collides with an entity class name, rename it so property and class names stay distinct.'
  }
  return ''
})

// Inline empty-state error for the "One of" kind, mirroring the step-gate check
// in useProfileBuilder (enum with no options blocks Next); shown right at the
// always-visible Allowed values input so the fix is never hidden.
const enumOptionsError = computed(() => {
  if (property.value.kind !== 'enum') return ''
  const options = String(property.value.enumOptions ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
  return options.length ? '' : 'Add at least one allowed value, comma-separated, e.g. LC-MS, MALDI-TOF.'
})

// Imported Describo/Crate-O SelectObject rules are preserved verbatim and not
// authorable: render a read-only summary card (label, description and obligation
// stay editable; the option list travels back out untouched). select-url is now
// authorable, so it renders in the normal editor with an allowed-URLs list.
const isPreservedSelect = computed(() => property.value.kind === 'select-object')
const preservedOptionCount = computed(() => property.value.valueOptions?.length ?? 0)

// L1: a select-url that imported non-string options is preserved verbatim and shown
// read-only (like select-object), never coerced into the editable URL list.
const isPreservedUrlOptions = computed(
  () => property.value.kind === 'select-url' && hasPreservedUrlOptions(property.value.valueOptions),
)

// WS2: multi-valued rules expose list-count inputs. keyword-list is inherently a
// list, so it hides the toggle but still allows min/max entries.
const isMultiValued = computed(() => property.value.multipleValues || property.value.kind === 'keyword-list')
const showMultipleSwitch = computed(() => property.value.kind !== 'keyword-list')
const listCountError = computed(() => {
  if (!isMultiValued.value) return ''
  const min = parseCount(property.value.minItems)
  const max = parseCount(property.value.maxItems)
  if (min !== undefined && min < 1) return 'Minimum entries must be at least 1.'
  if (max !== undefined && max < 1) return 'Maximum entries must be at least 1.'
  if (min !== undefined && max !== undefined && max < min) return 'Maximum entries cannot be less than minimum entries.'
  return ''
})

function parseCount(value: string | number): number | undefined {
  const text = trimmed(value)
  if (!text) return undefined
  const parsed = Number(text)
  return Number.isFinite(parsed) ? parsed : undefined
}

// WS3: authorable allowed-URL set for select-url. At least one absolute URL is
// required (mirrors the rulesErrors gate) and every row must be absolute.
const urlOptionsError = computed(() => {
  if (property.value.kind !== 'select-url') return ''
  const urls = property.value.urlOptions.map((url) => trimmed(url)).filter(Boolean)
  if (!urls.length) return 'Add at least one allowed URL.'
  if (urls.some((url) => !isAbsoluteUri(url))) return 'Every allowed value must be an absolute URL, e.g. https://…​.'
  return ''
})

const isHasPart = computed(() => isHasPartUri(resolvedUri.value))
// The allowed-sources policy carries for every entity reference except hasPart,
// whose values come from the dataset's data references (normalizeProperty drops
// the policy there, so the control never disagrees with what is emitted).
const showEntitySources = computed(() => isEntity.value && !isHasPart.value)

// M5: hasPart values are always crate entity references (its attached files /
// datasets); a scalar kind would brick the dataset dialog. Flag it inline, matching
// the parallel rulesErrors gate so the fix is obvious at the point of editing.
const hasPartKindError = computed(() =>
  isHasPart.value && !isEntity.value ? 'hasPart must be an entity reference.' : '',
)

// M2: hasPart is inherently a repeatable relation, so selecting it as an entity
// reference defaults the rule to multi-valued. A default, not a lock: this fires
// only on ENTERING the hasPart+entity state, so a deliberate toggle-off is never
// snapped back and an already-multiple import is never disturbed.
watch(
  () => isHasPart.value && isEntity.value,
  (isHasPartEntity, wasHasPartEntity) => {
    if (isHasPartEntity && !wasHasPartEntity) property.value.multipleValues = true
  },
)
// WS5/M1/M2: the required-contents editor is authorable ONLY for the hasPart term;
// that is the one relation the dataset dialog enforces. Imported required instances
// on other rules are preserved (see normalizeProperty) and surfaced in the review
// step, just not editable here. It stays visible whenever rows already exist, even
// after multiple is toggled off, so a stranded row is never hidden while it lingers.
const showRequiredContents = computed(
  () => isEntity.value && isHasPart.value && (isMultiValued.value || property.value.requiredInstances.length > 0),
)
// Obligation-colored left accent, from the shared labels map so it stays in sync
// with the Badge mapping; updates live when the obligation changes.
const accentClass = computed(() => OBLIGATION_ACCENT[property.value.obligation])

function autofillName() {
  if (!trimmed(property.value.valueName)) property.value.valueName = propertyName(trimmed(property.value.label))
}

// ---------------------------------------------------------------------------
// Property term picker: curated schema.org terms for the owning type + saved
// custom terms, plus two escapes: paste an External URI, or mint a Custom term
// (portal-hosted, URI derived from slug + property name at serialization time).
// ---------------------------------------------------------------------------
const EXTERNAL_SENTINEL = '__external_uri__'
const MINT_SENTINEL = '__mint_term__'
const customTerms = ref(loadCustomPropertyTerms())
const externalMode = ref(false)

const curatedTerms = computed(() => propertyTermsForType(props.ownerType))
const termByUri = computed(() => {
  const map = new Map<string, PropertyTermOption>()
  for (const term of curatedTerms.value) map.set(term.uri, term)
  for (const term of customTerms.value) if (!map.has(term.uri)) map.set(term.uri, term)
  return map
})

const termOptions = computed(() => {
  const options: { value: string; label: string }[] = []
  const seen = new Set<string>()
  for (const term of curatedTerms.value) {
    options.push({ value: term.uri, label: `${term.label}, schema.org/${term.name}` })
    seen.add(term.uri)
  }
  for (const term of customTerms.value) {
    if (seen.has(term.uri)) continue
    options.push({ value: term.uri, label: `${term.label} (custom)` })
    seen.add(term.uri)
  }
  // Surface an already-set external URI that is not in either list.
  const current = trimmed(property.value.propertyUri)
  if (current && !seen.has(current) && !externalMode.value) {
    options.push({ value: current, label: termNameFromUri(current) })
    seen.add(current)
  }
  options.push({ value: EXTERNAL_SENTINEL, label: 'External URI…' })
  options.push({ value: MINT_SENTINEL, label: 'Custom (minted)' })
  return options
})

const pickerValue = computed(() => {
  if (externalMode.value) return EXTERNAL_SENTINEL
  return trimmed(property.value.propertyUri) || MINT_SENTINEL
})

// The absolute URI this rule serializes to; mirrors normalizeProperty so the
// hint always shows the real term, including the minted one for custom terms.
const resolvedUri = computed(() => {
  const explicit = trimmed(property.value.propertyUri)
  if (explicit) return explicit
  return mintTermUri(trimmed(props.slug) || 'profile', trimmed(property.value.valueName) || 'term')
})

function onTermSelect(value: string) {
  if (value === EXTERNAL_SENTINEL) {
    externalMode.value = true
    return
  }
  externalMode.value = false
  if (value === MINT_SENTINEL) {
    // Empty URI = mint from the live slug + property name at normalization.
    property.value.propertyUri = ''
    return
  }
  property.value.propertyUri = value
  const term = termByUri.value.get(value)
  if (term) {
    property.value.valueName = term.name
    if (!trimmed(property.value.label)) property.value.label = term.label
    // WS1: apply the term's suggested kind / target types as defaults, but only
    // when the author has not diverged from the factory defaults (kind 'text', no
    // targets). Never a lock, just a helpful starting point.
    if (term.suggestedKind && property.value.kind === 'text') {
      property.value.kind = term.suggestedKind
    }
    if (term.suggestedEntityTypes?.length && property.value.kind === 'entity' && !property.value.entityTypes.length) {
      property.value.entityTypes = [...term.suggestedEntityTypes]
    }
  }
}

// Remember a pasted external URI so it shows as a normal option next time.
// Only an absolute URI commits; search text typed to drive the vocabulary
// suggestions below must never be saved as a bogus custom term.
function commitExternalUri() {
  const uri = trimmed(property.value.propertyUri)
  if (!uri || !isAbsoluteUri(uri)) return
  externalMode.value = false
  const name = trimmed(property.value.valueName) || termNameFromUri(uri)
  customTerms.value = saveCustomPropertyTerm({
    uri,
    name,
    label: trimmed(property.value.label) || name,
    description: trimmed(property.value.description),
  })
}

// ---------------------------------------------------------------------------
// Bundled-vocabulary autocomplete (schema.org core + Dublin Core) and the
// mint-discouragement suggestions: reusing an existing term beats minting one.
// ---------------------------------------------------------------------------
// True when this rule would mint a portal-hosted term (empty explicit URI).
const isMintedTerm = computed(() => !externalMode.value && !trimmed(property.value.propertyUri))
const mintQuery = computed(() => trimmed(property.value.label) || trimmed(property.value.valueName))

function applyVocabTerm(term: VocabTerm) {
  externalMode.value = false
  property.value.propertyUri = term.uri
  const name = isValidPropertyTermName(term.name) ? term.name : propertyName(term.label)
  if (name) property.value.valueName = name
  if (!trimmed(property.value.label)) property.value.label = term.label
  if (!trimmed(property.value.description) && term.description) property.value.description = term.description
  // Apply the term's suggested kind / targets as defaults only while the rule
  // still sits on the factory defaults; never overwrite a deliberate choice.
  const suggested = vocabKind(term)
  if (suggested && suggested !== 'text' && property.value.kind === 'text') property.value.kind = suggested
  if (term.targets?.length && property.value.kind === 'entity' && !property.value.entityTypes.length) {
    // A mixed range lists datatypes next to classes; only the classes are targets.
    property.value.entityTypes = term.targets.map(normalizeTypeUri).filter((uri) => uri && !datatypeKind(uri))
  }
}

// The class short name an entity rule serializes to, for the property-vs-class
// collision check above.
function entityClassName(item: DraftEntityRule): string {
  const type = normalizeTypeUri(item.type)
  if (!type) return ''
  return isSchemaOrgUri(type) ? termNameFromUri(type) : trimmed(item.className) || termNameFromUri(type)
}

// ---------------------------------------------------------------------------
// One "Advanced" disclosure holds every power setting (technical identifiers,
// allowed sources, list cardinality, allowed values/URLs, constraints, required
// contents). It stays collapsed by default so the card leads with the primary
// decisions. It auto-opens once, seeded on mount, when the rule already carries
// advanced content (an imported rule, any non-default constraint, or a field
// that is currently invalid), so those settings are never silently hidden. It
// then only ever opens (never auto-closes) if a field inside later turns
// invalid, mirroring the old technical-details disclosure that opened itself on
// a name error.
// ---------------------------------------------------------------------------
const advancedNeedsAttention = computed(() => {
  // Invalid fields that live inside Advanced.
  if (valueNameError.value) return true
  if (listCountError.value) return true
  if (property.value.kind === 'enum' && enumOptionsError.value) return true
  if (property.value.kind === 'select-url' && urlOptionsError.value) return true
  // The external-URI editor is part of the technical-identifiers group.
  if (externalMode.value) return true
  // Non-default / non-empty power settings.
  if (trimmed(property.value.defaultValue)) return true
  if (trimmed(property.value.example)) return true
  if (trimmed(property.value.pattern)) return true
  if (trimmed(property.value.minLength) || trimmed(property.value.maxLength)) return true
  if (trimmed(property.value.minValue) || trimmed(property.value.maxValue) || trimmed(property.value.stepValue)) return true
  if (trimmed(property.value.minItems) || trimmed(property.value.maxItems)) return true
  if (property.value.kind === 'enum' && trimmed(property.value.enumOptions)) return true
  if (property.value.kind === 'select-url' && property.value.urlOptions.some((url) => trimmed(url))) return true
  if (property.value.requiredInstances.length > 0) return true
  if (showEntitySources.value && (property.value.entitySources?.length ?? 0) > 0) return true
  // A pasted / custom (non-schema.org) property term URI is an advanced choice.
  if (property.value.propertyUri && !isSchemaOrgUri(property.value.propertyUri)) return true
  return false
})

// Seed the open state from the initial evaluation ("once, on mount"), then keep
// opening it whenever a field inside turns invalid.
const advancedOpen = ref(advancedNeedsAttention.value)
watch(advancedNeedsAttention, (needsAttention) => {
  if (needsAttention) advancedOpen.value = true
})
</script>

<template>
  <div class="rounded-lg border border-border border-l-2 bg-card p-3" :class="accentClass">
    <div v-if="anyLock" class="mb-2 inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
      <Lock class="h-3 w-3" /> RO-Crate baseline
    </div>

    <!-- Preserved import summary: SelectObject rules are not authorable in the
         builder; label and description stay editable, the option list is edited
         in Describo/Crate-O and travels back out verbatim. Obligation and removal
         are owned by the row. -->
    <template v-if="isPreservedSelect">
      <div class="grid gap-2 sm:grid-cols-2">
        <div>
          <label class="text-[11px] font-medium text-muted-foreground">Label</label>
          <Input v-model="property.label" class="mt-0.5" :disabled="anyLock" />
        </div>
        <div>
          <label class="text-[11px] font-medium text-muted-foreground">Value type</label>
          <Select v-model="property.kind" :options="kindOptions" class="mt-0.5" disabled />
        </div>
        <div class="sm:col-span-2">
          <label class="text-[11px] font-medium text-muted-foreground">Description shown to users</label>
          <Input v-model="property.description" class="mt-0.5" placeholder="What this value should contain." :disabled="anyLock" />
        </div>
      </div>
      <p class="mt-2 rounded-md border border-dashed border-border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
        Preserved from import, {{ preservedOptionCount }} {{ preservedOptionCount === 1 ? 'option' : 'options' }}. Edit the option list in Describo/Crate-O; label and description are editable here.
      </p>
      <p class="mt-2 text-[11px] text-muted-foreground">{{ PROFILE_OBLIGATION_LABELS[property.obligation].help }}</p>
    </template>

    <template v-else>
    <!-- Primary decisions: what the field is called, what it holds, and the help
         text shown under it in the generated form. Everything else lives behind
         the single Advanced disclosure below. -->
    <div class="grid gap-2 sm:grid-cols-2">
      <div>
        <label class="text-[11px] font-medium text-muted-foreground">Label</label>
        <Input v-model="property.label" class="mt-0.5" placeholder="License" :disabled="anyLock" @blur="autofillName" />
      </div>
      <div>
        <label class="text-[11px] font-medium text-muted-foreground">Value type</label>
        <Select v-model="property.kind" :options="kindOptions" class="mt-0.5" :disabled="kindDisabled" />
      </div>
    </div>
    <div class="mt-2">
      <label class="text-[11px] font-medium text-muted-foreground">Description shown to users</label>
      <Input v-model="property.description" class="mt-0.5" placeholder="What this value should contain." :disabled="anyLock" />
    </div>

    <!-- Discourage minting: while this rule would mint a portal-hosted term,
         surface matching existing vocabulary for the typed label right here. -->
    <VocabSuggestions
      v-if="!anyLock && isMintedTerm"
      :query="mintQuery"
      kind="property"
      heading="Consider an existing term instead of minting one:"
      @pick="applyVocabTerm"
    />

    <!-- M5: hasPart must be an entity reference or the dataset dialog cannot bind it. -->
    <p v-if="hasPartKindError" class="mt-2 text-[11px] text-destructive">{{ hasPartKindError }}</p>

    <!-- WS2: the multiple-values toggle stays on the primary surface; the min/max
         entry counts it unlocks live in Advanced. keyword-list is always a list,
         so it hides the toggle (its counts still appear under Advanced). -->
    <div v-if="showMultipleSwitch" class="mt-2 rounded-md border border-border px-3 py-2 text-xs">
      <label class="flex items-center justify-between gap-2">
        <span>
          Allow multiple values
          <span class="block text-[11px] text-muted-foreground">Users can supply a list instead of a single value.</span>
        </span>
        <Switch :checked="property.multipleValues" :disabled="anyLock" @update:checked="(value: boolean) => (property.multipleValues = value)" />
      </label>
    </div>

    <!-- Entity-reference targets: which types this reference points at. The
         allowed-sources policy and required-contents editor move to Advanced. -->
    <EntityTargets
      v-if="isEntity"
      :builder="builder"
      :property="property"
      :disabled="anyLock"
      :is-has-part="isHasPart"
    />

    <p class="mt-2 text-[11px] text-muted-foreground">{{ PROFILE_OBLIGATION_LABELS[property.obligation].help }}</p>

    <!-- One Advanced disclosure for every power setting. Collapsed by default;
         auto-opens when the rule already carries advanced content (see
         advancedNeedsAttention). -->
    <div class="mt-2">
      <button
        type="button"
        class="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
        :aria-expanded="advancedOpen"
        @click="advancedOpen = !advancedOpen"
      >
        <component :is="advancedOpen ? ChevronDown : ChevronRight" class="h-3.5 w-3.5 shrink-0" />
        Advanced
      </button>

      <div v-if="advancedOpen" class="mt-2 space-y-3 border-t border-border pt-3">
        <!-- Technical identifiers: the machine identifiers behind this rule
             (RO-Crate property name and ontology term URI). -->
        <div>
          <div class="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Technical identifiers</div>
          <div class="mt-1 grid gap-2 rounded-md border border-border p-3 sm:grid-cols-2">
            <div>
              <label class="text-[11px] font-medium text-muted-foreground">Property name</label>
              <Input v-model="property.valueName" class="mt-0.5" placeholder="license" :disabled="anyLock" />
              <p v-if="valueNameError" class="mt-0.5 text-[11px] text-destructive">{{ valueNameError }}</p>
              <p v-else class="mt-0.5 text-[11px] text-muted-foreground">The compact JSON key in the RO-Crate.</p>
            </div>
            <div>
              <label class="text-[11px] font-medium text-muted-foreground">Property term</label>
              <Select
                :model-value="pickerValue"
                :options="termOptions"
                class="mt-0.5"
                :disabled="anyLock"
                @update:model-value="onTermSelect"
              />
              <div v-if="externalMode" class="mt-1.5">
                <Input
                  v-model="property.propertyUri"
                  placeholder="Search the vocabulary, or paste a term URI"
                  :disabled="anyLock"
                  @blur="commitExternalUri"
                  @keydown.enter="commitExternalUri"
                />
                <VocabSuggestions :query="String(property.propertyUri ?? '')" kind="property" @pick="applyVocabTerm" />
                <p class="mt-0.5 text-[11px] text-muted-foreground">
                  Type to search schema.org and Dublin Core, or paste any absolute term URI from an existing ontology.
                </p>
              </div>
            </div>
            <p class="break-all font-mono text-[11px] text-muted-foreground sm:col-span-2">{{ resolvedUri }}</p>
          </div>
        </div>

        <!-- Allowed sources: a rule may allow several (reuse-or-create). Hidden for
             hasPart, which binds to the data references. -->
        <EntitySources v-if="showEntitySources" :property="property" :disabled="anyLock" />

        <!-- WS2: list cardinality for a multi-valued rule. -->
        <CardinalityFields v-if="isMultiValued" :property="property" :disabled="anyLock" :error="listCountError" />

        <!-- "One of" allowed values. -->
        <AllowedValues v-if="property.kind === 'enum'" :property="property" :disabled="anyLock" :error="enumOptionsError" />

        <!-- WS3: select-url is authorable, an add/remove list of the allowed absolute
             URLs users may pick from. At least one is required. L1: an imported set that
             carries non-string (structured) options is preserved verbatim and read-only. -->
        <AllowedUrls
          v-if="property.kind === 'select-url'"
          :property="property"
          :disabled="kindDisabled"
          :preserved="isPreservedUrlOptions"
          :preserved-count="preservedOptionCount"
          :error="urlOptionsError"
        />

        <!-- Scalar constraints: default / example / pattern / length / numeric range. -->
        <ScalarConstraints v-if="!isEntity" :property="property" :disabled="anyLock" />

        <!-- WS5: required contents for a multi-valued reference (most useful for
             hasPart). Rows match a required entry by Name or @id, with an optional
             hint. More entries than listed are always allowed. -->
        <RequiredContents v-if="showRequiredContents" :property="property" :disabled="anyLock" />
      </div>
    </div>
    </template>
  </div>
</template>
