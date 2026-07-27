<script setup lang="ts">
import { computed } from 'vue'
import EntityShapeSection from './EntityShapeSection.vue'
import EntityTypePicker from './EntityTypePicker.vue'
import LiftNotesPanel from './LiftNotesPanel.vue'
import { PROFILE_OBLIGATION_LABELS } from '@/lib/profiles/labels'
import { entityTypeLabel } from '@/lib/profiles/entityTypes'
import { normalizeTypeUri, sameSchemaOrgType } from '@/lib/profiles/uri'
import type { DraftEntityRule, ProfileBuilder } from './useProfileBuilder'

// Rule-first outline (plan 6.2): the step opens on the Root Dataset shape and
// lists every shared entity shape as its own section of compact sentence rows.
// The old master/detail editor is gone; shapes are usually created implicitly
// by entity-valued rules ("Add Person rules"), with an explicit add as fallback.
const props = defineProps<{ builder: ProfileBuilder }>()
const builder = props.builder

// Beyond a handful of shapes the sections start collapsed, so an imported
// profile opens as a readable outline rather than one unbroken scroll.
const COLLAPSE_ABOVE = 3

// Root Dataset first, then the shapes it reaches, breadth first: a reader
// follows the same path the data does, instead of the order the shapes happened
// to be declared in. Anything unreachable keeps its draft order at the end.
const orderedEntities = computed(() => {
  const remaining = [...builder.entities]
  const rootIndex = remaining.findIndex((entity) => entity.lock === 'full')
  const queue = rootIndex >= 0 ? remaining.splice(rootIndex, 1) : remaining.splice(0, 1)
  const ordered: DraftEntityRule[] = []
  while (queue.length) {
    const entity = queue.shift()
    if (!entity) continue
    ordered.push(entity)
    for (const property of entity.properties) {
      if (property.kind !== 'entity') continue
      for (const target of property.entityTypes) {
        const next = remaining.findIndex((candidate) => sameSchemaOrgType(normalizeTypeUri(candidate.type), normalizeTypeUri(target)))
        if (next >= 0) queue.push(...remaining.splice(next, 1))
      }
    }
  }
  return [...ordered, ...remaining]
})

const collapsed = computed(() => orderedEntities.value.length > COLLAPSE_ABOVE)

function scrollToShape(uid: number) {
  document.getElementById(`shape-${uid}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
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

    <!-- Imported SHACL the rules below could not fully express, shown here so it
         is obvious which parts of the file have no field. -->
    <LiftNotesPanel :notes="builder.liftNotes" :attached="Boolean(builder.customShapesText.trim())" />

    <!-- Jump list for a profile with many shapes; it sticks so the outline stays
         reachable from anywhere in a long step. -->
    <nav
      v-if="collapsed"
      class="sticky top-0 z-10 -mx-1 flex flex-wrap items-center gap-1 rounded-lg border border-border bg-card/95 px-2 py-1.5 backdrop-blur"
    >
      <span class="px-1 text-[11px] font-medium text-muted-foreground">{{ orderedEntities.length }} shapes</span>
      <button
        v-for="entity in orderedEntities"
        :key="entity.uid"
        type="button"
        class="rounded-full px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
        @click="scrollToShape(entity.uid)"
      >
        {{ entity.label || entityTypeLabel(entity.type) }}
      </button>
    </nav>

    <EntityShapeSection
      v-for="entity in orderedEntities"
      :key="entity.uid"
      :builder="builder"
      :entity="entity"
      :default-open="!collapsed || entity.lock === 'full'"
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
