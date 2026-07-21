<script setup lang="ts">
import { computed } from 'vue'
import EntityShapeSection from './EntityShapeSection.vue'
import EntityTypePicker from './EntityTypePicker.vue'
import { PROFILE_OBLIGATION_LABELS } from '@/lib/profiles/labels'
import type { ProfileBuilder } from './useProfileBuilder'

// Rule-first outline (plan 6.2): the step opens on the Root Dataset shape and
// lists every shared entity shape as its own section of compact sentence rows.
// The old master/detail editor is gone; shapes are usually created implicitly
// by entity-valued rules ("Add Person rules"), with an explicit add as fallback.
const props = defineProps<{ builder: ProfileBuilder }>()
const builder = props.builder

// Root Dataset first, then every other shape in draft order.
const orderedEntities = computed(() => [
  ...builder.entities.filter((entity) => entity.lock === 'full'),
  ...builder.entities.filter((entity) => entity.lock !== 'full'),
])
</script>

<template>
  <section class="space-y-4">
    <div>
      <h4 class="text-sm font-semibold text-foreground">Rules</h4>
      <p class="text-xs text-muted-foreground">
        Each rule reads as a sentence: <em>Root Dataset must have Creator, a Person</em>.
        Start from the Root Dataset, add properties from common terms or terminology search, then set each rule's obligation,
        <b>Required</b>: {{ PROFILE_OBLIGATION_LABELS.MUST.help }}; <b>Recommended</b>: {{ PROFILE_OBLIGATION_LABELS.SHOULD.help }}; <b>Optional</b>: {{ PROFILE_OBLIGATION_LABELS.MAY.help }}.
        Rules for a Person, Organization or File apply when one is described; entity-valued rules link to those shared shapes.
      </p>
    </div>

    <EntityShapeSection
      v-for="entity in orderedEntities"
      :key="entity.uid"
      :builder="builder"
      :entity="entity"
    />

    <div class="space-y-1">
      <!-- Choosing a type first prevents the old trap of every new shape
           silently starting as a Person. Picking an existing shape's type
           simply navigates to it (addEntityRuleForType dedupes). -->
      <EntityTypePicker
        :builder="builder"
        button-label="Add entity shape"
        @pick="(choice) => builder.addEntityRuleForType(choice.uri, choice.label)"
      />
      <p class="text-[11px] text-muted-foreground">
        Tip: picking an entity-valued property (e.g. Creator) and choosing "Add Person rules" creates the shape for you.
      </p>
    </div>
  </section>
</template>
