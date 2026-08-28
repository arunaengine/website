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
  <div>
    <label class="text-[11px] font-medium text-muted-foreground">Allowed values</label>
    <Input v-model="property.enumOptions" class="mt-0.5" placeholder="LC-MS, MALDI-TOF" :disabled="disabled" :invalid="error ? 'error' : undefined" />
    <p v-if="error" class="mt-0.5 text-[11px] text-destructive">{{ error }}</p>
    <p v-else class="mt-0.5 text-[11px] text-muted-foreground">Comma-separated list of the values users may pick.</p>
  </div>
</template>
