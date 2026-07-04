<script setup lang="ts">
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import EntityRuleEditor from './EntityRuleEditor.vue'
import { Plus } from '@lucide/vue'
import { PROFILE_OBLIGATION_LABELS } from '@/lib/profiles/labels'
import { obligationBadgeVariant, shortTypeName, type ProfileBuilder } from './useProfileBuilder'

const props = defineProps<{ builder: ProfileBuilder }>()
const builder = props.builder
</script>

<template>
  <section class="space-y-4">
    <div>
      <h4 class="text-sm font-semibold text-foreground">Entity rules</h4>
      <p class="text-xs text-muted-foreground">
        Describe which RO-Crate entities a conforming crate must contain and the property rules for each one.
        Obligations follow RFC 2119 — <b>MUST</b>: {{ PROFILE_OBLIGATION_LABELS.MUST.help }}; <b>SHOULD</b>: {{ PROFILE_OBLIGATION_LABELS.SHOULD.help }}; <b>MAY</b>: {{ PROFILE_OBLIGATION_LABELS.MAY.help }}.
      </p>
    </div>

    <div class="grid gap-4 lg:grid-cols-[260px_1fr]">
      <!-- Master: entity rule list -->
      <div class="space-y-2">
        <ul class="space-y-2">
          <li v-for="(entity, index) in builder.entities" :key="index">
            <button
              type="button"
              class="w-full rounded-lg border p-3 text-left transition-colors"
              :class="index === builder.selectedEntityIndex ? 'border-primary/60 bg-primary/5' : 'border-border hover:border-primary/40'"
              @click="builder.selectEntity(index)"
            >
              <div class="flex items-center justify-between gap-2">
                <span class="truncate text-sm font-medium text-foreground">{{ entity.label || 'Untitled entity' }}</span>
                <Badge :variant="obligationBadgeVariant(entity.obligation)" class="shrink-0">{{ entity.obligation }}</Badge>
              </div>
              <div class="mt-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                <span class="truncate">{{ shortTypeName(entity.type) }}</span>
                <span class="shrink-0">{{ entity.properties.length }} {{ entity.properties.length === 1 ? 'property rule' : 'property rules' }}</span>
              </div>
            </button>
          </li>
        </ul>
        <Button type="button" variant="outline" size="sm" class="w-full" @click="builder.addEntity()">
          <Plus class="h-3.5 w-3.5" /> Add entity rule
        </Button>
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
