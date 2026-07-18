<script setup lang="ts">
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import EntityRuleEditor from './EntityRuleEditor.vue'
import { Plus, TriangleAlert } from '@lucide/vue'
import { PROFILE_OBLIGATION_LABELS, obligationBadgeVariant } from '@/lib/profiles/labels'
import { entityTypeLabel } from '@/lib/profiles/entityTypes'
import { isDatasetType, normalizeTypeUri } from '@/lib/profiles/uri'
import { ENTITY_RULE_TEMPLATES, type DraftEntityRule, type ProfileBuilder } from './useProfileBuilder'

const props = defineProps<{ builder: ProfileBuilder }>()
const builder = props.builder

// Read-only derived obligation for the master-list badge.
function derivedObligation(type: string) {
  return builder.entityObligation(type).obligation
}

// H1: a non-Dataset entity rule that nothing references is inert. Flag it on the
// master list with an amber warning icon instead of an obligation badge, so the
// "entity rule ignored" trap is impossible to miss in the list itself.
function isUnreferenced(entity: DraftEntityRule): boolean {
  if (entity.lock || isDatasetType(normalizeTypeUri(entity.type))) return false
  return builder.entityReferences(entity.type).length === 0
}
</script>

<template>
  <section class="space-y-4">
    <div>
      <h4 class="text-sm font-semibold text-foreground">Entity rules</h4>
      <p class="text-xs text-muted-foreground">
        Describe which RO-Crate entities a conforming crate must contain and the property rules for each one.
        Obligations follow RFC 2119, <b>MUST</b>: {{ PROFILE_OBLIGATION_LABELS.MUST.help }}; <b>SHOULD</b>: {{ PROFILE_OBLIGATION_LABELS.SHOULD.help }}; <b>MAY</b>: {{ PROFILE_OBLIGATION_LABELS.MAY.help }}.
      </p>
    </div>

    <!-- How the pieces fit together (D6): the builder confused authors, so lead
         with a short, concrete explainer before the master/detail editor. -->
    <div class="space-y-1 rounded-lg border border-border bg-muted/30 px-4 py-3 text-[11px] leading-relaxed text-muted-foreground">
      <p><b class="text-foreground">Entities</b> are the building blocks, the Root Dataset, plus any Person, Organization or custom type your crate should describe.</p>
      <p><b class="text-foreground">Properties</b> describe each entity (a name, a date, an identifier…).</p>
      <p>To <b class="text-foreground">link</b> entities, add a property with value type <b class="text-foreground">Entity reference</b> and pick the target, e.g. an <code class="rounded bg-muted px-1">author</code> on the Root Dataset that references a Person.</p>
      <p>An entity rule only takes effect once something references it; its <b class="text-foreground">obligation is derived</b> from the referencing property.</p>
    </div>

    <div class="grid gap-4 lg:grid-cols-[260px_1fr]">
      <!-- Master: entity rule list -->
      <div class="space-y-2">
        <ul class="space-y-2">
          <li v-for="(entity, index) in builder.entities" :key="entity.uid">
            <button
              type="button"
              class="w-full rounded-lg border p-3 text-left transition-colors"
              :class="index === builder.selectedEntityIndex ? 'border-primary/60 bg-primary/5' : 'border-border hover:border-primary/40'"
              @click="builder.selectEntity(index)"
            >
              <div class="flex items-center justify-between gap-2">
                <span class="truncate text-sm font-medium text-foreground">{{ entity.label || 'Untitled entity' }}</span>
                <Badge v-if="entity.lock" variant="royal" class="shrink-0">Root</Badge>
                <TriangleAlert
                  v-else-if="isUnreferenced(entity)"
                  class="h-4 w-4 shrink-0 text-amber-500"
                  title="Not referenced by any property, this rule generates nothing yet"
                />
                <Badge v-else :variant="obligationBadgeVariant(derivedObligation(entity.type))" class="shrink-0">{{ PROFILE_OBLIGATION_LABELS[derivedObligation(entity.type)].label }}</Badge>
              </div>
              <div class="mt-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                <span class="truncate">{{ entityTypeLabel(entity.type) }}</span>
                <span class="shrink-0">{{ entity.properties.length }} {{ entity.properties.length === 1 ? 'property rule' : 'property rules' }}</span>
              </div>
            </button>
          </li>
        </ul>
        <Button type="button" variant="outline" size="sm" class="w-full" @click="builder.addEntity()">
          <Plus class="size-3.5" /> Add entity rule
        </Button>
        <div class="pt-1">
          <span class="text-[11px] text-muted-foreground">Examples, inserted as editable starting points:</span>
          <Button
            v-for="template in ENTITY_RULE_TEMPLATES"
            :key="template.key"
            type="button"
            variant="subtle"
            size="sm"
            class="mt-1 w-full"
            @click="builder.addEntityTemplate(template)"
          >
            <Plus class="size-3.5" /> Example: {{ template.label }}
          </Button>
        </div>
      </div>

      <!-- Detail: selected entity editor. Keyed on the stable draft uid so
           selecting a different entity remounts the editor on its own draft. -->
      <EntityRuleEditor
        v-if="builder.selectedEntity"
        :key="builder.selectedEntity.uid"
        :builder="builder"
        :entity="builder.selectedEntity"
        :entity-index="builder.selectedEntityIndex"
      />
      <div v-else class="flex items-center justify-center rounded-xl border border-dashed border-border p-8 text-sm text-muted-foreground">
        Add an entity rule to get started.
      </div>
    </div>
  </section>
</template>
