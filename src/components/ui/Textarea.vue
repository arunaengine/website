<script setup lang="ts">
import { computed } from 'vue'
import { cn } from '@/lib/utils'
import { useVModel } from '@vueuse/core'

const props = defineProps<{ class?: string; modelValue?: string }>()
const emits = defineEmits<{ (e: 'update:modelValue', value: string): void }>()
const modelValue = useVModel(props, 'modelValue', emits, { passive: true })

const classes = computed(() =>
  cn(
    'flex w-full rounded-md border border-input bg-field px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 font-mono leading-relaxed',
    props.class,
  ),
)
</script>

<template>
  <textarea v-model="modelValue" :class="classes" />
</template>
