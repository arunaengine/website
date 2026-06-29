<script setup lang="ts">
import {
  SelectRoot,
  SelectTrigger,
  SelectValue,
  SelectPortal,
  SelectContent,
  SelectViewport,
  SelectItem,
  SelectItemText,
  SelectItemIndicator,
  SelectIcon,
  type SelectRootProps,
  useForwardPropsEmits,
} from 'radix-vue'
import { Check, ChevronDown } from '@lucide/vue'
import { computed } from 'vue'
import { cn } from '@/lib/utils'

interface Option {
  value: string
  label: string
}

const props = defineProps<
  SelectRootProps & {
    options: Option[]
    placeholder?: string
    class?: string
  }
>()
const emits = defineEmits<{ (e: 'update:modelValue', v: string): void }>()
const forwarded = useForwardPropsEmits(props, emits)
const triggerClasses = computed(() =>
  cn(
    'flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-field px-3 py-2 text-sm shadow-sm ring-offset-background data-[placeholder]:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring',
    props.class,
  ),
)
</script>

<template>
  <SelectRoot v-bind="forwarded">
    <SelectTrigger :class="triggerClasses">
      <SelectValue :placeholder="placeholder" />
      <SelectIcon><ChevronDown class="h-4 w-4 opacity-60" /></SelectIcon>
    </SelectTrigger>
    <SelectPortal>
      <SelectContent
        position="popper"
        :side-offset="4"
        class="relative z-50 max-h-96 min-w-[10rem] overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
      >
        <SelectViewport class="p-1">
          <SelectItem
            v-for="o in options"
            :key="o.value"
            :value="o.value"
            class="relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-muted data-[state=checked]:bg-muted"
          >
            <span class="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
              <SelectItemIndicator><Check class="h-3.5 w-3.5" /></SelectItemIndicator>
            </span>
            <SelectItemText>{{ o.label }}</SelectItemText>
          </SelectItem>
        </SelectViewport>
      </SelectContent>
    </SelectPortal>
  </SelectRoot>
</template>
