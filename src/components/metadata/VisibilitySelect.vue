<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import Select from '@/components/ui/Select.vue'
import { cn } from '@/lib/utils'

const props = defineProps<{
  modelValue: 'group' | 'public'
  groupId?: string
  /** Header form: the bare control, without its label and hint. */
  compact?: boolean
  class?: string
}>()
const emit = defineEmits<{ (e: 'update:modelValue', value: 'group' | 'public'): void }>()

const options = [
  { value: 'group', label: 'Group' },
  { value: 'public', label: 'Public' },
]
const hint = computed(() =>
  props.modelValue === 'group'
    ? 'Members of the group, as its policies allow.'
    : 'Visible to anyone without signing in.',
)
</script>

<template>
  <Select
    v-if="compact"
    :model-value="modelValue"
    :options="options"
    :class="cn('h-7 w-28 text-xs', props.class)"
    aria-label="Dataset visibility"
    @update:model-value="(value: string) => emit('update:modelValue', value as 'group' | 'public')"
  />
  <div v-else>
    <label class="text-xs font-medium text-foreground">Visibility</label>
    <Select
      :model-value="modelValue"
      :options="options"
      class="mt-1"
      aria-label="Dataset visibility"
      @update:model-value="(value: string) => emit('update:modelValue', value as 'group' | 'public')"
    />
    <p class="mt-1 text-[11px] text-muted-foreground">
      {{ hint }}
      <RouterLink
        v-if="groupId"
        :to="{ name: 'group', params: { id: groupId }, hash: '#policies' }"
        class="font-medium text-primary hover:underline"
      >Group policies</RouterLink>
    </p>
  </div>
</template>
