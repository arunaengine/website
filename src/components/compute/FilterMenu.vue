<script setup lang="ts">
// A labeled multi-select filter: the trigger shows the choice, the menu has checkboxes with counts and Clear.
import { computed } from 'vue'
import Button from '@/components/ui/Button.vue'
import DropdownMenu from '@/components/ui/DropdownMenu.vue'
import DropdownMenuTrigger from '@/components/ui/DropdownMenuTrigger.vue'
import DropdownMenuContent from '@/components/ui/DropdownMenuContent.vue'
import DropdownMenuItem from '@/components/ui/DropdownMenuItem.vue'
import DropdownMenuSeparator from '@/components/ui/DropdownMenuSeparator.vue'
import type { FilterChipOption } from '@/components/ui/FilterChips.vue'
import { Check, ChevronDown, X } from '@lucide/vue'

const props = defineProps<{ label: string; options: FilterChipOption[]; modelValue: string[] }>()
const emit = defineEmits<{ (e: 'update:modelValue', value: string[]): void }>()

const chosen = computed(() => props.options.filter((option) => props.modelValue.includes(option.value)).map((option) => option.label))

function toggle(value: string) {
  emit('update:modelValue', props.modelValue.includes(value)
    ? props.modelValue.filter((entry) => entry !== value)
    : [...props.modelValue, value])
}
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button variant="outline" size="sm" :class="modelValue.length ? 'border-primary/40' : ''">
        <span class="text-muted-foreground">{{ label }}:</span>
        <span class="max-w-44 truncate">{{ chosen.length ? chosen.join(', ') : 'Any' }}</span>
        <ChevronDown class="h-3.5 w-3.5 text-muted-foreground" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" class="w-60">
      <DropdownMenuItem
        v-for="option in options"
        :key="option.value"
        role="menuitemcheckbox"
        :aria-checked="modelValue.includes(option.value)"
        class="cursor-pointer"
        @select.prevent="toggle(option.value)"
      >
        <span
          class="grid size-4 shrink-0 place-items-center rounded border"
          :class="modelValue.includes(option.value) ? 'border-primary bg-primary text-primary-foreground' : 'border-input'"
        ><Check v-if="modelValue.includes(option.value)" class="size-3" /></span>
        {{ option.label }}
        <span v-if="option.count !== undefined" class="ml-auto text-xs tabular-nums text-muted-foreground">{{ option.count }}</span>
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem class="cursor-pointer" :disabled="!modelValue.length" @select="emit('update:modelValue', [])">
        <X class="h-3.5 w-3.5" /> Clear
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
