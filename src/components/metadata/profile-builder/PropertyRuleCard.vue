<script setup lang="ts">
import { computed, ref } from 'vue'
import Input from '@/components/ui/Input.vue'
import Textarea from '@/components/ui/Textarea.vue'
import Select from '@/components/ui/Select.vue'
import Switch from '@/components/ui/Switch.vue'
import Badge from '@/components/ui/Badge.vue'
import { ChevronDown, ChevronRight, Trash2 } from '@lucide/vue'
import { PROFILE_OBLIGATION_LABELS, PROFILE_VALUE_KIND_LABELS } from '@/lib/profiles/labels'
import {
  OBLIGATION_OPTIONS,
  VALUE_KIND_OPTIONS,
  obligationBadgeVariant,
  propertyName,
  trimmed,
  type DraftPropertyRule,
} from './useProfileBuilder'

const props = defineProps<{
  property: DraftPropertyRule
  entityTypeName: string
}>()
const emit = defineEmits<{ (e: 'remove'): void }>()

// Never capture the reactive prop by value: with index keys, removing a card
// used to leave surviving cards bound to the wrong (or a deleted) draft. Read
// through a computed so the card always tracks its live prop; the parent keys
// each card on the draft uid so it stays pinned to one draft.
const property = computed(() => props.property)
const expanded = ref(false)

const lengthKinds: DraftPropertyRule['kind'][] = ['text', 'longtext', 'email']
const numericKinds: DraftPropertyRule['kind'][] = ['integer', 'number']

function autofillName() {
  if (!trimmed(property.value.valueName)) property.value.valueName = propertyName(trimmed(property.value.label))
}
</script>

<template>
  <div class="rounded-lg border border-border bg-background p-3">
    <!-- Plain-English framing of what this rule means. -->
    <p class="text-xs text-muted-foreground">
      Each <b class="text-foreground">{{ entityTypeName }}</b>
      <Badge :variant="obligationBadgeVariant(property.obligation)" class="mx-1">{{ property.obligation }}</Badge>
      have
      <code class="rounded bg-muted px-1 py-0.5 text-[11px] text-foreground">{{ property.valueName || 'property' }}</code>
      ({{ PROFILE_VALUE_KIND_LABELS[property.kind] }})
    </p>

    <!-- Always-visible core row -->
    <div class="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      <div>
        <label class="text-[11px] font-medium text-muted-foreground">Label</label>
        <Input v-model="property.label" class="mt-0.5" placeholder="License" @blur="autofillName" />
      </div>
      <div>
        <label class="text-[11px] font-medium text-muted-foreground">Property name</label>
        <Input v-model="property.valueName" class="mt-0.5" placeholder="license" />
      </div>
      <div>
        <label class="text-[11px] font-medium text-muted-foreground">Value type</label>
        <Select v-model="property.kind" :options="VALUE_KIND_OPTIONS" class="mt-0.5" />
      </div>
      <div>
        <label class="text-[11px] font-medium text-muted-foreground">Obligation</label>
        <Select v-model="property.obligation" :options="OBLIGATION_OPTIONS" class="mt-0.5" />
      </div>
    </div>
    <p class="mt-1 text-[11px] text-muted-foreground">{{ PROFILE_OBLIGATION_LABELS[property.obligation].help }}</p>

    <div class="mt-2 flex items-center justify-between">
      <button
        type="button"
        class="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
        @click="expanded = !expanded"
      >
        <component :is="expanded ? ChevronDown : ChevronRight" class="h-3.5 w-3.5" />
        More options
      </button>
      <button
        type="button"
        class="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-destructive"
        @click="emit('remove')"
      >
        <Trash2 class="h-3 w-3" /> Remove property rule
      </button>
    </div>

    <!-- Collapsible advanced constraints -->
    <div v-if="expanded" class="mt-2 grid gap-2 border-t border-border pt-3 sm:grid-cols-2 lg:grid-cols-3">
      <div class="sm:col-span-2 lg:col-span-3">
        <label class="text-[11px] font-medium text-muted-foreground">Description shown to users</label>
        <Input v-model="property.description" class="mt-0.5" placeholder="What this value should contain." />
      </div>
      <div>
        <label class="text-[11px] font-medium text-muted-foreground">Example value</label>
        <Input v-model="property.example" class="mt-0.5" placeholder="https://creativecommons.org/licenses/by/4.0/" />
      </div>
      <div>
        <label class="text-[11px] font-medium text-muted-foreground">Default value</label>
        <Input v-model="property.defaultValue" class="mt-0.5" />
      </div>
      <div v-if="property.kind === 'enum'" class="sm:col-span-2 lg:col-span-3">
        <label class="text-[11px] font-medium text-muted-foreground">Allowed values</label>
        <Input v-model="property.enumOptions" class="mt-0.5" placeholder="LC-MS, MALDI-TOF" />
        <p class="mt-0.5 text-[11px] text-muted-foreground">Comma-separated list of the values users may pick.</p>
      </div>
      <div v-if="property.kind !== 'boolean' && property.kind !== 'enum'">
        <label class="text-[11px] font-medium text-muted-foreground">Pattern (regex)</label>
        <Input v-model="property.pattern" class="mt-0.5" placeholder="^[A-Z][a-z]+ [a-z]+$" />
      </div>
      <div v-if="lengthKinds.includes(property.kind)">
        <label class="text-[11px] font-medium text-muted-foreground">Min length</label>
        <Input v-model="property.minLength" type="number" class="mt-0.5" />
      </div>
      <div v-if="lengthKinds.includes(property.kind)">
        <label class="text-[11px] font-medium text-muted-foreground">Max length</label>
        <Input v-model="property.maxLength" type="number" class="mt-0.5" />
      </div>
      <div v-if="numericKinds.includes(property.kind)">
        <label class="text-[11px] font-medium text-muted-foreground">Min value</label>
        <Input v-model="property.minValue" type="number" class="mt-0.5" />
      </div>
      <div v-if="numericKinds.includes(property.kind)">
        <label class="text-[11px] font-medium text-muted-foreground">Max value</label>
        <Input v-model="property.maxValue" type="number" class="mt-0.5" />
      </div>
      <div v-if="numericKinds.includes(property.kind)">
        <label class="text-[11px] font-medium text-muted-foreground">Step</label>
        <Input v-model="property.stepValue" type="number" class="mt-0.5" />
      </div>
      <label class="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-xs sm:col-span-2 lg:col-span-3">
        <span>
          Allow multiple values
          <span class="block text-[11px] text-muted-foreground">Users can supply a list instead of a single value.</span>
        </span>
        <Switch :checked="property.multipleValues" @update:checked="(value: boolean) => (property.multipleValues = value)" />
      </label>
    </div>
  </div>
</template>
