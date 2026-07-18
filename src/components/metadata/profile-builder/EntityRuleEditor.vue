<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Input from '@/components/ui/Input.vue'
import Textarea from '@/components/ui/Textarea.vue'
import Select from '@/components/ui/Select.vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import PropertyRuleCard from './PropertyRuleCard.vue'
import { ChevronDown, ChevronRight, Lock, Plus, Link2, TriangleAlert, Trash2 } from '@lucide/vue'
import { PROFILE_OBLIGATION_LABELS, obligationBadgeVariant } from '@/lib/profiles/labels'
import {
  CURATED_ENTITY_TYPES,
  entityTypeLabel,
  loadCustomEntityTypes,
  saveCustomEntityType,
} from '@/lib/profiles/entityTypes'
import { isSchemaOrgUri } from '@/lib/profiles/propertyCatalog'
import { isDatasetType, isValidClassName, normalizeTypeUri, termNameFromUri } from '@/lib/profiles/uri'
import type { VocabTerm } from '@/lib/profiles/vocabulary'
import VocabSuggestions from './VocabSuggestions.vue'
import {
  PROPERTY_RULE_TEMPLATES,
  trimmed,
  type DraftEntityRule,
  type ProfileBuilder,
} from './useProfileBuilder'

const props = defineProps<{
  builder: ProfileBuilder
  entity: DraftEntityRule
  entityIndex: number
}>()
// Never capture a reactive prop by value — that would freeze the editor to the
// entity selected at mount. Read through a computed so switching selection (and
// the Remove target) always tracks the live prop.
const builder = props.builder
const entity = computed(() => props.entity)

// Locked baseline entity (Root Dataset): read-only, not removable, but new
// property rules can still be added.
const locked = computed(() => Boolean(entity.value.lock))

// Baseline (locked) RO-Crate rules are always applied but rarely worth reading;
// keep them out of the way behind a collapsed disclosure (issue 7). Rendering is
// filtered only — `entities` keeps the full array for serialization/validation.
const baselineProperties = computed(() => entity.value.properties.filter((property) => property.lock))
const editableProperties = computed(() => entity.value.properties.filter((property) => !property.lock))
const showBaseline = ref(false)

// The split lists break positional indices, so removal resolves the draft's
// live index by identity.
function removePropertyDraft(target: (typeof entity.value.properties)[number]) {
  builder.removeProperty(entity.value, entity.value.properties.indexOf(target))
}

const normalizedType = computed(() => normalizeTypeUri(entity.value.type))
const isDataset = computed(() => isDatasetType(normalizedType.value))

// Obligation is no longer stored on the entity: it is derived from which
// property rules reference this type, shown read-only with its explanation.
const obligation = computed(() => builder.entityObligation(entity.value.type))

// className (D3): schema.org types keep the derived name (display-only); custom
// types get an editable, validated, auto-filled input.
const isCustomType = computed(() => Boolean(normalizedType.value) && !isSchemaOrgUri(normalizedType.value))
const derivedClassName = computed(() => termNameFromUri(normalizedType.value))
const classNameError = computed(() => {
  if (!isCustomType.value) return ''
  const name = trimmed(entity.value.className) || derivedClassName.value
  return isValidClassName(name)
    ? ''
    : 'Class name must start with a capital letter, then letters or digits only, e.g. Specimen.'
})
// H4: an imported schema.org-typed rule may carry a class alias that differs from
// the type-derived name (e.g. a Person class keyed `Author`). It survives export,
// so show it read-only rather than misleading the author with the derived name.
const schemaOrgAlias = computed(() => {
  const name = trimmed(entity.value.className)
  return !isCustomType.value && name && name !== derivedClassName.value ? name : ''
})
// Keep a custom type's class name populated so it is never blank on export; the
// derived name stays authoritative for schema.org types.
watch(
  [isCustomType, normalizedType],
  () => {
    if (isCustomType.value && !trimmed(entity.value.className)) entity.value.className = derivedClassName.value
  },
  { immediate: true },
)

// Referenced-by (D6): every entity-reference property, across all entity rules,
// that points at this type. An entity rule only takes effect once something
// references it, so an empty list is surfaced as an actionable warning below.
const references = computed(() => builder.entityReferences(entity.value.type))

// Owner picker for the one-click "Add reference property" action, defaulting to
// the Root Dataset entity (the usual place a reference originates).
const ownerOptions = computed(() =>
  builder.entities.map((item, index) => ({ value: String(index), label: trimmed(item.label) || `Entity ${index + 1}` })),
)
const defaultOwnerIndex = computed(() => {
  const index = builder.entities.findIndex((item) => isDatasetType(normalizeTypeUri(item.type)))
  return String(index >= 0 ? index : 0)
})
const ownerIndex = ref(defaultOwnerIndex.value)

function addReference() {
  const owner = builder.entities[Number(ownerIndex.value)]
  if (owner) builder.addReferenceProperty(owner, entity.value)
}

