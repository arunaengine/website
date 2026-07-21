<script setup lang="ts">
import { computed, ref } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Textarea from '@/components/ui/Textarea.vue'
import PropertyRuleRow from './PropertyRuleRow.vue'
import PropertyTermPicker from './PropertyTermPicker.vue'
import ClassPropertyChecklist from './ClassPropertyChecklist.vue'
import { Settings2, Trash2, TriangleAlert } from '@lucide/vue'
import { PROFILE_OBLIGATION_LABELS, obligationBadgeVariant } from '@/lib/profiles/labels'
import { entityTypeLabel } from '@/lib/profiles/entityTypes'
import { isSchemaOrgUri } from '@/lib/profiles/propertyCatalog'
import { isDatasetType, normalizeTypeUri } from '@/lib/profiles/uri'
import type { DraftEntityRule, ProfileBuilder } from './useProfileBuilder'

// One reusable entity shape (plan 6.2): header with derived obligation and
// where it is used, conditional-copy framing for non-root shapes, the compact
// property rows, and the single Add-property picker. Shape metadata (label,
// description, custom type/class name, removal) sits behind a Details
// disclosure so the default surface stays rule-first.
const props = defineProps<{
  builder: ProfileBuilder
  entity: DraftEntityRule
}>()

const showDetails = ref(false)

const isRoot = computed(() => props.entity.lock === 'full')
const isCustomType = computed(() => !isSchemaOrgUri(normalizeTypeUri(props.entity.type)))

const references = computed(() => props.builder.entityReferences(props.entity.type))
const derived = computed(() => props.builder.entityObligation(props.entity.type))
const isUnreferenced = computed(
  () => !isRoot.value && !isDatasetType(normalizeTypeUri(props.entity.type)) && references.value.length === 0,
)

const rootEntity = computed(() => props.builder.entities.find((entity) => entity.lock === 'full') ?? props.builder.entities[0])

function referenceFromRoot() {
  if (rootEntity.value && rootEntity.value !== props.entity) {
    props.builder.addReferenceProperty(rootEntity.value, props.entity)
  }
}

function removeShape() {
  const index = props.builder.entities.indexOf(props.entity)
  if (index >= 0) props.builder.removeEntity(index)
}
</script>

<template>
  <section :id="`shape-${entity.uid}`" class="scroll-mt-20 rounded-xl border border-border bg-card">
    <header class="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border px-4 py-2.5">
      <h4 class="text-sm font-semibold text-foreground">{{ entity.label || 'Untitled entity' }}</h4>
      <span class="text-[11px] text-muted-foreground">{{ entityTypeLabel(entity.type) }}</span>
      <Badge v-if="isRoot" variant="royal">Root Dataset</Badge>
      <Badge
        v-else-if="!isUnreferenced"
        :variant="obligationBadgeVariant(derived.obligation)"
        :title="derived.via ? `Derived from ${derived.via.valueName} on ${derived.via.entityLabel}` : undefined"
      >
        {{ PROFILE_OBLIGATION_LABELS[derived.obligation].label }}
      </Badge>
      <span
        v-for="reference in references"
        :key="`${reference.entityLabel}-${reference.valueName}`"
        class="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"
      >
        via {{ reference.valueName }} on {{ reference.entityLabel }}
      </span>
      <span class="flex-1"></span>
      <Button type="button" variant="ghost" size="sm" class="text-muted-foreground" :aria-expanded="showDetails" @click="showDetails = !showDetails">
        <Settings2 class="size-3.5" /> Details
      </Button>
    </header>

    <p v-if="!isRoot" class="border-b border-border px-4 py-1.5 text-[11px] text-muted-foreground">
      Applied when a {{ entity.label || entityTypeLabel(entity.type) }} is described; it does not require one to exist on its own.
    </p>

    <div v-if="showDetails" class="grid gap-3 border-b border-border px-4 py-3 sm:grid-cols-2">
      <div>
        <label class="text-[11px] font-medium text-muted-foreground">Label</label>
        <Input v-model="entity.label" class="mt-0.5" :disabled="isRoot" />
      </div>
      <div v-if="isCustomType">
        <label class="text-[11px] font-medium text-muted-foreground">Class name</label>
        <Input v-model="entity.className" class="mt-0.5" placeholder="e.g. Specimen" />
      </div>
      <div v-else class="flex flex-col justify-end pb-1 text-[11px] text-muted-foreground">
        <span class="break-all font-mono">{{ normalizeTypeUri(entity.type) }}</span>
      </div>
      <div v-if="isCustomType" class="sm:col-span-2">
        <label class="text-[11px] font-medium text-muted-foreground">Type URI</label>
        <Input v-model="entity.type" class="mt-0.5 font-mono" :disabled="isRoot" placeholder="https://…" />
      </div>
      <div class="sm:col-span-2">
        <label class="text-[11px] font-medium text-muted-foreground">Description</label>
        <Textarea v-model="entity.description" class="mt-0.5" rows="2" :disabled="isRoot" />
      </div>
      <div v-if="!isRoot" class="sm:col-span-2">
        <Button type="button" variant="outline" size="sm" class="text-destructive hover:bg-destructive/10" @click="removeShape">
          <Trash2 class="size-3.5" /> Remove this shape and its rules
        </Button>
      </div>
    </div>

    <div
      v-if="isUnreferenced"
      class="flex flex-wrap items-center gap-2 border-b border-amber-500/30 bg-amber-500/5 px-4 py-2 text-[11px] text-amber-800 dark:text-amber-300"
    >
      <TriangleAlert class="size-3.5 shrink-0" />
      <span>Nothing references this shape yet, so it has no effect.</span>
      <Button v-if="rootEntity && rootEntity !== entity" type="button" variant="outline" size="sm" @click="referenceFromRoot">
        Reference it from {{ rootEntity.label || 'the Root Dataset' }}
      </Button>
    </div>

    <div class="space-y-1.5 p-3">
      <PropertyRuleRow
        v-for="(property, index) in entity.properties"
        :key="property.uid"
        :builder="builder"
        :entity="entity"
        :property="property"
        @remove="builder.removeProperty(entity, index)"
      />
      <p v-if="!entity.properties.length" class="rounded-md border border-dashed border-border px-3 py-2 text-[11px] text-muted-foreground">
        No rules yet. Add the properties a {{ entity.label || entityTypeLabel(entity.type) }} must, should or may carry.
      </p>
      <div class="space-y-1.5 pt-1">
        <PropertyTermPicker :builder="builder" :entity="entity" />
        <ClassPropertyChecklist :builder="builder" :entity="entity" />
      </div>
    </div>
  </section>
</template>
