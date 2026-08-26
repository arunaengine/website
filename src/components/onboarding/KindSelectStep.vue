<script setup lang="ts">
// Reusable radio-card selector (aruna#277). Every option (including all trust
// copy and badges) arrives as data, so the device-enrollment flow (aruna#271)
// reuses it with its own single "User device" option set. No onboarding copy or
// API calls live here.
import { computed, ref, type ComponentPublicInstance } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import { AlertTriangle } from '@lucide/vue'
import type { BadgeVariant } from '@/components/nodes/node-display'

export interface KindOption {
  value: string
  title: string
  description: string
  badgeLabel?: string
  badgeVariant?: BadgeVariant
  // Amber trust note rendered under the card.
  warning?: string
}

const props = defineProps<{ options: KindOption[]; modelValue: string | null; disabled?: boolean }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>()

const buttons = ref<(HTMLButtonElement | null)[]>([])
function setButtonRef(el: Element | ComponentPublicInstance | null, index: number) {
  buttons.value[index] = el as HTMLButtonElement | null
}

const selectedIndex = computed(() => props.options.findIndex((o) => o.value === props.modelValue))

function select(value: string) {
  if (props.disabled) return
  emit('update:modelValue', value)
}

// Roving-focus arrow navigation: move selection and focus together, wrapping;
// standard radiogroup keyboard behaviour.
function onKey(event: KeyboardEvent, index: number) {
  if (props.disabled) return
  if (event.key === ' ' || event.key === 'Enter') {
    event.preventDefault()
    select(props.options[index].value)
    return
  }
  const count = props.options.length
  let next = -1
  if (event.key === 'ArrowDown' || event.key === 'ArrowRight') next = (index + 1) % count
  else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') next = (index - 1 + count) % count
  if (next < 0) return
  event.preventDefault()
  select(props.options[next].value)
  buttons.value[next]?.focus()
}

// The selected card holds tabindex 0; when nothing is selected the first card is
// the tab stop.
function tabindexFor(index: number): number {
  if (selectedIndex.value === -1) return index === 0 ? 0 : -1
  return index === selectedIndex.value ? 0 : -1
}
</script>

<template>
  <div role="radiogroup" class="space-y-3">
    <div v-for="(option, index) in options" :key="option.value">
      <button
        :ref="(el) => setButtonRef(el, index)"
        type="button"
        role="radio"
        :aria-checked="option.value === modelValue"
        :tabindex="tabindexFor(index)"
        :disabled="disabled"
        :class="[
          'flex w-full items-start gap-3 rounded-lg border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60',
          option.value === modelValue
            ? 'border-primary/60 bg-primary/[0.06] ring-1 ring-inset ring-primary/30'
            : 'border-border bg-background hover:border-primary/40 hover:bg-muted/40',
        ]"
        @click="select(option.value)"
        @keydown="onKey($event, index)"
      >
        <span
          :class="[
            'mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border',
            option.value === modelValue ? 'border-primary' : 'border-muted-foreground/50',
          ]"
          aria-hidden="true"
        >
          <span v-if="option.value === modelValue" class="h-2 w-2 rounded-full bg-primary" />
        </span>
        <span class="min-w-0 flex-1">
          <span class="flex flex-wrap items-center gap-2">
            <span class="font-display text-sm font-semibold text-aruna-navy">{{ option.title }}</span>
            <Badge
              v-if="option.badgeLabel"
              :variant="option.badgeVariant ?? 'outline'"
              class="text-[10px] uppercase"
            >
              {{ option.badgeLabel }}
            </Badge>
          </span>
          <span class="mt-1 block text-xs leading-relaxed text-muted-foreground">{{ option.description }}</span>
        </span>
      </button>
      <div
        v-if="option.warning"
        class="mt-1.5 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] leading-relaxed text-amber-800 dark:text-amber-300"
      >
        <AlertTriangle class="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>{{ option.warning }}</span>
      </div>
    </div>
  </div>
</template>
