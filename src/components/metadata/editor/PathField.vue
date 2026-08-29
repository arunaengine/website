<script setup lang="ts">
import { computed } from 'vue'
import Input from '@/components/ui/Input.vue'
import Select from '@/components/ui/Select.vue'
import { joinPath, prefixLabel, splitPath, type PathPrefixOption } from '@/lib/crate/paths'
import { slugify } from '@/lib/profiles/emit'

// The dataset path as its two parts: a prefix picked from what the group
// offers and a slug that stays editable. Read-only once the dataset exists.
const props = defineProps<{
  modelValue: string
  options: PathPrefixOption[]
  readonly?: boolean
  loading?: boolean
}>()
const emit = defineEmits<{ (e: 'update:modelValue', value: string): void }>()

const parts = computed(() => splitPath(props.modelValue))
// A stored prefix the options do not list (an edited dataset) is still shown.
const options = computed(() => (props.options.some((option) => option.value === parts.value.prefix)
  ? props.options
  : [{ value: parts.value.prefix, label: prefixLabel(parts.value.prefix) }, ...props.options]))

function setPrefix(prefix: string) {
  emit('update:modelValue', joinPath(prefix, parts.value.slug))
}

function setSlug(slug: string) {
  emit('update:modelValue', joinPath(parts.value.prefix, slugify(slug)))
}
</script>

<template>
  <p
    v-if="readonly"
    class="flex h-9 items-center truncate rounded-md border border-dashed border-border px-3 font-mono text-xs text-foreground"
    :title="modelValue"
  >
    {{ modelValue || 'No path yet' }}
  </p>
  <div v-else class="flex items-center gap-1.5">
    <Select
      :model-value="parts.prefix"
      :options="options"
      class="h-9 w-44 shrink-0 font-mono text-xs"
      aria-label="Path prefix"
      :disabled="loading"
      @update:model-value="setPrefix"
    />
    <span class="text-sm text-muted-foreground" aria-hidden="true">/</span>
    <Input
      :model-value="parts.slug"
      class="min-w-0 flex-1 font-mono text-xs"
      aria-label="Dataset path"
      placeholder="dataset-name"
      @update:model-value="(value: string | number) => setSlug(String(value))"
    />
  </div>
</template>
