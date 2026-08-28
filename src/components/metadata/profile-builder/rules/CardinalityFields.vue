<script setup lang="ts">
import Input from '@/components/ui/Input.vue'
import type { DraftPropertyRule } from '../useProfileBuilder'

defineProps<{
  property: DraftPropertyRule
  disabled: boolean
  error: string
}>()
</script>

<template>
  <div class="grid gap-2 sm:grid-cols-2">
    <div>
      <label class="text-[11px] font-medium text-muted-foreground">Min entries</label>
      <Input v-model="property.minItems" type="number" min="1" class="mt-0.5" placeholder="optional" :disabled="disabled" :invalid="error ? 'error' : undefined" />
    </div>
    <div>
      <label class="text-[11px] font-medium text-muted-foreground">Max entries</label>
      <Input v-model="property.maxItems" type="number" min="1" class="mt-0.5" placeholder="optional" :disabled="disabled" :invalid="error ? 'error' : undefined" />
    </div>
    <p v-if="error" class="text-[11px] text-destructive sm:col-span-2">{{ error }}</p>
  </div>
</template>
