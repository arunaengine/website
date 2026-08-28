<script setup lang="ts">
import Input from '@/components/ui/Input.vue'
import type { DraftPropertyRule } from '../useProfileBuilder'

defineProps<{
  property: DraftPropertyRule
  disabled: boolean
}>()

const lengthKinds: DraftPropertyRule['kind'][] = ['text', 'longtext', 'email']
const numericKinds: DraftPropertyRule['kind'][] = ['integer', 'number']
</script>

<template>
  <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
    <div>
      <label class="text-[11px] font-medium text-muted-foreground">Example value</label>
      <Input v-model="property.example" class="mt-0.5" placeholder="https://creativecommons.org/licenses/by/4.0/" :disabled="disabled" />
    </div>
    <div>
      <label class="text-[11px] font-medium text-muted-foreground">Default value</label>
      <Input v-model="property.defaultValue" class="mt-0.5" :disabled="disabled" />
    </div>
    <div v-if="property.kind !== 'boolean' && property.kind !== 'enum'">
      <label class="text-[11px] font-medium text-muted-foreground">Pattern (regex)</label>
      <Input v-model="property.pattern" class="mt-0.5" placeholder="^[A-Z][a-z]+ [a-z]+$" :disabled="disabled" />
    </div>
    <div v-if="lengthKinds.includes(property.kind)">
      <label class="text-[11px] font-medium text-muted-foreground">Min length</label>
      <Input v-model="property.minLength" type="number" class="mt-0.5" :disabled="disabled" />
    </div>
    <div v-if="lengthKinds.includes(property.kind)">
      <label class="text-[11px] font-medium text-muted-foreground">Max length</label>
      <Input v-model="property.maxLength" type="number" class="mt-0.5" :disabled="disabled" />
    </div>
    <div v-if="numericKinds.includes(property.kind)">
      <label class="text-[11px] font-medium text-muted-foreground">Min value</label>
      <Input v-model="property.minValue" type="number" class="mt-0.5" :disabled="disabled" />
    </div>
    <div v-if="numericKinds.includes(property.kind)">
      <label class="text-[11px] font-medium text-muted-foreground">Max value</label>
      <Input v-model="property.maxValue" type="number" class="mt-0.5" :disabled="disabled" />
    </div>
    <div v-if="numericKinds.includes(property.kind)">
      <label class="text-[11px] font-medium text-muted-foreground">Step</label>
      <Input v-model="property.stepValue" type="number" class="mt-0.5" :disabled="disabled" />
    </div>
  </div>
</template>