// Entity type Select: curated types + user-saved custom types + a "Custom URI…"
// escape. `entity.type` always holds the full URI so isDatasetType keeps working
// unchanged; the free-text escape reappears only on demand.
const CUSTOM_SENTINEL = '__custom_uri__'
const customTypes = ref(loadCustomEntityTypes())
const customMode = ref(false)

const typeOptions = computed(() => {
  const options = CURATED_ENTITY_TYPES.map((type) => ({ value: type.uri, label: type.label }))
  const seen = new Set(options.map((option) => option.value))
  for (const custom of customTypes.value) {
    if (!seen.has(custom.uri)) {
      options.push({ value: custom.uri, label: custom.label })
      seen.add(custom.uri)
    }
  }
  // Show a loaded/custom current value that isn't a known option instead of
  // silently resetting it (not while the free-text escape is mid-edit).
  const current = entity.value.type
  if (current && !seen.has(current) && !customMode.value) {
    options.push({ value: current, label: entityTypeLabel(current) })
    seen.add(current)
  }
  options.push({ value: CUSTOM_SENTINEL, label: 'Custom URI…' })
  return options
})

const typeSelectValue = computed(() => (customMode.value ? CUSTOM_SENTINEL : entity.value.type))

function onTypeSelect(value: string) {
  if (value === CUSTOM_SENTINEL) {
    customMode.value = true
    return
  }
  customMode.value = false
  entity.value.type = value
}

