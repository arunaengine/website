<script setup lang="ts">
import { computed } from 'vue'
import { cn } from '@/lib/utils'
import { useVModel } from '@vueuse/core'

const props = defineProps<{
  class?: string
  modelValue?: string | number
  defaultValue?: string | number
}>()
const emits = defineEmits<{ (e: 'update:modelValue', value: string | number): void }>()
const modelValue = useVModel(props, 'modelValue', emits, {
  passive: true,
  defaultValue: props.defaultValue,
})

const classes = computed(() =>
  cn(
    'flex h-9 w-full rounded-md border border-input bg-field px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
    props.class,
  ),
)
</script>

<template>
  <input v-model="modelValue" :class="classes" />
</template>
