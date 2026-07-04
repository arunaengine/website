<script setup lang="ts">
import { computed } from 'vue'
import Input from '@/components/ui/Input.vue'
import Textarea from '@/components/ui/Textarea.vue'
import Select from '@/components/ui/Select.vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import PropertyRuleCard from './PropertyRuleCard.vue'
import { Plus, Trash2 } from '@lucide/vue'
import { PROFILE_OBLIGATION_LABELS } from '@/lib/profiles/labels'
import {
  OBLIGATION_OPTIONS,
  normalizeTypeInput,
  obligationBadgeVariant,
  shortTypeName,
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
</script>

<template>
  <div class="space-y-4 rounded-xl border border-border bg-muted/20 p-4">
    <p class="text-sm text-muted-foreground">
      This profile
      <Badge :variant="obligationBadgeVariant(entity.obligation)" class="mx-1">{{ entity.obligation }}</Badge>
      include an entity of type <b class="text-foreground">{{ shortTypeName(entity.type) }}</b>.
    </p>

    <div class="grid gap-3 sm:grid-cols-2">
      <div>
        <label class="text-xs font-medium text-foreground">Label</label>
        <Input v-model="entity.label" class="mt-1" placeholder="Root Dataset" />
      </div>
      <div>
        <label class="text-xs font-medium text-foreground">Obligation</label>
        <Select v-model="entity.obligation" :options="OBLIGATION_OPTIONS" class="mt-1" />
        <p class="mt-1 text-[11px] text-muted-foreground">{{ PROFILE_OBLIGATION_LABELS[entity.obligation].help }}</p>
      </div>
      <div>
        <label class="text-xs font-medium text-foreground">Type</label>
        <Input v-model="entity.type" class="mt-1" placeholder="Dataset" />
        <p class="mt-1 text-[11px] text-muted-foreground">Plain names map to schema.org: resolves to <code>{{ normalizeTypeInput(entity.type) || 'http://schema.org/…' }}</code></p>
      </div>
      <div>
        <label class="text-xs font-medium text-foreground">Example @id</label>
        <Input v-model="entity.exampleId" class="mt-1" placeholder="./ or #person-ada-lovelace" />
      </div>
      <div class="sm:col-span-2">
        <label class="text-xs font-medium text-foreground">Description</label>
        <Textarea v-model="entity.description" class="mt-1" rows="2" placeholder="What this entity represents in the crate." />
      </div>
    </div>

    <div class="flex items-center justify-between border-t border-border pt-3">
      <div class="text-xs font-semibold text-foreground">Property rules</div>
      <button
        type="button"
        class="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-destructive"
        @click="builder.removeEntity(entityIndex)"
      >
        <Trash2 class="h-3 w-3" /> Remove this entity
      </button>
    </div>

    <div class="space-y-2">
      <PropertyRuleCard
        v-for="(property, propertyIndex) in entity.properties"
        :key="property.uid"
        :property="property"
        :entity-type-name="shortTypeName(entity.type)"
        @remove="builder.removeProperty(entity, propertyIndex)"
      />
      <p v-if="!entity.properties.length" class="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
        No property rules yet. Add one to describe a value that entities of this type should carry.
      </p>
    </div>

    <Button type="button" variant="outline" size="sm" @click="builder.addProperty(entity)">
      <Plus class="h-3.5 w-3.5" /> Add property rule
    </Button>
  </div>
</template>