// Normalize the free-text custom type on commit and remember genuine URLs so they
// show up as a normal option next time.
function commitCustomType() {
  const normalized = normalizeTypeUri(entity.value.type)
  if (!normalized) return
  entity.value.type = normalized
  if (/^https?:\/\//.test(normalized)) customTypes.value = saveCustomEntityType(normalized)
  customMode.value = false
}

// A bundled-vocabulary class pick (schema.org core / Dublin Core) — same commit
// path as a typed custom URI, with the label filled when still empty.
function applyVocabClass(term: VocabTerm) {
  entity.value.type = term.uri
  if (!trimmed(entity.value.label)) entity.value.label = term.label
  if (/^https?:\/\//.test(term.uri) && !isSchemaOrgUri(term.uri)) customTypes.value = saveCustomEntityType(term.uri)
  customMode.value = false
}
</script>

<template>
  <div class="space-y-4 rounded-xl border border-border bg-muted/20 p-4">
    <div v-if="locked" class="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
      <Lock class="h-3.5 w-3.5" /> RO-Crate baseline, fixed
    </div>

    <!-- Derived, read-only obligation: an entity type is required iff a required
         property references it. The Root Dataset is always present by definition. -->
    <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
      <span>Entities of type <b class="text-foreground">{{ entityTypeLabel(entity.type) }}</b> are</span>
      <template v-if="locked">
        <Badge variant="royal">Always present</Badge>
        <span class="text-[11px]">the crate root, described by <code class="rounded bg-muted px-1">ro-crate-metadata.json</code>.</span>
      </template>
      <template v-else>
        <Badge :variant="obligationBadgeVariant(obligation.obligation)">{{ PROFILE_OBLIGATION_LABELS[obligation.obligation].label }}</Badge>
        <span class="text-[11px]">
          <template v-if="obligation.via">derived, referenced by <code class="rounded bg-muted px-1">{{ obligation.via.valueName }}</code> on {{ obligation.via.entityLabel }}</template>
          <template v-else>derived, no property references this type yet</template>
        </span>
      </template>
    </div>

    <!-- Referenced by (D6): what links to this entity. An entity rule only takes
         effect once a property references it; when nothing does, offer a one-click
         fix. The Root Dataset is the crate root, so it never needs a reference. -->
    <div v-if="!isDataset && references.length" class="rounded-lg border border-border bg-card px-3 py-2 text-[11px] text-muted-foreground">
      <div class="mb-1 flex items-center gap-1.5 font-medium text-foreground">
        <Link2 class="h-3.5 w-3.5" /> Referenced by
      </div>
      <ul class="space-y-0.5">
        <li v-for="(reference, index) in references" :key="index" class="flex flex-wrap items-center gap-1">
          <Badge :variant="obligationBadgeVariant(reference.obligation)" class="text-[10px]">{{ PROFILE_OBLIGATION_LABELS[reference.obligation].label }}</Badge>
          <span>- referenced by <code class="rounded bg-muted px-1 text-foreground">{{ reference.valueName }}</code> on {{ reference.entityLabel }}</span>
        </li>
      </ul>
    </div>
    <div v-else-if="!isDataset" class="rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2.5 text-[11px] text-amber-800 dark:text-amber-300">
      <div class="flex items-center gap-1.5 font-medium">
        <TriangleAlert class="h-3.5 w-3.5" /> Not referenced yet
      </div>
      <p class="mt-1">This rule generates no inputs or validation until a property references it. Add an entity-reference property on another entity that points here.</p>
      <div class="mt-2 flex flex-wrap items-center gap-2">
        <span>Add reference property on</span>
        <Select v-model="ownerIndex" :options="ownerOptions" class="min-w-[160px]" />
        <Button type="button" variant="outline" size="sm" @click="addReference">
          <Plus class="h-3.5 w-3.5" /> Add reference
        </Button>
      </div>
    </div>

    <div class="grid gap-3 sm:grid-cols-2">
      <div>
        <label class="text-xs font-medium text-foreground">Label</label>
        <Input v-model="entity.label" class="mt-1" placeholder="Root Dataset" :disabled="locked" />
      </div>
      <div>
        <label class="text-xs font-medium text-foreground">Type</label>
        <Select
          :model-value="typeSelectValue"
          :options="typeOptions"
          class="mt-1"
          :disabled="locked"
          @update:model-value="onTypeSelect"
        />
        <div v-if="customMode" class="mt-1.5">
          <Input v-model="entity.type" placeholder="Search the vocabulary, or paste a type URI" @blur="commitCustomType" @keydown.enter="commitCustomType" />
          <VocabSuggestions :query="entity.type" kind="class" @pick="applyVocabClass" />
          <p class="mt-1 text-[11px] text-muted-foreground">Plain names map to schema.org: resolves to <code>{{ normalizeTypeUri(entity.type) || 'http://schema.org/…' }}</code></p>
        </div>
      </div>
      <!-- Class name (D3): editable for custom types, derived for schema.org. It is
           the short alias keying mode.classes / schema $defs / the crate @context. -->
      <div class="sm:col-span-2">
        <label class="text-xs font-medium text-foreground">Class name</label>
        <template v-if="isCustomType">
          <Input v-model="entity.className" class="mt-1" :placeholder="derivedClassName || 'Specimen'" :disabled="locked" />
          <p v-if="classNameError" class="mt-1 text-[11px] text-destructive">{{ classNameError }}</p>
          <p v-else class="mt-1 text-[11px] text-muted-foreground">The short class alias used in the mode file, schema, and crate <code>@context</code>.</p>
        </template>
        <template v-else>
          <p v-if="schemaOrgAlias" class="mt-1 text-[11px] text-muted-foreground">
            Imported class alias <code class="rounded bg-muted px-1">{{ schemaOrgAlias }}</code> (schema.org type <code class="rounded bg-muted px-1">{{ derivedClassName }}</code>).
          </p>
          <p v-else class="mt-1 text-[11px] text-muted-foreground">Derived from the type: <code class="rounded bg-muted px-1">{{ derivedClassName || 'Thing' }}</code></p>
        </template>
      </div>
      <div class="sm:col-span-2">
        <label class="text-xs font-medium text-foreground">Description</label>
        <Textarea v-model="entity.description" class="mt-1" rows="2" placeholder="What this entity represents in the crate." :disabled="locked" />
      </div>
    </div>

    <div class="flex items-center justify-between border-t border-border pt-3">
      <div class="text-xs font-semibold text-foreground">Property rules</div>
      <button
        v-if="!locked"
        type="button"
        class="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-destructive"
        @click="builder.removeEntity(entityIndex)"
      >
        <Trash2 class="h-3 w-3" /> Remove this entity
      </button>
    </div>

    <div class="space-y-2">
      <div v-if="baselineProperties.length" class="rounded-lg border border-border bg-muted/20">
        <button
          type="button"
          class="flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] font-medium text-muted-foreground hover:text-foreground"
          @click="showBaseline = !showBaseline"
        >
          <component :is="showBaseline ? ChevronDown : ChevronRight" class="h-3.5 w-3.5 shrink-0" />
          <Lock class="h-3 w-3 shrink-0" />
          RO-Crate baseline rules ({{ baselineProperties.length }}), always applied, shown for reference
        </button>
        <div v-if="showBaseline" class="space-y-2 border-t border-border p-2">
          <PropertyRuleCard
            v-for="property in baselineProperties"
            :key="property.uid"
            :builder="builder"
            :property="property"
            :entity-type-name="entityTypeLabel(entity.type)"
            :owner-type="normalizeTypeUri(entity.type)"
            :slug="builder.slug"
            @remove="removePropertyDraft(property)"
          />
        </div>
      </div>
      <PropertyRuleCard
        v-for="property in editableProperties"
        :key="property.uid"
        :builder="builder"
        :property="property"
        :entity-type-name="entityTypeLabel(entity.type)"
        :owner-type="normalizeTypeUri(entity.type)"
        :slug="builder.slug"
        @remove="removePropertyDraft(property)"
      />
      <p v-if="!entity.properties.length" class="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
        No property rules yet. Add one to describe a value that entities of this type should carry.
      </p>
      <p v-else-if="!editableProperties.length" class="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
        No additional property rules beyond the RO-Crate baseline yet. Add one to describe a value that entities of this type should carry.
      </p>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" size="sm" @click="builder.addProperty(entity)">
        <Plus class="h-3.5 w-3.5" /> Add property rule
      </Button>
      <span class="text-[11px] text-muted-foreground">Examples:</span>
      <Button
        v-for="template in PROPERTY_RULE_TEMPLATES"
        :key="template.key"
        type="button"
        variant="subtle"
        size="sm"
        @click="builder.addPropertyTemplate(entity, template)"
      >
        <Plus class="h-3.5 w-3.5" /> {{ template.label }}
      </Button>
    </div>
  </div>
</template>
